# Founder Flow Automation: Motia Implementation PRD

## Overview

This document outlines the migration of the Founder Flow automation system from ControlFlow to Motia with Marvin functions. The system automates finding job postings on WorkAtAStartup.com, identifying founder/CEO contacts, and sending personalized emails.

## Goals

1. Reduce token usage by replacing agentic flows with deterministic steps
2. Maintain all existing functionality while improving performance
3. Leverage Motia's event-driven architecture for better scalability
4. Use Marvin functions for targeted NLP tasks instead of general agents

## Data Models

We will maintain the same data models currently defined in `models.py`:

- `JobQuery`: Query parameters with role, location, and limit
- `JobPageDetails`: Scraped job listing data
- `CompanyPageDetails`: Scraped company information
- `Lead`: Complete lead information with contact details
- `Job`: Overall job search information
- `EmailTemplate`: Email template with variables
- `EmailLog`: Record of sent emails

## Database Schema

The Supabase database contains the following tables:

```sql
-- Main jobs table to track search queries
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_query TEXT NOT NULL,
  parsed_role TEXT,
  parsed_location TEXT DEFAULT 'remote',
  parsed_filters JSONB DEFAULT '[]',
  google_dorks JSONB DEFAULT '[]',
  status TEXT DEFAULT 'Pending',
  error_message TEXT,
  last_processed_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leads extracted from job listings
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id),
  job_url TEXT NOT NULL,
  company_url TEXT,
  role_title TEXT,
  company_name TEXT,
  job_description TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_linkedin_url TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'Pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email templates for outreach
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log of sent emails
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_used TEXT NOT NULL,
  body TEXT,
  tracking_id TEXT,
  status TEXT DEFAULT 'Pending',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Motia Flow Architecture

The system will be implemented as a Motia flow with the following steps:

### 1. Query Processing Flow

**Steps:**

1. `query-api.step.ts`: REST API endpoint receiving the user query
2. `query-parser.step.ts`: Marvin function to extract structured data from natural language
3. `search-plan-generator.step.ts`: Generate Google dorks for efficient searching using a combination of rule-based patterns and Marvin suggestions
4. `search-executor.step.ts`: Execute search using SERP API to collect job URLs
5. `job-saver.step.ts`: Save job in database with initial status using the Supabase schema above

**Events:**

- `query.received`: Initial user query submitted
- `query.parsed`: Structured query data extracted
- `search.planned`: Google dorks generated
- `search.executed`: Job URLs collected
- `job.started`: Job saved to database
- `job.error`: Error encountered during job processing

### 2. Lead Collection Flow

**Steps:**

1. `job-url-processor.step.ts`: Process each job URL from search results
2. `job-page-scraper.step.ts`: Scrape job listing details
3. `company-page-scraper.step.ts`: Scrape company information using Playwright, extracting company name and founders with their LinkedIn profiles
4. `contact-finder.step.ts`: Identify founders/CEOs from company page
5. `email-finder.step.ts`: Find email addresses using Apollo.io API to match LinkedIn profiles to email addresses
6. `lead-saver.step.ts`: Save lead in database

**Events:**

- `job-url.processing`: Processing a specific job URL
- `job-details.scraped`: Job listing details extracted
- `company-details.scraped`: Company information extracted
- `contact.found`: Founder/CEO identified
- `email.found`: Email address located
- `lead.saved`: Lead information saved to database
- `lead.error`: Error encountered during lead processing

### 3. Email Outreach Flow

**Steps:**

1. `lead-selector.step.ts`: Select leads ready for email
2. `template-selector.step.ts`: Select appropriate email template
3. `email-personalizer.step.ts`: Personalize email using lead data
4. `email-sender.step.ts`: Schedule email for later
5. `email-logger.step.ts`: Log email status in database

**Events:**

- `lead.selected`: Lead chosen for outreach
- `template.selected`: Email template chosen
- `email.personalized`: Email content prepared
- `email.sent`: Email successfully sent
- `email.failed`: Email sending failed
- `email.logged`: Email status logged

## Marvin Function Integration

Marvin functions provide targeted AI capabilities within the Motia architecture. Unlike the previous approach using general AI agents, we'll use specific functions for high-value tasks:

### Integration Pattern

```typescript
// 1. Define Marvin function endpoint in a central config
const MARVIN_FUNCTIONS = {
  parseJobQuery: process.env.MARVIN_ENDPOINT + '/functions/parse_job_query',
  generateSearchDorks:
    process.env.MARVIN_ENDPOINT + '/functions/generate_search_dorks',
  personalizeEmail:
    process.env.MARVIN_ENDPOINT + '/functions/personalize_email',
}

