export interface Lead {
  id: string
  job_url: string
  company_url?: string
  company_website?: string
  role_title?: string
  company_name?: string
  job_description?: string
  contact_name?: string
  contact_title?: string
  contact_linkedin_url?: string
  contact_email?: string | null
  status: string
  error_message?: string
  jobId?: string
}

export interface BaseEvent {
  jobId: string
  query: string
  role: string
  location: string
}

export interface JobUrlsCollectedEvent extends BaseEvent {
  jobUrls: {
    url: string
    jobId: string
    title?: string
  }[]
  count: number
}

export interface JobDetailsScrapedEvent extends BaseEvent {
  leadsCount: number
  processedCount: number
  skippedCount: number
  errorCount: number
}

export interface ApolloEmailsUpdatedEvent extends BaseEvent {
  totalLeads: number
  emailsFound: number
  errors: number
  leadIds?: string[]
}

export interface EmailScheduledEvent extends BaseEvent {
  totalScheduled: number
  scheduledLeads: {
    id: string
    company?: string
    role?: string
    contact?: string
    email: string
    scheduledFor: Date
  }[]
}

// Add missing interfaces from step files
export interface JobQuery extends BaseEvent {
  limit: number
  google_dorks: string[]
}

export interface JobUrl {
  url: string
  jobId: string
  title?: string
}

export interface JobPageDetails {
  job_url: string
  role_title?: string
  company_name?: string
  job_description?: string
  company_url?: string
}

export interface CompanyPageDetails {
  company_url: string
  company_website?: string
  company_name?: string
  founders: FounderInfo[]
}

export interface FounderInfo {
  name?: string
  title?: string
  linkedin_url?: string
}

export interface SearchOptions {
  dork: string
  startIndex: number
  maxResults: number
}

export interface EmailTemplate {
  subject: string
  body: string
}
