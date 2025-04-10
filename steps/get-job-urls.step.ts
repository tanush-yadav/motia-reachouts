import { StepConfig } from '@motiadev/core'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

export const config: StepConfig = {
  type: 'event',
  name: 'Job URL Collector',
  description: 'Collects job URLs from Google search results using dorks',
  subscribes: ['job.query.processed'],
  emits: ['job.urls.collected'],
  flows: ['job-search'],
}

interface JobQuery {
  query: string
  role: string
  location: string
  limit: number
  google_dorks: string[]
}

interface JobUrl {
  url: string
  jobId: string
  title?: string
}

export async function handler(args: JobQuery, ctx: any) {
  ctx.logger.info(
    `Processing Google dorks for: ${args.role} in ${args.location}`
  )

  if (!args.google_dorks || args.google_dorks.length === 0) {
    ctx.logger.error('No Google dorks provided')
    throw new Error('No Google dorks provided')
  }

  const SERP_API_KEY = process.env.SERP_API_KEY
  if (!SERP_API_KEY) {
    ctx.logger.error('SERP API key not found in environment variables')
    throw new Error('SERP_API_KEY environment variable is required')
  }

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

  const jobUrls: JobUrl[] = []
  const limit = args.limit || 10

  // Process each Google dork query
  for (const dork of args.google_dorks) {
    if (jobUrls.length >= limit) break

    try {
      ctx.logger.info(`Searching with dork: ${dork}`)

      const response = await axios.get('https://serpapi.com/search', {
        params: {
          api_key: SERP_API_KEY,
          q: dork,
          engine: 'google',
          num: Math.min(100, limit * 2), // Request more results than needed to filter
        },
      })

      const results = response.data.organic_results || []

      // Extract and filter URLs that match the pattern
      for (const result of results) {
        if (jobUrls.length >= limit) break

        const url = result.link
        if (!url) continue

        // Extract job URLs with the correct pattern
        if (url.match(/https:\/\/www\.workatastartup\.com\/jobs\/\d+/)) {
          const jobId = url.split('/').pop() as string

          // Check if this URL is already in our list
          if (!jobUrls.find((j) => j.jobId === jobId)) {
            jobUrls.push({
              url,
              jobId,
              title: result.title,
            })

            ctx.logger.info(`Found job URL: ${url}`)
          }
        }
      }
    } catch (error) {
      ctx.logger.error(
        `Error fetching search results for dork "${dork}": ${error}`
      )
    }
  }

  ctx.logger.info(`Found ${jobUrls.length} job URLs before database validation`)

  // Filter out URLs that already exist in the database using Supabase
  try {
    // Get all URLs we want to check
    const urlsToCheck = jobUrls.map((job) => job.url)

    // Query Supabase to find existing URLs
    const { data: existingUrls, error } = await supabase
      .from('leads')
      .select('job_url')
      .in('job_url', urlsToCheck)

    if (error) {
      throw error
    }

    // Create a Set of existing URLs for faster lookup
    const existingUrlSet = new Set(existingUrls.map((lead) => lead.job_url))

    // Filter out URLs that already exist in the database
    const filteredJobUrls = jobUrls.filter(
      (job) => !existingUrlSet.has(job.url)
    )

    ctx.logger.info(
      `Removed ${
        jobUrls.length - filteredJobUrls.length
      } URLs that already exist in the database`
    )

    // Update our jobUrls array with the filtered list
    jobUrls.length = 0
    jobUrls.push(...filteredJobUrls)
  } catch (error) {
    ctx.logger.error(`Error checking database for existing URLs: ${error}`)
    // Continue with potentially duplicate URLs rather than failing completely
  }

  ctx.logger.info(`Collected ${jobUrls.length} new job URLs after filtering`)

  // Emit the collected URLs
  await ctx.emit({
    topic: 'job.urls.collected',
    data: {
      query: args.query,
      role: args.role,
      location: args.location,
      jobUrls,
      count: jobUrls.length,
    },
  })

  return {
    query: args.query,
    role: args.role,
    location: args.location,
    jobUrls,
    count: jobUrls.length,
  }
}
