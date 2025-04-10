import { ApiRouteConfig, StepHandler } from 'motia'
import { z } from 'zod'

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

  await emit({
    topic: 'job.query.received',
    data: {
      query: req.body.query,
      limit: req.body.limit,
    },
  })

  return {
    status: 200,
    body: { message: 'Job search query received and processing started' },
  }
}
