import { StepConfig } from '@motiadev/core';
import { prepareFollowupEmail } from './utils/email';
import { initSupabaseClient } from './utils/supabase';

export const config: StepConfig = {
  type: 'event',
  name: 'Follow-up Email Scheduler',
  description: 'Schedules follow-up emails when original emails are successfully sent',
  subscribes: ['email.scheduled.sent'],
  emits: ['email.followup.approval.required'],
  flows: ['job-search'],
}

export async function handler(event: {
  emailId: string;
  recipientEmail: string;
  subject: string;
  threadId: string;
  leadId: string;
}, ctx: any) {
  ctx.logger.info(`Processing follow-up scheduling for email ${event.emailId}`);

  // Initialize Supabase client using the utility function
  const supabase = initSupabaseClient(ctx.logger);

  try {
    // Step 1: Fetch the lead data for the email
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', event.leadId)
      .single();

    if (leadError) {
      throw new Error(`Error fetching lead ${event.leadId}: ${leadError.message}`);
    }

    if (!lead) {
      throw new Error(`Lead ${event.leadId} not found for email ${event.emailId}`);
    }

    // Step 2: Prepare and schedule the follow-up email
    const result = await prepareFollowupEmail(
      supabase,
      {
        originalEmailId: event.emailId,
        lead: lead,
        templateName: 'first_follow_up',
        followupDays: 3
      },
      ctx.logger
    );

    // If follow-up was not scheduled due to conditions like already being a follow-up
    if (!result.success) {
      return { success: false, reason: result.reason };
    }

    // Step 3: Emit event for follow-up approval
    await ctx.emit({
      topic: 'email.followup.approval.required',
      data: {
        emailId: result.followupId,
        leadId: event.leadId,
        originalEmailId: event.emailId,
        subject: `Re: ${event.subject}`,
        to: event.recipientEmail,
        companyName: lead.company_name,
        roleTitle: lead.role_title,
        scheduledAt: result.scheduledFor
      }
    });

    ctx.logger.info(`Successfully scheduled follow-up email for ${event.emailId}`);

    return {
      success: true,
      followupId: result.followupId,
      scheduledFor: result.scheduledFor
    };
  } catch (error) {
    ctx.logger.error(`Error scheduling follow-up for email ${event.emailId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
