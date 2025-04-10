import { SupabaseClient } from '@supabase/supabase-js'
import { Lead } from '../types/common'
import {
  extractCoreRole,
  extractFirstName,
  normalizeTemplatePadding,
} from './string'

export interface EmailTemplate {
  subject: string
  body: string
}

/**
 * Generate a personalized email template based on lead information
 */
export async function generateEmailTemplate(
  lead: Lead,
  senderName: string,
  supabase: SupabaseClient,
  templateName: string = 'default_outreach'
): Promise<EmailTemplate> {
  // Fetch template from Supabase
  const { data: templateData, error: templateError } = await supabase
    .from('templates')
    .select('*')
    .eq('name', templateName)
    .single()

  if (templateError || !templateData) {
    throw new Error(
      `Failed to retrieve ${templateName} template: ${
        templateError?.message || 'Template not found'
      }`
    )
  }

  // Get first name of contact instead of full name
  const contactFirstName = extractFirstName(lead.contact_name) || 'there'
  const companyName = lead.company_name || 'your company'

  // Extract core role title (e.g., "Founding Engineer" from "Founding Engineer (Fullstack / AI)")
  const roleName = extractCoreRole(lead.role_title) || 'the open position'

  // Get first name of sender
  const senderFirstName = extractFirstName(senderName) || senderName

  // Replace placeholders in template using {variable_name} format
  let subject = templateData.subject
    .replace(/{role}/g, roleName)
    .replace(/{company_name}/g, companyName)

  let body = templateData.body
    .replace(/{contact_name}/g, contactFirstName) // Always use first name for greeting
    .replace(/{contact_first_name}/g, contactFirstName)
    .replace(/{role}/g, roleName)
    .replace(/{company_name}/g, companyName)
    .replace(/{sender_name}/g, senderName)
    .replace(/{sender_first_name}/g, senderFirstName)

  // Fix padding issues in the template
  body = normalizeTemplatePadding(body)

  return {
    subject,
    body,
  }
}

/**
 * Calculate a reasonable date to schedule the email
 * This implementation schedules for the next business day at a random time
 */
export function calculateScheduleDate(): Date {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // If tomorrow is weekend, schedule for Monday
  const day = tomorrow.getDay()
  if (day === 0) {
    // Sunday
    tomorrow.setDate(tomorrow.getDate() + 1)
  } else if (day === 6) {
    // Saturday
    tomorrow.setDate(tomorrow.getDate() + 2)
  }

  // Set to business hours (9 AM - 4 PM)
  const hour = 9 + Math.floor(Math.random() * 7) // Random hour between 9-16
  const minute = Math.floor(Math.random() * 60)

  tomorrow.setHours(hour, minute, 0, 0)

  return tomorrow
}
