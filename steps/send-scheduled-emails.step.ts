import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// Constants for configuration
const BATCH_SIZE = 5 // Number of emails to process in each batch
const BATCH_DELAY_MS = 3000 // 3 second delay between batches
const MAILSUITE_TRACKING_URL = 'https://track.mailsuite.com/open/' // Base URL for Mailsuite tracking

/**
 * Utilities for email processing
 */
class EmailUtils {
  /**
   * Add tracking pixel to HTML emails
   */
  static addTrackingPixel(body: string, trackingId: string): string {
    // If email already has the tracking pixel placeholder, replace it
    if (body.includes('{your_tracking_id}')) {
      return body.replace('{your_tracking_id}', trackingId)
    }

    // Otherwise, append tracking pixel before body close tag
    if (body.includes('</body>')) {
      return body.replace(
        '</body>',
        `<!-- Mailsuite tracking pixel -->
<img src="${MAILSUITE_TRACKING_URL}${trackingId}" alt="" width="1" height="1" style="display: none;" />
</body>`
      )
    }

    // If no body tag, just append to the end
    return (
      body +
      `
<!-- Mailsuite tracking pixel -->
<img src="${MAILSUITE_TRACKING_URL}${trackingId}" alt="" width="1" height="1" style="display: none;" />`
    )
  }

  /**
   * Generate a unique tracking ID
   */
  static generateTrackingId(emailId: string): string {
    // Create a unique tracking ID based on email ID and timestamp
    return `${emailId}-${Date.now()}`
  }
}

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
    trackingId?: string
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
    trackingId?: string
  }): Promise<void> {
    // Check if the content is HTML by looking for HTML tags
    // Default to true if isHtml is explicitly set, otherwise detect from content
    const isHtml =
      options.isHtml !== undefined
        ? options.isHtml
        : this.detectHtml(options.body)

    // Get or generate tracking ID
    const trackingId =
      options.trackingId || EmailUtils.generateTrackingId('email')

    const mailOptions: any = {
      from: options.from,
      to: options.to,
      subject: options.subject,
    }

    if (isHtml) {
      // Add tracking pixel to HTML content
      mailOptions.html = EmailUtils.addTrackingPixel(options.body, trackingId)
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
  // 3. Scheduled for now or earlier (scheduled_at <= current time)
  // 4. Status is Approved or Scheduled
  const { data: emails, error: queryError } = await supabase
    .from('emails')
    .select('*')
    .eq('is_approved', true)
    .eq('status', 'Scheduled')
  // .order('scheduled_at', { ascending: true }) // Send oldest scheduled emails first

  // ideally we should set sent_at later and send at scheduled time. TESTING
  // .is('sent_at', null)
  // .lte('scheduled_at', now.toISOString())

  if (queryError) {
    ctx.logger.error(`Error querying scheduled emails: ${queryError.message}`)
    throw queryError
  }

  if (!emails || emails.length === 0) {
    ctx.logger.info('No approved emails ready to send')
    return { sentCount: 0, errorCount: 0 }
  }

  ctx.logger.info(`Found ${emails.length} approved emails ready to send`)

  // Statistics tracking
  let sentCount = 0
  let errorCount = 0

  // Process emails in batches
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    ctx.logger.info(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(
        emails.length / BATCH_SIZE
      )}`
    )

    // Process each email in the current batch
    for (const email of batch) {
      try {
        const isHtml = email.body?.includes('<') || false

        // Generate tracking ID for this email
        const trackingId = EmailUtils.generateTrackingId(email.id)

        ctx.logger.info(
          `Sending email ${email.id} to ${email.to_email} (format: ${
            isHtml ? 'HTML' : 'plain text'
          }, tracking ID: ${trackingId})`
        )

        // Send the email
        await emailSender.sendEmail({
          to: email.to_email,
          subject: email.subject,
          body: email.body,
          from: emailFrom,
          isHtml, // Explicitly set if it's HTML content
          trackingId, // Add tracking ID
        })

        // Update the email record as sent
        const { error: updateError } = await supabase
          .from('emails')
          .update({
            status: 'Sent',
            sent_at: new Date().toISOString(),
            is_sent: true,
            tracking_id: trackingId, // Store tracking ID in database
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

    // If this isn't the last batch, add a delay before processing the next batch
    if (i + BATCH_SIZE < emails.length) {
      ctx.logger.info(
        `Batch complete. Waiting ${
          BATCH_DELAY_MS / 1000
        } seconds before next batch...`
      )
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
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
