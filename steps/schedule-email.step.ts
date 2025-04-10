import { StepConfig } from '@motiadev/core'
import { LeadStatus } from './constants/lead-status'
import { ApolloEmailsUpdatedEvent, EmailScheduledEvent } from './types/common'
import { ensureTableExists } from './utils/database'
import { calculateScheduleDate, generateEmailTemplate } from './utils/email'
import { getOptionalEnv, getRequiredEnv } from './utils/env'
import { initSupabaseClient } from './utils/supabase'

export const config: StepConfig = {
  type: 'event',
  name: 'Email Scheduler',
  description:
    'Schedules personalized outreach emails for leads with found emails',
  subscribes: ['apollo.emails.updated'],
  emits: ['email.scheduled'],
  flows: ['job-search'],
}

export async function handler(args: ApolloEmailsUpdatedEvent, ctx: any) {
  try {
    ctx.logger.info(
      `Processing leads for email scheduling. ${args.emailsFound} emails were found.`
    )

    if (args.emailsFound === 0) {
      ctx.logger.info('No emails found to schedule outreach for')
      return { scheduledEmails: 0 }
    }

    // Initialize Supabase client
    const supabase = initSupabaseClient(ctx.logger)

    // Get the user's name and email for the outreach
    const senderName = getOptionalEnv('SENDER_NAME', 'Job Seeker')
    const senderEmail = getRequiredEnv('SENDER_EMAIL', ctx.logger)

    // Query leads with found emails that are ready for outreach
    let query = supabase
      .from('leads')
      .select('*')
      .eq('status', LeadStatus.EMAIL_FOUND)
      .not('contact_email', 'is', null)

    // If leadIds is provided, filter by those specific leads
    if (args.leadIds && args.leadIds.length > 0) {
      ctx.logger.info(
        `Processing ${args.leadIds.length} specific leads from previous step`
      )
      query = query.in('id', args.leadIds)
    } else {
      ctx.logger.info(
        'No specific leads provided, processing latest emails found'
      )
      query = query.limit(50) // Process in reasonable batches
    }

    const { data: leads, error: queryError } = await query

    if (queryError) {
      ctx.logger.error(`Error querying leads: ${queryError.message}`)
      throw queryError
    }

    if (!leads || leads.length === 0) {
      ctx.logger.info('No leads found that are ready for email outreach')
      return { scheduledEmails: 0 }
    }

    ctx.logger.info(`Found ${leads.length} leads ready for email outreach`)

    let scheduledEmails = 0
    let scheduledLeads = []

    // Verify emails table exists
    await ensureTableExists(
      supabase,
      'emails',
      'create_emails_if_not_exists',
      ctx.logger
    )

    // Process each lead
    for (const lead of leads) {
      try {
        // Validate lead has required fields
        if (!lead.contact_email) {
          ctx.logger.warn(`Skipping lead ${lead.id}: No contact email`)
          continue
        }

        // Generate personalized email template
        const emailTemplate = await generateEmailTemplate(
          lead,
          senderName,
          supabase
        )

        // Schedule the email
        const scheduledDate = calculateScheduleDate()

        ctx.logger.info(`Preparing to schedule email for lead ${lead.id}`)

        // For now, we'll just save the scheduled email to Supabase
        const { data: insertData, error: insertError } = await supabase
          .from('emails')
          .insert({
            lead_id: lead.id,
            to_email: lead.contact_email,
            to_name: lead.contact_name || 'Hiring Manager',
            from_email: senderEmail,
            from_name: senderName,
            subject: emailTemplate.subject,
            body: emailTemplate.body,
            scheduled_at: scheduledDate,
            status: 'Scheduled',
          })
          .select()

        if (insertError) {
          ctx.logger.error(
            `Error scheduling email for lead ${lead.id}: ${insertError.message}`
          )
          continue
        }

        ctx.logger.info(
          `Email scheduled with ID: ${insertData?.[0]?.id || 'unknown'}`
        )

        // Update lead status to indicate email is scheduled
        const { error: updateError } = await supabase
          .from('leads')
          .update({ status: LeadStatus.EMAIL_SCHEDULED })
          .eq('id', lead.id)

        if (updateError) {
          ctx.logger.error(
            `Error updating lead status for lead ${lead.id}: ${updateError.message}`
          )
          continue
        }

        ctx.logger.info(
          `Successfully updated lead ${lead.id} status to '${LeadStatus.EMAIL_SCHEDULED}'`
        )

        scheduledEmails++
        scheduledLeads.push({
          id: lead.id,
          company: lead.company_name,
          role: lead.role_title,
          contact: lead.contact_name,
          email: lead.contact_email,
          scheduledFor: scheduledDate,
        })

        ctx.logger.info(
          `Successfully scheduled email for ${
            lead.contact_name || 'contact'
          } at ${lead.company_name || 'company'}`
        )
      } catch (error) {
        ctx.logger.error(
          `Error processing lead ${lead.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }

    ctx.logger.info(`Finished processing. Scheduled ${scheduledEmails} emails.`)

    // Prepare event data
    const eventData: EmailScheduledEvent = {
      query: args.query,
      role: args.role,
      location: args.location,
      totalScheduled: scheduledEmails,
      scheduledLeads: scheduledLeads,
    }

    // Emit results
    await ctx.emit({
      topic: 'email.scheduled',
      data: eventData,
    })

    return {
      totalScheduled: scheduledEmails,
      scheduledLeads: scheduledLeads,
    }
  } catch (error) {
    ctx.logger.error(
      `Unexpected error in email scheduler: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    throw error
  }
}
