import { SupabaseClient } from '@supabase/supabase-js'

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
