import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'

export const config: StepConfig = {
  type: 'api',
  name: 'Manual Follow-up Trigger API',
  description: 'API endpoint to manually trigger follow-up scheduling for previously sent emails.',
  path: '/api/trigger-followups', // Define the API path
  method: 'POST', // Use POST method to initiate the action
  emits: ['email.scheduled.sent'],
  flows: ['job-search'], // Assign to relevant flow
}

// Define the structure of the event data we need to emit
interface EmailSentEventData {
  emailId: string
  recipientEmail: string
  subject: string
  threadId: string | null // Thread ID might be null
  leadId: string
}

export async function handler(req: any, ctx: any) {
  ctx.logger.info('Received request to manually trigger follow-ups for ALL eligible emails.')

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    ctx.logger.error('Supabase credentials not found.')
    return {
      status: 500,
      body: { error: 'Server configuration error.' },
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Query for emails that:
    // 1. Are 'Sent'
    // 2. Are NOT follow-ups themselves (is_followup = false)
    // 3. Do NOT already have a follow-up scheduled (has_followup_scheduled = false)
    // 4. Order by sent date to process oldest first
    const { data: emailsToProcess, error: queryError } = await supabase
      .from('emails')
      .select('id, to_email, subject, thread_id, lead_id') // Select fields needed for the event
      .eq('status', 'Sent')
      .eq('is_followup', false)
      .eq('has_followup_scheduled', false)
      .order('sent_at', { ascending: true })

    if (queryError) {
      ctx.logger.error(`Error querying emails for follow-up: ${queryError.message}`)
      throw queryError // Let the outer catch handle it
    }

    if (!emailsToProcess || emailsToProcess.length === 0) {
      ctx.logger.info('No eligible emails found for manual follow-up triggering.')
      return {
        status: 200,
        body: {
          message: 'No eligible emails found to trigger follow-ups for.',
          triggeredCount: 0,
        },
      }
    }

    ctx.logger.info(`Found ${emailsToProcess.length} total eligible emails to trigger follow-ups for.`)

    let triggeredCount = 0
    const errors: string[] = []

    // Iterate and emit the 'email.scheduled.sent' event for each
    for (const email of emailsToProcess) {
      try {
        const eventData: EmailSentEventData = {
          emailId: email.id,
          recipientEmail: email.to_email,
          subject: email.subject,
          threadId: email.thread_id,
          leadId: email.lead_id,
        }

        await ctx.emit({
          topic: 'email.scheduled.sent',
          data: eventData,
        })

        ctx.logger.info(`Emitted email.scheduled.sent event for email ${email.id}`)
        triggeredCount++
      } catch (emitError) {
        const errorMessage = emitError instanceof Error ? emitError.message : String(emitError)
        ctx.logger.error(`Failed to emit event for email ${email.id}: ${errorMessage}`)
        errors.push(`Email ${email.id}: ${errorMessage}`)
      }
    }

    ctx.logger.info(`Finished manual trigger for all emails. Triggered ${triggeredCount} follow-ups.`)

    return {
      status: errors.length > 0 ? 207 : 200, // Multi-Status if some errors occurred
      body: {
        message: `Attempted to trigger follow-up scheduling for all ${emailsToProcess.length} eligible emails found. Triggered count: ${triggeredCount}. Check logs for details.`,        triggeredCount: triggeredCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    ctx.logger.error(`Unexpected error during manual follow-up trigger: ${errorMessage}`)
    return {
      status: 500,
      body: { error: 'An unexpected error occurred.', details: errorMessage },
    }
  }
}