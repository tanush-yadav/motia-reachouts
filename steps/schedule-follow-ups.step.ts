import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'

export const config: StepConfig = {
  type: 'event',
  name: 'Schedule Follow Ups',
  description: 'Schedule follow ups for emails',
  // FIXME: disconnected unless tested.
  // subscribes: ['email.scheduled.sent'],
  emits: ['email.followup.scheduled', 'email.followup.error'],
  flows: ['job-search'],
}

export async function handler(args: any, ctx: any) {
  ctx.logger.info('Starting follow up scheduling process')

  // Get data from the event
  const { emailId, recipientEmail, subject, threadId, leadId } = args.data

  if (!emailId || !threadId) {
    ctx.logger.error('Missing required data for scheduling follow-up')
    return { success: false, error: 'Missing required email data' }
  }

  ctx.logger.info(
    `Processing follow-up for email ${emailId} with thread ID: ${threadId}`
  )

  try {
    // Initialize environment variables
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY

    // Validate required environment variables
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required'
      )
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Calculate the date for 2 days from now
    const followUpDate = new Date()
    followUpDate.setDate(followUpDate.getDate() + 2)

    // Generate the follow-up email content
    const followUpSubject = `Re: ${subject}`
    const followUpBody = createFollowUpBody(recipientEmail)

    // Create the follow-up email record
    const { data: followUpEmail, error: createError } = await supabase
      .from('emails')
      .insert({
        to_email: recipientEmail,
        subject: followUpSubject,
        body: followUpBody,
        status: 'Scheduled',
        is_approved: true,
        is_followup: true,
        parent_email_id: emailId,
        thread_id: threadId,
        scheduled_at: followUpDate.toISOString(),
        lead_id: leadId || null,
      })
      .select()

    if (createError) {
      ctx.logger.error(`Error creating follow-up email: ${createError.message}`)

      await ctx.emit({
        topic: 'email.followup.error',
        data: {
          emailId,
          error: createError.message,
        },
      })

      return { success: false, error: createError.message }
    }

    const followUpId = followUpEmail?.[0]?.id

    ctx.logger.info(
      `Successfully scheduled follow-up email ${followUpId} for ${recipientEmail} on ${followUpDate.toISOString()}`
    )

    // Emit success event
    await ctx.emit({
      topic: 'email.followup.scheduled',
      data: {
        originalEmailId: emailId,
        followUpEmailId: followUpId,
        recipientEmail,
        scheduledAt: followUpDate.toISOString(),
        threadId,
      },
    })

    return {
      success: true,
      followUpEmailId: followUpId,
      scheduledAt: followUpDate.toISOString(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ctx.logger.error(`Error scheduling follow-up: ${errorMessage}`)

    await ctx.emit({
      topic: 'email.followup.error',
      data: {
        emailId,
        error: errorMessage,
      },
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Create a follow-up email body
 */
function createFollowUpBody(recipientName: string): string {
  const firstName = recipientName.split('@')[0].split('.')[0]
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1)

  return `
<p>Hi ${capitalizedName},</p>

<p>I just wanted to follow up on my previous email. I'd love to connect and discuss how I might be able to contribute to your team.</p>

<p>If you have a few minutes this week, I'd appreciate the opportunity to chat.</p>

<p>Best regards,</p>
<p>Your Name</p>
  `.trim()
}
