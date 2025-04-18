import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// Constants for configuration
const SF_TIMEZONE = 'America/Los_Angeles' // San Francisco timezone
const SEND_START_HOUR = 8 // 8 AM SF time
const SEND_END_HOUR = 11 // 9 AM SF time

/**
 * Email sender service interface for modularity
 */
interface EmailSender {
  sendEmail(options: {
    to: string
    subject: string
    body: string
    from: string
    isHtml?: boolean
    threadId?: string
  }): Promise<{ messageId?: string }>
}

/**
 * Gmail implementation of the EmailSender interface
 */
class GmailEmailSender implements EmailSender {
  private transporter: nodemailer.Transporter

  constructor(user: string, pass: string) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
  }

  async sendEmail(options: {
    to: string
    subject: string
    body: string
    from: string
    isHtml?: boolean
    threadId?: string
  }): Promise<{ messageId?: string }> {
    // Check if the content is HTML by looking for HTML tags
    // Default to true if isHtml is explicitly set, otherwise detect from content
    const isHtml =
      options.isHtml !== undefined
        ? options.isHtml
        : this.detectHtml(options.body)

    const mailOptions: any = {
      from: options.from,
      to: options.to,
      subject: options.subject,
    }

    // Add threading headers if threadId is provided
    if (options.threadId) {
      mailOptions.inReplyTo = options.threadId
      mailOptions.references = options.threadId
    }

    if (isHtml) {
      mailOptions.html = options.body
      // Optionally provide a plain text version for email clients that don't support HTML
      mailOptions.text = this.stripHtml(options.body)
    } else {
      mailOptions.text = options.body
    }

    const info = await this.transporter.sendMail(mailOptions)
    return { messageId: info.messageId }
  }

  /**
   * Detect if the content contains HTML tags
   */
  private detectHtml(content: string): boolean {
    // Simple regex to detect HTML tags
    return /<[a-z][\s\S]*>/i.test(content)
  }

  /**
   * Strip HTML tags for plain text alternative
   */
  private stripHtml(html: string): string {
    // Very basic HTML stripping - in production you might want a more robust solution
    return html
      .replace(/<[^>]*>?/gm, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }
}

export const config: StepConfig = {
  type: 'cron',
  name: 'Scheduled Email Sender',
  description:
    'Sends approved emails during SF business hours (8-9 AM), running every minute',
  cron: '* * * * *', // Every minute
  flows: ['job-search'],
  emits: ['email.scheduled.sent', 'email.scheduled.error'],
}

/**
 * Checks if the current time is within the San Francisco sending window (8-9 AM, weekdays only)
 */
function isWithinSendingWindow(): boolean {
  // Get current time in SF timezone
  const options = { timeZone: SF_TIMEZONE }
  const sfTime = new Date().toLocaleString('en-US', options)
  const sfDate = new Date(sfTime)

  const hour = sfDate.getHours()
  const dayOfWeek = sfDate.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Check if current day is a weekday (Monday-Friday) and time is between 8 AM and 9 AM SF time
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5 // Monday-Friday
  return isWeekday && hour >= SEND_START_HOUR && hour < SEND_END_HOUR
}

