import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'

export const config: StepConfig = {
  type: 'event',
  name: 'Email Scheduler',
  description:
    'Schedules personalized outreach emails for leads with found emails',
  subscribes: ['apollo.emails.updated'],
  emits: ['email.scheduled'],
  flows: ['job-search'],
}

interface ApolloEmailsUpdatedEvent {
  query: string
  role: string
  location: string
  totalLeads: number
  emailsFound: number
  errors: number
  leadIds?: string[] // Add leadIds to process specific leads from previous step
}

interface Lead {
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
  contact_email: string
  status: string
}

interface EmailTemplate {
  subject: string
  body: string
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
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      ctx.logger.error(
        'Supabase credentials not found in environment variables'
      )
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required'
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get the user's name and email for the outreach
    const senderName = process.env.SENDER_NAME || 'Job Seeker'
    const senderEmail = process.env.SENDER_EMAIL

    if (!senderEmail) {
      ctx.logger.error('Sender email not found in environment variables')
      throw new Error('SENDER_EMAIL environment variable is required')
    }

    // Query leads with found emails that are ready for outreach
    let query = supabase
      .from('leads')
      .select('*')
      .eq('status', 'Email Found')
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
    try {
      // Check if table exists with a simple query
      const { error: tableCheckError } = await supabase
        .from('emails')
        .select('id')
        .limit(1)

      if (tableCheckError) {
        ctx.logger.error(`Error with emails table: ${tableCheckError.message}`)

        // Create emails table if it doesn't exist
        await supabase.rpc('create_emails_if_not_exists', {})
        ctx.logger.info('Created emails table')
      }
    } catch (tableError) {
      ctx.logger.error(`Error checking emails table: ${tableError}`)
      // Continue anyway, as the table might still exist
    }

    // Process each lead
    for (const lead of leads) {
      try {
        // Validate lead has required fields
        if (!lead.contact_email) {
          ctx.logger.warn(`Skipping lead ${lead.id}: No contact email`)
          continue
        }

        // Generate personalized email template
        const emailTemplate = generateEmailTemplate(lead, senderName)

        // Schedule the email
        const scheduledDate = calculateScheduleDate()

        ctx.logger.info(`Preparing to schedule email for lead ${lead.id}`)

        // In a real implementation, this would connect to an email service
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
            scheduled_for: scheduledDate,
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
          .update({ status: 'Email Scheduled' })
          .eq('id', lead.id)

        if (updateError) {
          ctx.logger.error(
            `Error updating lead status for lead ${lead.id}: ${updateError.message}`
          )
          continue
        }

        ctx.logger.info(
          `Successfully updated lead ${lead.id} status to 'Email Scheduled'`
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

    // Emit results
    await ctx.emit({
      topic: 'email.scheduled',
      data: {
        query: args.query,
        role: args.role,
        location: args.location,
        totalScheduled: scheduledEmails,
        scheduledLeads: scheduledLeads,
      },
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

/**
 * Generate a personalized email template based on lead information
 */
function generateEmailTemplate(lead: Lead, senderName: string): EmailTemplate {
  const hasName = lead.contact_name && lead.contact_name.trim() !== ''
  const firstName = hasName ? lead.contact_name.split(' ')[0] : 'there'

  const companyName = lead.company_name || 'your company'
  const roleName = lead.role_title || 'the open position'

  const subject = `Interest in ${roleName} at ${companyName}`

  const body = `Hi ${firstName},

I came across the ${roleName} role at ${companyName} and I'm very interested in this opportunity. Your company's work in this space is impressive, and I believe my background would be a great fit.

I'd love to learn more about the role and share how I could contribute to your team. Would you be open to a brief conversation this week?

Looking forward to connecting,
${senderName}
`

  return {
    subject,
    body,
  }
}

/**
 * Calculate a reasonable date to schedule the email
 * This implementation schedules for the next business day at a random time
 */
function calculateScheduleDate(): Date {
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
