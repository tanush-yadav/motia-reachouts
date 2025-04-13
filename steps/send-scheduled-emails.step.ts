import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// Constants for configuration
const BATCH_SIZE = 5 // Number of emails to process in each batch
const EMAIL_DELAY_MS = 25000 // 25 second delay between emails (random between 20-30 seconds)
const MAX_TIME_DIFF_MS = 60000 // 1 minute maximum difference between scheduled time and current time

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
  }): Promise<void>
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
  }): Promise<void> {
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

    if (isHtml) {
      mailOptions.html = options.body
      // Optionally provide a plain text version for email clients that don't support HTML
      mailOptions.text = this.stripHtml(options.body)
    } else {
      mailOptions.text = options.body
    }

    await this.transporter.sendMail(mailOptions)
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
    'Sends approved emails that are scheduled for delivery, running every 15 minutes',
  // cron: '*/15 * * * *', // Run every 15 minutes
  cron: '* * * * *', // Every minute (testing only)
  flows: ['job-search'],
  emits: ['email.scheduled.sent', 'email.scheduled.error'],
}

/**
 * Get a random delay between 20-30 seconds
 */
function getRandomDelay(): number {
  return Math.floor(Math.random() * 10000) + 20000 // 20000-30000 ms (20-30 seconds)
}

/**
 * Check if it's time to send an email based on its scheduled time
 */
function isTimeToSend(scheduledAt: string): boolean {
  const scheduledTime = new Date(scheduledAt).getTime()
  const currentTime = new Date().getTime()

  // Only send if we're within MAX_TIME_DIFF_MS of the scheduled time
  return Math.abs(currentTime - scheduledTime) <= MAX_TIME_DIFF_MS
}

export async function handler(ctx: any) {
  ctx.logger.info('Starting scheduled email sending process')

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

  // Get current time
  const now = new Date()

  // Query for emails that are:
  // 1. Approved (is_approved = true)
  // 2. Not yet sent (sent_at is null)
  // 3. Status is Scheduled
  const { data: emails, error: queryError } = await supabase
    .from('emails')
    .select('*')
    .eq('is_approved', true)
    .eq('status', 'Scheduled')
    .is('sent_at', null)
    .lte(
      'scheduled_at',
      new Date(now.getTime() + MAX_TIME_DIFF_MS).toISOString()
    )
    .order('scheduled_at', { ascending: true }) // Send oldest scheduled emails first

  if (queryError) {
    ctx.logger.error(`Error querying scheduled emails: ${queryError.message}`)
    throw queryError
  }

  if (!emails || emails.length === 0) {
    ctx.logger.info('No approved emails ready to send')
    return { sentCount: 0, errorCount: 0 }
  }

  // Filter emails that are due to be sent (within the time window)
  const emailsDueNow = emails.filter((email) =>
    isTimeToSend(email.scheduled_at)
  )

  if (emailsDueNow.length === 0) {
    ctx.logger.info('No emails scheduled for current time window')
    return { sentCount: 0, errorCount: 0 }
  }

  ctx.logger.info(
    `Found ${emailsDueNow.length} approved emails to send in the current time window`
  )

  // Statistics tracking
  let sentCount = 0
  let errorCount = 0

  // Process emails in batches
  for (let i = 0; i < emailsDueNow.length; i += BATCH_SIZE) {
    const batch = emailsDueNow.slice(i, i + BATCH_SIZE)
    ctx.logger.info(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(
        emailsDueNow.length / BATCH_SIZE
      )}`
    )

    // Process each email in the current batch with a delay between each
    for (let j = 0; j < batch.length; j++) {
      const email = batch[j]

      // If not the first email in the batch, add a delay
      if (j > 0) {
        const delay = getRandomDelay()
        ctx.logger.info(
          `Waiting ${delay / 1000} seconds before sending next email...`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      try {
        const isHtml = email.body?.includes('<') || false

        ctx.logger.info(
          `Sending email ${email.id} to ${email.to_email} (format: ${
            isHtml ? 'HTML' : 'plain text'
          })`
        )

        // Send the email
        await emailSender.sendEmail({
          to: email.to_email,
          subject: email.subject,
          body: email.body,
          from: emailFrom,
          isHtml, // Explicitly set if it's HTML content
        })

        // Update the email record as sent
        const { error: updateError } = await supabase
          .from('emails')
          .update({
            status: 'Sent',
            sent_at: new Date().toISOString(),
            is_sent: true,
          })
          .eq('id', email.id)

        if (updateError) {
          ctx.logger.error(
            `Error updating email status to Sent: ${updateError.message}`
          )
          errorCount++

          // Emit error event
          await ctx.emit({
            topic: 'email.scheduled.error',
            data: {
              emailId: email.id,
              error: updateError.message,
              stage: 'database-update',
            },
          })
        } else {
          sentCount++
          ctx.logger.info(`Email ${email.id} sent to ${email.to_email}`)

          // Emit success event
          await ctx.emit({
            topic: 'email.scheduled.sent',
            data: {
              emailId: email.id,
              recipientEmail: email.to_email,
              subject: email.subject,
            },
          })

          // If there's a lead associated with this email, update its status
          if (email.lead_id) {
            const { error: leadUpdateError } = await supabase
              .from('leads')
              .update({
                status: 'Email Sent',
                // updated_at: new Date().toISOString(),
              })
              .eq('id', email.lead_id)

            if (leadUpdateError) {
              ctx.logger.warn(
                `Error updating lead status for lead ${email.lead_id}: ${leadUpdateError.message}`
              )
            }
          }
        }
      } catch (error) {
        errorCount++
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        ctx.logger.error(`Error sending email ${email.id}: ${errorMessage}`)

        // Update the email with error information
        const { error: updateError } = await supabase
          .from('emails')
          .update({
            status: 'Error',
            error_message: errorMessage,
          })
          .eq('id', email.id)

        if (updateError) {
          ctx.logger.error(
            `Failed to update email error status: ${updateError.message}`
          )
        }

        // Emit error event
        await ctx.emit({
          topic: 'email.scheduled.error',
          data: {
            emailId: email.id,
            error: errorMessage,
            stage: 'sending',
          },
        })
      }
    }
  }

  ctx.logger.info(
    `Email sending complete. Successfully sent ${sentCount} emails with ${errorCount} errors.`
  )

  return {
    sentCount,
    errorCount,
  }
}
