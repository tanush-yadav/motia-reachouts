import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'

export const config: StepConfig = {
  type: 'event',
  name: 'Email Approval',
  description: 'Handles approval of scheduled emails before sending',
  subscribes: ['email.approval.requested'],
  emits: ['email.approval.completed'],
  flows: ['job-search'],
}

interface EmailApprovalRequest {
  emailId: string
  leadId: string
  approve: boolean
  reason?: string
}

export async function handler(args: EmailApprovalRequest, ctx: any) {
  ctx.logger.info(`Processing email approval request for email ${args.emailId}`)

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    ctx.logger.error('Supabase credentials not found in environment variables')
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Update email record with approval status
    const { data: email, error: updateError } = await supabase
      .from('emails')
      .update({
        is_approved: args.approve,
        status: args.approve ? 'Approved' : 'Rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.emailId)
      .select()
      .single()

    if (updateError) {
      ctx.logger.error(
        `Error updating email approval status: ${updateError.message}`
      )
      throw updateError
    }

    if (!email) {
      ctx.logger.error(`Email with ID ${args.emailId} not found`)
      throw new Error(`Email with ID ${args.emailId} not found`)
    }

    ctx.logger.info(
      `Email ${args.emailId} has been ${args.approve ? 'approved' : 'rejected'}`
    )

    // If the email was rejected, update the lead status as well
    if (!args.approve && args.leadId) {
      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
          status: 'Email Rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', args.leadId)

      if (leadUpdateError) {
        ctx.logger.error(
          `Error updating lead status: ${leadUpdateError.message}`
        )
        // Don't throw here, continue with the process
      } else {
        ctx.logger.info(
          `Lead ${args.leadId} status updated to 'Email Rejected'`
        )
      }
    }

    // Emit event with the result
    await ctx.emit({
      topic: 'email.approval.completed',
      data: {
        emailId: args.emailId,
        leadId: args.leadId,
        approved: args.approve,
        reason: args.reason || null,
      },
    })

    return {
      emailId: args.emailId,
      leadId: args.leadId,
      approved: args.approve,
    }
  } catch (error) {
    ctx.logger.error(`Error processing email approval: ${error}`)
    throw error
  }
}
