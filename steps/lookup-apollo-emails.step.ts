import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

export const config: StepConfig = {
  type: 'event',
  name: 'Apollo Email Lookup',
  description:
    'Looks up emails for leads with LinkedIn URLs using Apollo.io API',
  subscribes: ['job.details.scraped'],
  emits: ['apollo.emails.updated'],
  flows: ['job-search'],
}

interface JobDetailsScrapedEvent {
  query: string
  role: string
  location: string
  leadsCount: number
  processedCount: number
  skippedCount: number
  errorCount: number
}

interface Lead {
  id: string
  job_url: string
  company_url?: string
  company_website?: string
  role_title?: string
  company_name?: string
  contact_name?: string
  contact_title?: string
  contact_linkedin_url?: string
  contact_email?: string
  status: string
}

export async function handler(args: JobDetailsScrapedEvent, ctx: any) {
  ctx.logger.info(
    `Processing Apollo email lookups for ${args.leadsCount} leads`
  )

  // Verify Apollo API key is present
  const apolloApiKey = process.env.APOLLO_API_KEY
  if (!apolloApiKey) {
    ctx.logger.error('Apollo API key not found in environment variables')
    throw new Error('APOLLO_API_KEY environment variable is required')
  }

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    ctx.logger.error('Supabase credentials not found in environment variables')
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Query leads with LinkedIn URLs but no emails
  const { data: leads, error: queryError } = await supabase
    .from('leads')
    .select('id, contact_linkedin_url, contact_name, company_name, role_title')
    .is('contact_email', null)
    .not('contact_linkedin_url', 'is', null)
    .eq('status', 'Scraped')
    .limit(100) // Process in batches to avoid rate limits

  if (queryError) {
    ctx.logger.error(`Error querying leads: ${queryError.message}`)
    throw queryError
  }

  if (!leads || leads.length === 0) {
    ctx.logger.info('No leads found that need email lookup')
    await ctx.emit({
      topic: 'apollo.emails.updated',
      data: {
        query: args.query,
        role: args.role,
        location: args.location,
        totalLeads: leads.length,
        emailsFound: 0,
        errors: 0,
      },
    })
    return { emailsFound: 0, totalLeads: 0 }
  }

  ctx.logger.info(`Found ${leads.length} leads that need email lookup`)

  let emailsFound = 0
  let errors = 0

  // Process each lead
  for (const lead of leads) {
    try {
      if (!lead.contact_linkedin_url) continue

      ctx.logger.info(
        `Looking up email for ${lead.contact_name || 'contact'} at ${
          lead.company_name || 'company'
        }`
      )

      // Call Apollo API to get email
      const email = await getEmailFromLinkedIn(
        lead.contact_linkedin_url,
        apolloApiKey,
        ctx.logger
      )

      if (email) {
        // Update the lead with the found email
        const { error: updateError } = await supabase
          .from('leads')
          .update({
            contact_email: email,
            status: 'Email Found',
          })
          .eq('id', lead.id)

        if (updateError) {
          ctx.logger.error(
            `Error updating lead with email: ${updateError.message}`
          )
          errors++
        } else {
          emailsFound++
          ctx.logger.info(`Updated lead with email: ${email}`)
        }
      } else {
        // Update status to indicate email lookup was attempted but not found
        const { error: updateError } = await supabase
          .from('leads')
          .update({ status: 'Email Not Found' })
          .eq('id', lead.id)

        if (updateError) {
          ctx.logger.error(`Error updating lead status: ${updateError.message}`)
          errors++
        }
      }

      // Add a small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      ctx.logger.error(`Error processing lead ${lead.id}: ${error}`)
      errors++
    }
  }

  ctx.logger.info(
    `Finished processing. Found ${emailsFound} emails out of ${leads.length} leads. Errors: ${errors}`
  )

  // Emit results
  await ctx.emit({
    topic: 'apollo.emails.updated',
    data: {
      query: args.query,
      role: args.role,
      location: args.location,
      totalLeads: leads.length,
      emailsFound,
      errors,
    },
  })

  return {
    totalLeads: leads.length,
    emailsFound,
    errors,
  }
}

/**
 * Use Apollo.io API to get email address from a LinkedIn profile URL
 */
async function getEmailFromLinkedIn(
  linkedinUrl: string,
  apiKey: string,
  logger: any
): Promise<string | null> {
  if (!linkedinUrl) {
    logger.warning('No LinkedIn URL provided')
    return null
  }

  try {
    logger.info(`Looking up email for LinkedIn URL: ${linkedinUrl}`)

    // Prepare the request to Apollo's people/match endpoint
    const url = 'https://api.apollo.io/v1/people/match'
    const payload = {
      api_key: apiKey,
      linkedin_url: linkedinUrl,
    }

    // Make the request
    const response = await axios.post(url, payload)

    // Parse the response
    const data = response.data

    // Check if we got a person record
    if (data.person) {
      const person = data.person

      // Check for email
      const email = person.email
      if (email) {
        logger.info(`Found email for ${linkedinUrl}: ${email}`)
        return email
      }

      // If no direct email, look in contact details
      const contactInfo = person.contact_info || {}
      const emailFromContact = contactInfo.email
      if (emailFromContact) {
        logger.info(
          `Found email from contact info for ${linkedinUrl}: ${emailFromContact}`
        )
        return emailFromContact
      }
    }

    logger.warning(`No email found for LinkedIn URL: ${linkedinUrl}`)
    return null
  } catch (error) {
    logger.error(`Error during Apollo API call: ${error}`)
    return null
  }
}
