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
}

export interface BaseEvent {
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
  leadIds?: string[] // For processing specific leads
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
