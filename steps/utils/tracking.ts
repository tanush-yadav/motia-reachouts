import { v4 as uuidv4 } from 'uuid'

/**
 * Interface for tracking Job API calls
 */
export interface ApiTrackingInfo {
  jobId: string
  timestamp: string
  service: string
  endpoint: string
  requestParams?: any
  responseCode?: number
  success: boolean
  error?: string
}

/**
 * Stores for tracked job API calls and requests
 */
let apiCallsCache: { [key: string]: ApiTrackingInfo[] } = {}

/**
 * Gets or creates a job ID for a specific query/role combination
 * @param query The search query
 * @param role The job role
 * @returns A consistent job ID
 */
export function getJobId(query: string, role: string): string {
  // Create a unique key from the query and role
  const key = `${query}:${role}`.toLowerCase()

  // Check if we already have a jobId in the cache
  if (!global.__jobIdCache) {
    global.__jobIdCache = {}
  }

  if (!global.__jobIdCache[key]) {
    global.__jobIdCache[key] = uuidv4()
  }

  return global.__jobIdCache[key]
}

/**
 * Creates a new API tracking entry
 * @param jobId The job ID associated with this API call
 * @param service The service being called (e.g., 'apollo', 'google')
 * @param endpoint The specific endpoint or operation
 * @param requestParams Optional request parameters
 * @returns The API tracking info object
 */
export function createApiTrackingEntry(
  jobId: string,
  service: string,
  endpoint: string,
  requestParams?: any
): ApiTrackingInfo {
  return {
    jobId,
    timestamp: new Date().toISOString(),
    service,
    endpoint,
    requestParams,
    success: false, // Will be updated when the call completes
  }
}

/**
 * Tracks an API call
 * @param trackingInfo The tracking info for this API call
 * @param success Whether the call was successful
 * @param responseCode Optional HTTP response code
 * @param error Optional error message if the call failed
 */
export function trackApiCall(
  trackingInfo: ApiTrackingInfo,
  success: boolean,
  responseCode?: number,
  error?: string
): void {
  // Update the tracking info
  trackingInfo.success = success
  trackingInfo.responseCode = responseCode
  trackingInfo.error = error

  // Store in the cache
  if (!apiCallsCache[trackingInfo.jobId]) {
    apiCallsCache[trackingInfo.jobId] = []
  }

  apiCallsCache[trackingInfo.jobId].push(trackingInfo)

  // Only keep the last 100 calls per job
  if (apiCallsCache[trackingInfo.jobId].length > 100) {
    apiCallsCache[trackingInfo.jobId] =
      apiCallsCache[trackingInfo.jobId].slice(-100)
  }
}

/**
 * Gets the API call history for a specific job
 * @param jobId The job ID to get history for
 * @returns Array of API tracking info objects for the job
 */
export function getApiCallHistory(jobId: string): ApiTrackingInfo[] {
  return apiCallsCache[jobId] || []
}

/**
 * Clears old API call history (e.g., calls older than a certain time)
 * @param maxAgeInHours Maximum age in hours to keep API call records
 */
export function cleanupApiCallHistory(maxAgeInHours: number = 24): void {
  const cutoffTime = new Date()
  cutoffTime.setHours(cutoffTime.getHours() - maxAgeInHours)

  // Clear old API calls
  Object.keys(apiCallsCache).forEach((jobId) => {
    apiCallsCache[jobId] = apiCallsCache[jobId].filter((call) => {
      const callTime = new Date(call.timestamp)
      return callTime >= cutoffTime
    })

    // Remove empty arrays
    if (apiCallsCache[jobId].length === 0) {
      delete apiCallsCache[jobId]
    }
  })
}
