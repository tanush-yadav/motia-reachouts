import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

export const config: StepConfig = {
  type: 'cron',
  name: 'Email Sender',
  description: 'Sends approved emails that are scheduled for the current time',
  schedule: '*/15 * * * *', // Run every 15 minutes
  flows: ['job-search'],
}

export async function handler(args: any, ctx: any) {
  ctx.logger.info('Starting scheduled email sending process')

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS
  const emailFrom = process.env.EMAIL_FROM || emailUser

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

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Create a nodemailer transport
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  })

  // Get current time
  const now = new Date()

  // Find emails that are:
  // 1. Approved
  // 2. Scheduled for now or earlier
  // 3. Not yet sent
  const { data: emails, error: queryError } = await supabase
    .from('emails')
    .select('*, leads!inner(*)')
    .eq('is_approved', true)
    .eq('status', 'Approved')
    .lte('scheduled_at', now.toISOString())
    .is('sent_at', null)
    .limit(50)

  if (queryError) {
    ctx.logger.error(`Error querying emails to send: ${queryError.message}`)
    throw queryError
  }

  if (!emails || emails.length === 0) {
    ctx.logger.info('No approved emails ready to send')
    return { sentCount: 0 }
  }

  ctx.logger.info(`Found ${emails.length} approved emails ready to send`)

  let sentCount = 0
  let errors = 0

  // Process each email
  for (const email of emails) {
    try {
      // Send the email
      await transporter.sendMail({
        from: `"Auto Reachouts" <${emailFrom}>`,
        to: email.to_email,
        subject: email.subject,
        text: email.body,
        // You could add HTML version here if needed
      })

      // Update the email record as sent
      const { error: updateError } = await supabase
        .from('emails')
        .update({
          status: 'Sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', email.id)

      if (updateError) {
        ctx.logger.error(
          `Error updating email status to Sent: ${updateError.message}`
        )
        errors++
      } else {
        sentCount++
        ctx.logger.info(`Email ${email.id} sent to ${email.to_email}`)

        // Update lead status
        const { error: leadUpdateError } = await supabase
          .from('leads')
          .update({
            status: 'Email Sent',
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.lead_id)

        if (leadUpdateError) {
          ctx.logger.error(
            `Error updating lead status for lead ${email.lead_id}: ${leadUpdateError.message}`
          )
        }
      }
    } catch (error) {
      ctx.logger.error(`Error sending email ${email.id}: ${error}`)

      // Update the email status to error
      const { error: updateError } = await supabase
        .from('emails')
        .update({
          status: 'Error',
          error: String(error),
        })
        .eq('id', email.id)

      if (updateError) {
        ctx.logger.error(
          `Failed to update email error status: ${updateError.message}`
        )
      }

      errors++
    }
  }

  ctx.logger.info(
    `Email sending complete. Sent ${sentCount} emails with ${errors} errors.`
  )

  return {
    sentCount,
    errors,
  }
}