export async function handler(ctx: any) {
  ctx.logger.info('Starting scheduled email sending process')

  // First, check if we're within the sending window (8-9 AM SF time)
  if (!isWithinSendingWindow()) {
    ctx.logger.info(
      'Outside of sending window (8-9 AM SF time). No emails will be sent.'
    )
    return { sentCount: 0, errorCount: 0, reason: 'outside_sending_window' }
  }

  // Initialize environment variables
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS
  const emailFrom = process.env.EMAIL_FROM || `"Auto Reachouts" <${emailUser}>`

  // Validate required environment variables
  if (!supabaseUrl || !supabaseKey) {
    ctx.logger.error('Supabase credentials not found in environment variables')
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required'
    )
  }

  if (!emailUser || !emailPass) {
    ctx.logger.error('Email credentials not found in environment variables')
    throw new Error(
      'EMAIL_USER and EMAIL_PASS environment variables are required'
    )
  }

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Initialize email sender (using the modular approach)
  const emailSender = new GmailEmailSender(emailUser, emailPass)

  // Query for emails that are:
  // 1. Approved (is_approved = true)
  // 2. Not yet sent (sent_at is null)
  // 3. Status is Scheduled
  // We ignore the scheduled_at time and just get the next batch of emails to send
  const { data: emails, error: queryError } = await supabase
    .from('emails')
    .select('*')
    .eq('is_approved', true)
    .eq('status', 'Scheduled')
    .order('scheduled_at', { ascending: true }) // Process oldest scheduled emails first
    .limit(1) // Only get one email per run

  if (queryError) {
    ctx.logger.error(`Error querying scheduled emails: ${queryError.message}`)
    throw queryError
  }

  if (!emails || emails.length === 0) {
    ctx.logger.info('No approved emails ready to send')
    return { sentCount: 0, errorCount: 0 }
  }

  ctx.logger.info(
    `Found ${emails.length} approved emails to process during sending window`
  )

  // In this implementation, we'll only send one email per run
  // Since this runs every minute, we'll get roughly one email per minute
  const emailToSend = emails[0]

  // --- Step 1: Immediately mark as 'Sending' to prevent duplicates ---
  const { error: lockError } = await supabase
    .from('emails')
    .update({ status: 'Sending' })
    .eq('id', emailToSend.id)
    .eq('status', 'Scheduled') // Ensure we only lock if it's still Scheduled

  if (lockError) {
    ctx.logger.error(
      `Failed to lock email ${emailToSend.id} as 'Sending': ${lockError.message}. Skipping this run.`
    )
    // Don't proceed if we couldn't lock it, another process might be handling it
    return { sentCount: 0, errorCount: 1, reason: 'lock_failed' }
  }
  ctx.logger.info(`Locked email ${emailToSend.id} as 'Sending'`)
  // -----------------------------------------------------------------

  // Statistics tracking
  let sentCount = 0
  let errorCount = 0
  let finalStatus: 'Sent' | 'Failed' = 'Failed' // Assume failure until success
  let finalErrorMessage: string | null = null
  let messageId: string | undefined = undefined

  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 5000 // 5 seconds between retries

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const isHtml = emailToSend.body?.includes('<') || false

      ctx.logger.info(
        `Attempt ${attempt}/${MAX_RETRIES}: Sending email ${emailToSend.id} to ${emailToSend.to_email}`
      )

      // --- Step 2: Attempt sending ---
      const result = await emailSender.sendEmail({
        to: emailToSend.to_email,
        subject: emailToSend.subject,
        body: emailToSend.body,
        from: emailFrom,
        isHtml,
        // Pass thread_id only if it exists (i.e., for follow-ups)
        threadId: emailToSend.thread_id || undefined,
      })

      // --- Success ---
      ctx.logger.info(
        `Email ${emailToSend.id} sent successfully on attempt ${attempt}`
      )
      finalStatus = 'Sent'
      messageId = result.messageId
      sentCount = 1
      break // Exit retry loop on success
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      finalErrorMessage = errorMessage // Store the last error
      ctx.logger.warn(
        `Attempt ${attempt}/${MAX_RETRIES} failed for email ${emailToSend.id}: ${errorMessage}`
      )

      if (attempt < MAX_RETRIES) {
        ctx.logger.info(
          `Waiting ${RETRY_DELAY_MS / 1000}s before next retry...`
        )
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      } else {
        // Max retries reached
        ctx.logger.error(
          `Email ${emailToSend.id} failed after ${MAX_RETRIES} attempts.`
        )
        errorCount = 1
      }
    }
  }

  // --- Step 3: Update final status based on outcome ---
  try {
    const updatePayload: any = {
      status: finalStatus,
      error_message: finalErrorMessage, // Will be null if successful
    }
    if (finalStatus === 'Sent') {
      updatePayload.sent_at = new Date().toISOString()
      updatePayload.is_sent = true
      updatePayload.thread_id = messageId
    }

    const { error: finalUpdateError } = await supabase
      .from('emails')
      .update(updatePayload)
      .eq('id', emailToSend.id)

    if (finalUpdateError) {
      // This is problematic, the email was sent/failed, but we couldn't record it!
      ctx.logger.error(
        `CRITICAL: Failed to update final status for email ${emailToSend.id} to '${finalStatus}': ${finalUpdateError.message}`
      )
      // We already incremented sentCount/errorCount based on the *sending* outcome
      // Consider adding specific monitoring/alerting for this scenario
    } else {
      ctx.logger.info(
        `Successfully updated final status for email ${emailToSend.id} to '${finalStatus}'`
      )

      // Emit event based on final status
      if (finalStatus === 'Sent') {
        await ctx.emit({
          topic: 'email.scheduled.sent',
          data: {
            emailId: emailToSend.id,
            recipientEmail: emailToSend.to_email,
            subject: emailToSend.subject,
            threadId: messageId,
            leadId: emailToSend.lead_id,
          },
        })
        // If there's a lead associated with this email, update its status
        if (emailToSend.lead_id) {
          const { error: leadUpdateError } = await supabase
            .from('leads')
            .update({
              status: 'Email Sent',
            })
            .eq('id', emailToSend.lead_id)

          if (leadUpdateError) {
            ctx.logger.warn(
              `Error updating lead status for lead ${emailToSend.lead_id}: ${leadUpdateError.message}`
            )
          }
        }
      } else {
        // Final status is 'Failed'
        await ctx.emit({
          topic: 'email.scheduled.error',
          data: {
            emailId: emailToSend.id,
            error: finalErrorMessage,
            stage: 'sending_failed_retries',
          },
        })
      }
    }
  } catch (updateError) {
    // Catch errors specifically from the final status update logic/emit
    const updateErrorMessage =
      updateError instanceof Error ? updateError.message : String(updateError)
    ctx.logger.error(
      `Error during final status update/emit for email ${emailToSend.id}: ${updateErrorMessage}`
    )
  }

  // -----------------------------------------------------

  ctx.logger.info(
    `Email sending process for ${emailToSend.id} complete. Status: ${finalStatus}.`
  )

  return {
    sentCount,
    errorCount,
  }
}
