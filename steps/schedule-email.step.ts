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
  emits: ['email.scheduled', 'email.approval.required'],
  flows: ['job-search'],
}

interface EmailLog {
  lead_id: string
  to_email: string
  subject: string
  body: string
  template_used: string
  status: string
  scheduled_at: string | null
  is_approved: boolean
}

export async function handler(args: ApolloEmailsUpdatedEvent, ctx: any) {
  try {
    ctx.logger.info(
      `Processing leads for email scheduling. ${args.emailsFound} emails were found.`
    )

    // Even if no emails were found, we should continue the flow
    if (args.emailsFound === 0) {
      ctx.logger.info(
        'No emails found to schedule outreach for, but continuing the flow'
      )

      // Prepare empty result to continue the flow
      const emptyResult: EmailScheduledEvent = {
        query: args.query,
        role: args.role,
        location: args.location,
        totalScheduled: 0,
        scheduledLeads: [],
      }

      // Still emit an event to continue the flow
      await ctx.emit({
        topic: 'email.scheduled',
        data: emptyResult,
      })

      return emptyResult
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
      ctx.logger.info(
        'No leads found that are ready for email outreach, but continuing the flow'
      )

      // Prepare empty result to continue the flow
      const emptyResult: EmailScheduledEvent = {
        query: args.query,
        role: args.role,
        location: args.location,
        totalScheduled: 0,
        scheduledLeads: [],
      }

      // Still emit an event to continue the flow
      await ctx.emit({
        topic: 'email.scheduled',
        data: emptyResult,
      })

      return emptyResult
    }

    ctx.logger.info(`Found ${leads.length} leads ready for email outreach`)

    let scheduledEmails = 0
    let scheduledLeads: EmailScheduledEvent['scheduledLeads'] = []

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

        // Create email log entry
        const emailLog: EmailLog = {
          lead_id: lead.id,
          to_email: lead.contact_email,
          subject: emailTemplate.subject,
          body: emailTemplate.body,
          template_used: emailTemplate.name,
          status: 'Scheduled',
          scheduled_at: scheduledDate.toISOString(),
          is_approved: null, // Default to null so we can update this from UI.
        }

        // Insert into emails table
        const { data: newEmail, error: emailInsertError } = await supabase
          .from('emails')
          .insert(emailLog)
          .select()
          .single()

        if (emailInsertError) {
          ctx.logger.error(
            `Error logging email for lead ${lead.id}: ${emailInsertError.message}`
          )
          continue
        }

        // Emit an event for email approval
        await ctx.emit({
          topic: 'email.approval.required',
          data: {
            emailId: newEmail.id,
            leadId: lead.id,
            subject: emailTemplate.subject,
            to: lead.contact_email,
            companyName: lead.company_name,
            roleTitle: lead.role_title,
          },
        })

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

    // Always emit results to continue the flow
    await ctx.emit({
      topic: 'email.scheduled',
      data: eventData,
    })

    return eventData
  } catch (error) {
    ctx.logger.error(
      `Unexpected error in email scheduler: ${
        error instanceof Error ? error.message : String(error)
      }`
    )

    // Even on error, emit an empty result to continue the flow
    const errorResult: EmailScheduledEvent = {
      query: args.query,
      role: args.role,
      location: args.location,
      totalScheduled: 0,
      scheduledLeads: [],
    }

    await ctx.emit({
      topic: 'email.scheduled',
      data: errorResult,
    })

    throw error
  }
}
