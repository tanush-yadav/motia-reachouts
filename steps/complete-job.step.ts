import { StepConfig } from '@motiadev/core'
import { EmailScheduledEvent } from './types/common'
import { initSupabaseClient } from './utils/supabase'

export const config: StepConfig = {
  type: 'event',
  name: 'Job Completion Handler',
  description: 'Marks job searches as complete in the database',
  emits: ['job.completed'],
  subscribes: ['email.scheduled'],
  flows: ['job-search'],
}

export async function handler(event: EmailScheduledEvent, ctx: any) {
  // Check if jobId exists
  if (!event.jobId) {
    ctx.logger.warn('No jobId provided in event, cannot mark job as complete')
    return { success: false, reason: 'missing_job_id' }
  }

  ctx.logger.info(`Marking job ${event.jobId} as COMPLETED`)

  try {
    const supabase = initSupabaseClient(ctx.logger)

    // Update job status to COMPLETED
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', event.jobId)

    if (error) {
      ctx.logger.error(`Failed to mark job ${event.jobId} as complete: ${error.message}`)
      return { success: false, error: error.message }
    }

    ctx.logger.info(`Successfully marked job ${event.jobId} as complete with ${event.totalScheduled} emails scheduled`)

    return {
      success: true,
      jobId: event.jobId,
      totalScheduled: event.totalScheduled
    }
  } catch (error) {
    ctx.logger.error(`Error marking job ${event.jobId} as complete: ${error instanceof Error ? error.message : String(error)}`)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}