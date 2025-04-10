import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function initSupabaseClient(logger?: any): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    const error = new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required'
    )
    if (logger) {
      logger.error('Supabase credentials not found in environment variables')
    }
    throw error
  }

  return createClient(supabaseUrl, supabaseKey)
}
