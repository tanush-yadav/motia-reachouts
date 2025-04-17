import { SupabaseClient } from '@supabase/supabase-js'
import { initSupabaseClient } from './supabase'

/**
 * Ensures a table exists in the database
 * @param supabase Supabase client
 * @param tableName Name of the table to check
 * @param createFunctionName Name of the RPC function to create the table
 * @param logger Optional logger instance
 * @returns True if the table exists or was created
 */
export async function ensureTableExists(
  supabase: SupabaseClient,
  tableName: string,
  createFunctionName: string,
  logger?: any
): Promise<boolean> {
  try {
    // Check if table exists with a simple query
    const { error: tableCheckError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    if (tableCheckError) {
      if (logger) {
        logger.error(
          `Error with ${tableName} table: ${tableCheckError.message}`
        )
      }

      // Create table if it doesn't exist
      await supabase.rpc(createFunctionName, {})

      if (logger) {
        logger.info(`Created ${tableName} table`)
      }
    }

    return true
  } catch (tableError) {
    if (logger) {
      logger.error(`Error checking ${tableName} table: ${tableError}`)
    }
    // Table might still exist even if there was an error
    return false
  }
}

/**
 * Updates the status and other relevant fields of a job record.
 */
export async function updateJobStatus(
  jobId: string,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR',
  error: string | null,
  logger: any
): Promise<void> {
  try {
    const supabase = initSupabaseClient(logger)

    const updateData: Record<string, any> = { status }

    if (error) {
      // Use the correct column name from the schema
      updateData.error_message = error
    }

    if (status === 'COMPLETED' || status === 'ERROR') {
      updateData.completed_at = new Date().toISOString()
    }

    // Always set updated_at timestamp on status change
    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)

    if (updateError) {
      logger.error(`Failed to update job status for job ${jobId}: ${updateError.message}`)
    } else {
      logger.info(`Updated job ${jobId} status to ${status}`)
    }
  } catch (err) {
    logger.error(`Error updating job status for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

