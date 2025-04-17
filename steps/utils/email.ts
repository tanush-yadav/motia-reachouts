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

// Interface for follow-up email preparation
export interface FollowupEmailInput {
  originalEmailId: string;
  lead: Lead;
  templateName?: string;
  followupDays?: number;
}

// Interface for follow-up result
export interface FollowupResult {
  success: boolean;
  followupId?: string;
  scheduledFor?: Date;
  reason?: string;
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

/**
 * Calculate follow-up date based on the original email sent date
 * @param sentDate Original email sent date
 * @param daysToAdd Number of days to add (default: 3)
 * @returns The calculated follow-up date
 */
export function calculateFollowupDate(sentDate: Date, daysToAdd: number = 3): Date {
  const followupDate = new Date(sentDate);
  followupDate.setDate(followupDate.getDate() + daysToAdd);
  return followupDate;
}

/**
 * Prepare a follow-up email from an original email
 * This utility encapsulates the logic of scheduling follow-up emails
 * @param supabase Supabase client
 * @param params Parameters for follow-up (originalEmailId, lead, templateName, followupDays)
 * @param logger Optional logger
 * @returns Result object with success status and details
 */
export async function prepareFollowupEmail(
  supabase: SupabaseClient,
  params: FollowupEmailInput,
  logger?: any
): Promise<FollowupResult> {
  const { originalEmailId, lead, templateName = 'first_follow_up', followupDays = 3 } = params;

  try {
    // Step 1: Fetch the original email
    const { data: originalEmail, error: fetchError } = await supabase
      .from('emails')
      .select('id, sent_at, is_followup, has_followup_scheduled, subject, lead_id, to_email, thread_id')
      .eq('id', originalEmailId)
      .single();

    if (fetchError) {
      throw new Error(`Error fetching original email ${originalEmailId}: ${fetchError.message}`);
    }

    if (!originalEmail) {
      throw new Error(`Original email ${originalEmailId} not found.`);
    }

    // Step 2: Check eligibility for follow-up
    if (originalEmail.is_followup) {
      if (logger) logger.info(`Email ${originalEmailId} is already a follow-up. No further follow-up will be scheduled.`);
      return { success: false, reason: 'already_a_followup' };
    }

    if (originalEmail.has_followup_scheduled) {
      if (logger) logger.info(`Email ${originalEmailId} already has a follow-up scheduled.`);
      return { success: false, reason: 'followup_already_scheduled' };
    }

    if (!originalEmail.sent_at) {
      throw new Error(`Original email ${originalEmailId} missing sent_at timestamp.`);
    }

    // Step 3: Get template
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('name', templateName)
      .single();

    if (templateError || !template) {
      throw new Error(`Error fetching follow-up template: ${templateError?.message || 'Template not found'}`);
    }

    // Step 4: Personalize template
    const contactFirstName = extractFirstName(lead.contact_name) || 'there';
    const companyName = lead.company_name || 'your company';

    let personalizedBody = template.body
      .replace(/{contact_name}/g, contactFirstName)
      .replace(/{contact_first_name}/g, contactFirstName)
      .replace(/{company_name}/g, companyName);

    personalizedBody = normalizeTemplatePadding(personalizedBody);

    // Step 5: Calculate follow-up date
    const sentDate = new Date(originalEmail.sent_at);
    const followupDate = calculateFollowupDate(sentDate, followupDays);

    // Step 6: Create follow-up email object
    const followupEmail = {
      lead_id: originalEmail.lead_id,
      to_email: originalEmail.to_email,
      subject: `Re: ${originalEmail.subject}`,
      body: personalizedBody,
      template_used: template.name,
      status: 'Scheduled',
      scheduled_at: followupDate.toISOString(),
      is_approved: null,
      original_email_id: originalEmailId,
      thread_id: originalEmail.thread_id,
      is_followup: true
    };

    // Step 7: Insert into database
    const { data: newFollowup, error: insertError } = await supabase
      .from('emails')
      .insert(followupEmail)
      .select()
      .single();

    if (insertError) {
      throw new Error(`Error creating follow-up email: ${insertError.message}`);
    }

    // Step 8: Mark original email as having follow-up
    const { error: updateError } = await supabase
      .from('emails')
      .update({ has_followup_scheduled: true })
      .eq('id', originalEmailId);

    if (updateError) {
      throw new Error(`Error updating original email: ${updateError.message}`);
    }

    if (logger) logger.info(`Successfully scheduled follow-up email for ${originalEmailId}`);

    return {
      success: true,
      followupId: newFollowup.id,
      scheduledFor: followupDate
    };
  } catch (error) {
    if (logger) logger.error(`Error preparing follow-up email: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