// 2. Create utility for calling Marvin functions
async function callMarvinFunction(functionName, params) {
  try {
    const response = await axios.post(MARVIN_FUNCTIONS[functionName], params)
    return response.data.result
  } catch (error) {
    console.error(
      `Error calling Marvin function ${functionName}:`,
      error.message
    )
    throw new MarvinFunctionError(
      `Failed to call ${functionName}: ${error.message}`
    )
  }
}

// 3. Use in step handlers with proper error handling
export default Step.eventDriven({
  subscriptions: ['query.received'],
  async handler(event) {
    try {
      const { query } = event.data

      // Call Marvin function to extract structured parameters
      const parsedQuery = await callMarvinFunction('parseJobQuery', { query })

      return this.emit('query.parsed', {
        rawQuery: query,
        parsedQuery,
      })
    } catch (error) {
      return this.emit('query.error', {
        rawQuery: event.data.query,
        error: error.message,
      })
    }
  },
})
```

### Key Marvin Functions

1. **Query Parsing**

   ```python
   @marvin.fn
   def parse_job_query(query: str) -> JobQuery:
       """
       Extract structured job search parameters from natural language query.

       Args:
           query: A natural language query like "find founding engineer roles in San Francisco"

       Returns:
           A JobQuery object with role, location and limit
       """
   ```

2. **Search Dork Generation**

   ```python
   @marvin.fn
   def generate_search_dorks(role: str, location: str = "remote") -> List[str]:
       """
       Generate advanced search queries for WorkAtAStartup job listings.

       Args:
           role: Job role/title to search for
           location: Location preference

       Returns:
           List of Google search queries (dorks) for finding job listings
       """
   ```

3. **Email Personalization**

   ```python
   @marvin.fn
   def personalize_email(template: EmailTemplate, lead: Lead) -> dict:
       """
       Personalize email template with lead information.

       Args:
           template: Email template with variables like {{role}}, {{company}}
           lead: Lead information with company and contact details

       Returns:
           Dict with personalized subject and body
       """
   ```

## Core Step Implementations

### Query Parser Step

```typescript
// query-parser.step.ts
import { Step } from '@motia/core'

export default Step.eventDriven({
  subscriptions: ['query.received'],
  async handler(event) {
    try {
      const { query } = event.data

      // Call Marvin function to extract structured parameters
      const parsedQuery = await callMarvinFunction('parseJobQuery', { query })

      return this.emit('query.parsed', {
        rawQuery: query,
        parsedQuery,
      })
    } catch (error) {
      return this.emit('query.error', {
        rawQuery: event.data.query,
        error: error.message,
      })
    }
  },
})
```

### Search Executor Step

```typescript
// search-executor.step.ts
import { Step } from '@motia/core'
import axios from 'axios'

export default Step.eventDriven({
  subscriptions: ['search.planned'],
  async handler(event) {
    try {
      const { googleDorks, parsedQuery } = event.data
      const limit = parsedQuery.limit || 10
      const jobUrls = []

      // Process dorks in sequence with error handling for each
      for (const dork of googleDorks) {
        if (jobUrls.length >= limit) break

        try {
          // Call SERP API
          const response = await axios.get('https://serpapi.com/search', {
            params: {
              engine: 'google',
              q: dork,
              api_key: process.env.SERP_API_KEY,
              num: Math.ceil(limit / googleDorks.length) * 2,
            },
          })

          // Extract job URLs from results
          const results = response.data.organic_results || []
          for (const result of results) {
            const url = result.link
            if (
              url?.includes('workatastartup.com/jobs/') &&
              !jobUrls.includes(url)
            ) {
              jobUrls.push(url)
              if (jobUrls.length >= limit) break
            }
          }
        } catch (dorkError) {
          console.error(
            `Error searching with dork "${dork}":`,
            dorkError.message
          )
          // Continue with next dork
        }
      }

      if (jobUrls.length === 0) {
        return this.emit('search.empty', { ...event.data })
      }

      return this.emit('search.executed', {
        ...event.data,
        jobUrls,
      })
    } catch (error) {
      return this.emit('search.error', {
        ...event.data,
        error: error.message,
      })
    }
  },
})
```

### Email Finder Step

```typescript
// email-finder.step.ts
import { Step } from '@motia/core'
import axios from 'axios'

