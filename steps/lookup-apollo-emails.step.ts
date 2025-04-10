import { StepConfig } from '@motiadev/core'
import { LeadStatus } from './constants/lead-status'
import {
  ApolloEmailsUpdatedEvent,
  JobDetailsScrapedEvent,
} from './types/common'
import { getEmailFromLinkedIn } from './utils/apollo'
import { getRequiredEnv } from './utils/env'
import { initSupabaseClient } from './utils/supabase'
import {
  createApiTrackingEntry,
  getJobId,
  trackApiCall,
} from './utils/tracking'

export const config: StepConfig = {
  type: 'event',
  name: 'Apollo Email Lookup',
  description:
    'Looks up emails for leads with LinkedIn URLs using Apollo.io API',
  subscribes: ['job.details.scraped'],
  emits: ['apollo.emails.updated'],
  flows: ['job-search'],
}

export async function handler(args: JobDetailsScrapedEvent, ctx: any) {
  ctx.logger.info(
    `Processing Apollo email lookups for ${args.leadsCount} leads`
  )

  // Get job ID for tracking
  const jobId = getJobId(args.query, args.role)
  ctx.logger.info(`Using job ID: ${jobId} for tracking`)

  // Verify Apollo API key is present
  const apolloApiKey = getRequiredEnv('APOLLO_API_KEY', ctx.logger)

  // Initialize Supabase client
  const supabase = initSupabaseClient(ctx.logger)

  // Query leads with LinkedIn URLs but no emails
  const { data: leads, error: queryError } = await supabase
    .from('leads')
    .select('id, contact_linkedin_url, contact_name, company_name, role_title')
    .is('contact_email', null)
    .not('contact_linkedin_url', 'is', null)
    .eq('status', LeadStatus.SCRAPED)
    .limit(100) // Process in batches to avoid rate limits

  if (queryError) {
    ctx.logger.error(`Error querying leads: ${queryError.message}`)
    throw queryError
  }

  if (!leads || leads.length === 0) {
    ctx.logger.info(
      'No leads found that need email lookup, but continuing the flow'
    )

    // Create an empty result to continue the flow
    const emptyResult: ApolloEmailsUpdatedEvent = {
      query: args.query,
      role: args.role,
      location: args.location,
      totalLeads: 0,
      emailsFound: 0,
      errors: 0,
    }

    await ctx.emit({
      topic: 'apollo.emails.updated',
      data: emptyResult,
    })

    return emptyResult
  }

  ctx.logger.info(`Found ${leads.length} leads that need email lookup`)

  let emailsFound = 0
  let errors = 0
  let foundLeadIds: string[] = []

  // Process each lead
  for (const lead of leads) {
    try {
      if (!lead.contact_linkedin_url) continue

      ctx.logger.info(
        `Looking up email for ${lead.contact_name || 'contact'} at ${
          lead.company_name || 'company'
        }`
      )

      // Create tracking entry for this API call
      const tracking = createApiTrackingEntry(jobId, 'apollo', 'people/match', {
        linkedin_url: lead.contact_linkedin_url,
      })

      try {
        // Call Apollo API to get email
        const email = await getEmailFromLinkedIn(
          lead.contact_linkedin_url,
          apolloApiKey,
          ctx.logger
        )

        // Track success
        trackApiCall(tracking, true)

        if (email) {
          // Update the lead with the found email
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              contact_email: email,
              status: LeadStatus.EMAIL_FOUND,
            })
            .eq('id', lead.id)

          if (updateError) {
            ctx.logger.error(
              `Error updating lead with email: ${updateError.message}`
            )
            errors++
          } else {
            emailsFound++
            foundLeadIds.push(lead.id)
            ctx.logger.info(`Updated lead with email: ${email}`)
          }
        } else {
          // Update status to indicate email lookup was attempted but not found
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              status: LeadStatus.EMAIL_NOT_FOUND,
            })
            .eq('id', lead.id)

          if (updateError) {
            ctx.logger.error(
              `Error updating lead status: ${updateError.message}`
            )
            errors++
          }
        }
      } catch (apiError) {
        // Track API failure
        trackApiCall(tracking, false, undefined, apiError.message)
        throw apiError
      }

      // Add a small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      ctx.logger.error(`Error processing lead ${lead.id}: ${error}`)
      errors++
    }
  }

  ctx.logger.info(
    `Finished processing. Found ${emailsFound} emails out of ${leads.length} leads. Errors: ${errors}`
  )

  const result: ApolloEmailsUpdatedEvent = {
    query: args.query,
    role: args.role,
    location: args.location,
    totalLeads: leads.length,
    emailsFound,
    errors,
    leadIds: foundLeadIds.length > 0 ? foundLeadIds : undefined,
  }

  // Always emit results to continue the flow
  await ctx.emit({
    topic: 'apollo.emails.updated',
    data: result,
  })

  return result
}
