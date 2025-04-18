import { createClient } from '@supabase/supabase-js'

// Note: In a production environment, these should be environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type EmailType = {
  id: string
  lead_id: string | null
  sent_at: string
  resend_message_id: string | null
  status: string
  template_used: string | null
  to_email: string
  subject: string | null
  scheduled_at: string | null
  delivery_metrics: { retries: number }
  attachments: string[] | null
  body: string | null
  body_1: string | null
  body_2: string | null
  body_3: string | null
  approved_variation: number | null
  bcc: string | null
  email_tracking_id: string | null
  is_approved: boolean | null
}

export type TemplateType = {
  id: string
  name: string
  subject: string
  body: string
  created_at?: string
  updated_at?: string
}

export type LeadType = {
  id: string
  job_url: string
  company_url: string | null
  company_website: string | null
  role_title: string | null
  company_name: string | null
  job_description: string | null
  contact_name: string | null
  contact_title: string | null
  contact_linkedin_url: string | null
  contact_email: string | null
  status: string
  error_message: string | null
  created_at: string
  updated_at: string
}
