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
  bcc: string | null
  email_tracking_id: string | null
  is_approved: boolean | null
}
