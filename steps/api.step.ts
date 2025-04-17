import { ApiRouteConfig, StepHandler } from 'motia'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { initSupabaseClient } from './utils/supabase'

const inputSchema = z.object({
  query: z.string().describe('The job search query string'),
  limit: z.number().default(10).describe('Maximum number of links to process'),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'Job Search API',
  description: 'Processes job search queries and generates search terms',
  path: '/api/job-search',
  virtualSubscribes: ['/job-search'],
  method: 'POST',
  emits: ['job.query.received'],
  bodySchema: inputSchema,
  flows: ['job-search'],
}

export const handler: StepHandler<typeof config> = async (
  req,
  { logger, emit }
) => {
  logger.info('Processing job search query', req.body)

  // Generate a unique job ID
  const jobId = uuidv4()

  try {
    // Initialize Supabase client
    const supabase = initSupabaseClient(logger)

    // Create a new job record in the jobs table
    const { error: insertError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        raw_query: req.body.query,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        limit: req.body.limit
      })

    if (insertError) {
      logger.error(`Error creating job record: ${insertError.message}`)
      throw new Error(`Failed to create job record: ${insertError.message}`)
    }

    logger.info(`Created job with ID: ${jobId} for query: ${req.body.query}`)

    // Emit event with job ID included
    await emit({
      topic: 'job.query.received',
      data: {
        jobId,
        query: req.body.query,
        limit: req.body.limit,
      },
    })

    return {
      status: 200,
      body: {
        message: 'Job search query received and processing started',
        jobId: jobId // Return job ID to the client
      },
    }
  } catch (error) {
    logger.error(`Error processing job search query: ${error instanceof Error ? error.message : String(error)}`)

    // If we have a job ID, update the job status to ERROR
    if (jobId) {
      try {
        const supabase = initSupabaseClient(logger)
        await supabase
          .from('jobs')
          .update({
            status: 'ERROR',
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId)
      } catch (dbError) {
        logger.error(`Failed to update job status: ${dbError instanceof Error ? dbError.message : String(dbError)}`)
      }
    }

    return {
      status: 500,
      body: {
        message: 'Error processing job search query',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