export default Step.eventDriven({
  subscriptions: ['contact.found'],
  async handler(event) {
    const { contactLinkedinUrl } = event.data

    if (!contactLinkedinUrl) {
      return this.emit('email.found', {
        ...event.data,
        contactEmail: null,
        emailStatus: 'EmailNotFound',
      })
    }

    try {
      // Call Apollo API to get email
      const response = await axios.post(
        'https://api.apollo.io/v1/people/match',
        {
          api_key: process.env.APOLLO_API_KEY,
          linkedin_url: contactLinkedinUrl,
        }
      )

      const { person } = response.data
      const email = person?.email || person?.contact_info?.email

      return this.emit('email.found', {
        ...event.data,
        contactEmail: email,
        emailStatus: email ? 'ReadyToSend' : 'EmailNotFound',
        personDetails: person
          ? {
              firstName: person.first_name,
              lastName: person.last_name,
              title: person.title,
              company: person.organization?.name,
            }
          : null,
      })
    } catch (error) {
      return this.emit('email.error', {
        ...event.data,
        error: error.message,
      })
    }
  },
})
```

## Error Handling Strategy

All steps should implement a consistent error handling pattern:

1. **Try/Catch Blocks**:

   ```typescript
   try {
     // Step logic
   } catch (error) {
     // Error handling
     return this.emit(`${domain}.error`, {
       ...event.data,
       error: error.message,
     })
   }
   ```

2. **Specific Error Events**:

   - Name pattern: `{domain}.error`
   - Payload should include original data plus error information
   - Add error type/category when possible for better monitoring

3. **Retry Mechanism**:

   ```typescript
   // Configure step with retry options
   export default Step.eventDriven({
     subscriptions: ['template.selected'],
     retryOptions: {
       maxRetries: 3,
       retryDelay: 1000,
       retryMultiplier: 2,
       retryCondition: (error) => !error.message.includes('not found'),
     },
     async handler(event) {
       // Step logic
     },
   })
   ```

4. **Fallback Strategies**:
   - Always provide default values for missing data
   - Implement circuit-breaking for failing external services
   - Use "human in the loop" flags for critical failures

## Implementation Plan

1. **Phase 1: Data Models and Tools**

   - Migrate existing data models
   - Adapt tool functions for Motia compatibility
   - Implement Marvin functions for NLP tasks
   - Set up database schema in Supabase (already exists)

2. **Phase 2: Step Implementation**

   - Implement individual steps following Motia patterns
   - Create configuration for each step
   - Implement event payloads and topics
   - Test each step individually

3. **Phase 3: Flow Integration**

   - Connect steps into cohesive flows
   - Implement error handling and retries
   - Configure logging and monitoring
   - Test end-to-end flows

4. **Phase 4: API and UI**
   - Implement REST API endpoints
   - Create basic UI for monitoring and control
   - Add authentication if needed
   - Deploy and monitor

## Configuration Requirements

```
# API Keys
APOLLO_API_KEY=2bO3aKVamZJXQQVScDjuoA
EMAIL_API_KEY=your_email_api_key

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Email Configuration
SENDER_EMAIL=your_sender_email
SENDER_NAME=Your Name

# Motia Configuration
MOTIA_ENV=development
MOTIA_LOG_LEVEL=info

# Marvin Configuration
MARVIN_ENDPOINT=your_marvin_endpoint
MARVIN_API_KEY=your_marvin_api_key
```

## Monitoring and Debugging

- Each step should log input and output for debugging
- Implement step-specific metrics for performance tracking
- Create dashboard for visualizing flow execution
- Set up alerts for common failure patterns

## Error Handling Strategy

1. Retry transient failures (network issues, rate limits)
2. Fallback strategies for common failure modes
3. Clear error messages with actionable information
4. Manual intervention flags for complex issues
5. Comprehensive logging for troubleshooting
