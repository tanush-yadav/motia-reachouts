import { StepConfig } from '@motiadev/core'
import axios from 'axios'
import { JobUrlsCollectedEvent } from './types/common'
import { updateJobStatus } from './utils/database'
import { getRequiredEnv } from './utils/env'
import { initSupabaseClient } from './utils/supabase'
export const config: StepConfig = {
  type: 'event',
  name: 'Job URL Collector',
  description: 'Collects job URLs from Google search results using dorks',
  subscribes: ['job.query.processed'],
  emits: ['job.urls.collected'],
  flows: ['job-search'],
}

interface JobQuery {
  jobId: string
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

interface SearchOptions {
  dork: string
  startIndex: number
  maxResults: number
}

export async function handler(args: JobQuery, ctx: any) {
  ctx.logger.info(
    `Processing Google dorks for job ${args.jobId}: ${args.role} in ${args.location}`
  )

  if (!args.google_dorks || args.google_dorks.length === 0) {
    ctx.logger.error(`No Google dorks provided for job ${args.jobId}`)
    await updateJobStatus(args.jobId, 'ERROR', 'No Google dorks provided', ctx.logger)
    throw new Error('No Google dorks provided')
  }

  const SERP_API_KEY = getRequiredEnv('SERP_API_KEY', ctx.logger)
  const supabase = initSupabaseClient(ctx.logger)

  // Update job status to PROCESSING
  await updateJobStatus(args.jobId, 'PROCESSING', null, ctx.logger)

  const uniqueJobUrls: JobUrl[] = []
  const limit = args.limit || 10
  const maxAttempts = 3 // Maximum number of search attempts per dork

  // Keep track of all jobIds to avoid duplicates within the same run
  const seenJobIds = new Set<string>()

  // Process each Google dork query with pagination until we reach the limit
  for (const dork of args.google_dorks) {
    // Skip this dork if we've already found enough URLs
    if (uniqueJobUrls.length >= limit) break

    // Try to fetch results with pagination - start from the first page
    let currentStartIndex = 0
    let attemptsForThisDork = 0

    while (uniqueJobUrls.length < limit && attemptsForThisDork < maxAttempts) {
      attemptsForThisDork++

      const searchOptions: SearchOptions = {
        dork,
        startIndex: currentStartIndex,
        maxResults: Math.min(10, limit * 2), // Request 10 results per page
      }

      const newUrls = await searchForJobUrls(
        searchOptions,
        SERP_API_KEY,
        seenJobIds,
        ctx.logger
      )

      if (newUrls.length === 0) {
        // No more results from this dork, try the next one
        break
      }

      // Add newly found URLs to our list and mark them as seen
      for (const url of newUrls) {
        seenJobIds.add(url.jobId)
      }

      uniqueJobUrls.push(...newUrls)

      // Move to the next page (typically 10 results per page)
      currentStartIndex += 10
    }
  }

  ctx.logger.info(
    `Found ${uniqueJobUrls.length} job URLs before database validation for job ${args.jobId}`
  )

  // If we didn't find any URLs, try to increase the limit and search again
  if (uniqueJobUrls.length === 0) {
    ctx.logger.warn(`No job URLs found for job ${args.jobId}, trying broader search parameters`)

    // Update job status based on result
    const emptyResult: JobUrlsCollectedEvent = {
      jobId: args.jobId,
      query: args.query,
      role: args.role,
      location: args.location,
      jobUrls: [],
      count: 0,
    }

    await ctx.emit({
      topic: 'job.urls.collected',
      data: emptyResult,
    })

    return emptyResult
  }

  // Filter out URLs that already exist in the database
  const filteredJobUrls = await filterExistingUrls(
    uniqueJobUrls,
    supabase,
    ctx.logger
  )

  // If we have fewer URLs than requested after filtering, try to fetch more
  if (
    filteredJobUrls.length < limit &&
    filteredJobUrls.length < uniqueJobUrls.length
  ) {
    ctx.logger.info(
      `After filtering, only ${filteredJobUrls.length}/${limit} URLs remain for job ${args.jobId}. Will try to fetch more.`
    )

    // Calculate how many more we need
    const additionalNeeded = limit - filteredJobUrls.length

    // Continue pagination where we left off for each dork
    for (const dork of args.google_dorks) {
      if (filteredJobUrls.length >= limit) break

      // Continue from where the previous search left off
      let startIndex = 0
      let pagesChecked = 0
      const maxPages = 10 // Maximum number of pages to check per dork

      while (filteredJobUrls.length < limit && pagesChecked < maxPages) {
        pagesChecked++
        startIndex += 10 // Move to the next page

        const searchOptions: SearchOptions = {
          dork,
          startIndex,
          maxResults: 10, // Standard page size
        }

        const additionalUrls = await searchForJobUrls(
          searchOptions,
          SERP_API_KEY,
          seenJobIds,
          ctx.logger
        )

        if (additionalUrls.length === 0) break

        // Filter these additional URLs against the database
        const additionalFilteredUrls = await filterExistingUrls(
          additionalUrls,
          supabase,
          ctx.logger
        )

        // Add to our results
        filteredJobUrls.push(...additionalFilteredUrls)

        if (filteredJobUrls.length >= limit) break
      }
    }
  }

  ctx.logger.info(
    `Final collection: ${filteredJobUrls.length} new job URLs after filtering for job ${args.jobId}`
  )

  // Prepare event data
  const eventData: JobUrlsCollectedEvent = {
    jobId: args.jobId,
    query: args.query,
    role: args.role,
    location: args.location,
    jobUrls: filteredJobUrls,
    count: filteredJobUrls.length,
  }

  // Emit the collected URLs
  await ctx.emit({
    topic: 'job.urls.collected',
    data: eventData,
  })

  return eventData
}

/**
 * Searches for job URLs using the given search options
 */
async function searchForJobUrls(
  options: SearchOptions,
  apiKey: string,
  seenJobIds: Set<string>,
  logger: any
): Promise<JobUrl[]> {
  const jobUrls: JobUrl[] = []

  try {
    logger.info(
      `Searching with dork: ${options.dork} (starting from ${options.startIndex})`
    )

    const response = await axios.get('https://serpapi.com/search', {
      params: {
        api_key: apiKey,
        q: options.dork,
        engine: 'google',
        num: options.maxResults,
        start: options.startIndex,
      },
    })

    const results = response.data.organic_results || []

    // Extract and filter URLs that match the pattern
    for (const result of results) {
      const url = result.link
      if (!url) continue

      // Extract job URLs with the correct pattern
      if (url.match(/https:\/\/www\.workatastartup\.com\/jobs\/\d+/)) {
        const jobId = url.split('/').pop() as string

        // Check if this URL is already in our list
        if (!seenJobIds.has(jobId)) {
          jobUrls.push({
            url,
            jobId,
            title: result.title,
          })

          logger.info(`Found job URL: ${url}`)
        }
      }
    }
  } catch (error) {
    logger.error(
      `Error fetching search results for dork "${options.dork}": ${error}`
    )
  }

  return jobUrls
}

/**
 * Filters out URLs that already exist in the database
 */
async function filterExistingUrls(
  jobUrls: JobUrl[],
  supabase: any,
  logger: any
): Promise<JobUrl[]> {
  try {
    if (jobUrls.length === 0) return []

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
    const existingUrlSet = new Set(
      existingUrls.map((lead: any) => lead.job_url)
    )

    // Filter out URLs that already exist in the database
    const filteredJobUrls = jobUrls.filter(
      (job) => !existingUrlSet.has(job.url)
    )

    logger.info(
      `Removed ${
        jobUrls.length - filteredJobUrls.length
      } URLs that already exist in the database`
    )

    return filteredJobUrls
  } catch (error) {
    logger.error(`Error checking database for existing URLs: ${error}`)
    // Continue with potentially duplicate URLs rather than failing completely
    return jobUrls
  }
}
