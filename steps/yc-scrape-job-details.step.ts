import { StepConfig } from '@motiadev/core'
import { Browser, chromium } from 'playwright'
import { URL } from 'url'
import { LeadStatus } from './constants/lead-status'
import {
  JobDetailsScrapedEvent,
  JobUrlsCollectedEvent,
  Lead as OriginalLead,
} from './types/common'
import {
  findBestContact,
  scrapeCompanyPage,
  scrapeJobPage,
} from './utils/scraper'
import { initSupabaseClient } from './utils/supabase'

export const config: StepConfig = {
  type: 'event',
  name: 'YC Job Details Scraper',
  description: 'Scrapes job details and company information from job URLs',
  subscribes: ['job.urls.collected'],
  emits: ['job.details.scraped'],
  flows: ['job-search'],
}

interface JobPageDetails {
  job_url: string
  role_title?: string
  company_name?: string
  job_description?: string
  company_url?: string
  is_remote?: boolean
}

interface CompanyPageDetails {
  company_url: string
  company_website?: string
  company_name?: string
  founders: {
    name?: string
    title?: string
    linkedin_url?: string
  }[]
}

interface Lead extends OriginalLead {
  is_remote?: boolean
}

export async function handler(args: JobUrlsCollectedEvent, ctx: any) {
  ctx.logger.info(`Processing ${args.count} job URLs for role: ${args.role}`)

  // No need to stop the flow if there are no URLs to process
  if (!args.jobUrls || args.jobUrls.length === 0) {
    ctx.logger.warn('No job URLs to process, but continuing the flow')

    const emptyResult: JobDetailsScrapedEvent = {
      query: args.query,
      role: args.role,
      location: args.location,
      leadsCount: 0,
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    }

    await ctx.emit({
      topic: 'job.details.scraped',
      data: emptyResult,
    })

    return emptyResult
  }

  // Initialize Supabase client
  const supabase = initSupabaseClient(ctx.logger)
  const browser = await chromium.launch({ headless: true })
  const leadsData: Lead[] = []

  let processedCount = 0
  let skippedCount = 0
  let errorCount = 0

  try {
    for (const jobData of args.jobUrls) {
      try {
        ctx.logger.info(`Processing job URL: ${jobData.url}`)

        // First check if this URL already exists in the database (double-check)
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('job_url', jobData.url)
          .maybeSingle()

        if (existingLead) {
          ctx.logger.info(`Skipping already processed URL: ${jobData.url}`)
          skippedCount++
          continue
        }

        // Step 1: Scrape job page details
        const jobDetails = await scrapeJobPage(browser, jobData.url, ctx.logger)

        // Step 1.5: Check if the job is remote
        if (!jobDetails.is_remote) {
          ctx.logger.info(
            `Skipping non-remote job: ${jobData.url} (Company: ${jobDetails.company_name}, Role: ${jobDetails.role_title})`
          )
          skippedCount++
          continue // Skip to the next job
        }

        // Step 2: If we have a company URL, scrape company details
        let companyDetails = null
        if (jobDetails.company_url) {
          companyDetails = await scrapeCompanyPage(
            browser,
            jobDetails.company_url,
            ctx.logger
          )

          // Use company name from company page instead of job page
          if (companyDetails && companyDetails.company_name) {
            jobDetails.company_name = companyDetails.company_name
          }
        }

        // Step 3: Find the best contact from the company details
        const contactInfo = findBestContact(companyDetails)

        // Create lead data
        const leadData: Lead = {
          job_url: jobDetails.job_url,
          company_url: jobDetails.company_url,
          company_website: companyDetails?.company_website,
          role_title: jobDetails.role_title,
          company_name: jobDetails.company_name,
          job_description: jobDetails.job_description,
          contact_name: contactInfo?.name,
          contact_title: contactInfo?.title,
          contact_linkedin_url: contactInfo?.linkedin_url,
          contact_email: null,
          status: LeadStatus.SCRAPED,
          is_remote: jobDetails.is_remote,
        }

        // Save to database using Supabase
        const { error: insertError } = await supabase
          .from('leads')
          .insert(leadData)

        if (insertError) {
          throw new Error(`Failed to insert lead data: ${insertError.message}`)
        }

        leadsData.push(leadData)
        processedCount++

        ctx.logger.info(`Successfully processed job: ${jobData.url}`)
      } catch (error) {
        ctx.logger.error(`Error processing job URL ${jobData.url}: ${error}`)

        // Save failed job with error message
        try {
          const { error: insertError } = await supabase.from('leads').insert({
            job_url: jobData.url,
            status: LeadStatus.ERROR,
            error_message:
              error instanceof Error ? error.message : String(error),
          })

          if (insertError) {
            ctx.logger.error(
              `Failed to save error state to database: ${insertError.message}`
            )
          }
        } catch (dbError) {
          ctx.logger.error(`Failed to save error state to database: ${dbError}`)
        }

        errorCount++
      }
    }
  } finally {
    await browser.close()
  }

  ctx.logger.info(
    `Finished processing job URLs. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`
  )

  // Prepare the event data
  const eventData: JobDetailsScrapedEvent = {
    query: args.query,
    role: args.role,
    location: args.location,
    leadsCount: leadsData.length,
    processedCount,
    skippedCount,
    errorCount,
  }

  // Always emit the results to continue the flow, even if we processed 0 leads
  await ctx.emit({
    topic: 'job.details.scraped',
    data: eventData,
  })

  return eventData
}

async function scrapeJobPage(
  browser: Browser,
  url: string,
  logger: any
): Promise<JobPageDetails> {
  logger.info(`Scraping job page: ${url}`)

  const jobDetails: JobPageDetails = {
    job_url: url,
  }

  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })

    // Get role and company from the specific span element
    const companyNameElement = await page.$('.company-name')
    if (companyNameElement) {
      const fullText = await companyNameElement.innerText()
      logger.info(`Found company-name element: ${fullText}`)

      // Parse text like "Ex-Founder at SimCare AI (S24)"
      if (fullText.includes(' at ')) {
        const parts = fullText.split(' at ', 2)
        jobDetails.role_title = parts[0].trim()

        // We'll use company name from the company page instead
        // Only set it temporarily as a fallback
        let companyPart = parts[1].trim()
        if (companyPart.includes(' (')) {
          companyPart = companyPart.split(' (', 1)[0].trim()
        }
        jobDetails.company_name = companyPart
      }
    }

    // If we didn't get the role title from the company name element, look for it directly
    if (!jobDetails.role_title) {
      const roleElement = await page.$('h1')
      if (roleElement) {
        jobDetails.role_title = await roleElement.innerText()
      }
    }

    // Get company URL - direct link to company page
    const companyLink = await page.$('a[href*="/companies/"]')
    if (companyLink) {
      const companyPath = await companyLink.getAttribute('href')
      if (companyPath) {
        jobDetails.company_url = new URL(
          companyPath,
          'https://www.workatastartup.com'
        ).toString()
      }
    }

    // Extract job description - look for specific content sections
    const descriptionSections = []

    // Look for job description in HTML format (div with class="prose" or similar)
    const jobDescriptionHTML = await page.$(
      '.prose, .job-description, .job-details, [data-testid="job-description"]'
    )
    if (jobDescriptionHTML) {
      try {
        // Try to get HTML content first
        const htmlContent = await page.evaluate(
          (el) => el.innerHTML,
          jobDescriptionHTML
        )
        if (htmlContent && htmlContent.length > 0) {
          logger.info('Found job description in HTML format')
          jobDetails.job_description = htmlContent
        } else {
          // Fallback to text if HTML doesn't work
          logger.info('Found job description container, extracting text')
          jobDetails.job_description = await jobDescriptionHTML.innerText()
        }
      } catch (error) {
        logger.info(`Error extracting HTML job description: ${error}`)
        // Try innerText as fallback
        try {
          jobDetails.job_description = await jobDescriptionHTML.innerText()
        } catch (innerTextError) {
          logger.info(
            `Error extracting innerText job description: ${innerTextError}`
          )
        }
      }
    } else {
      logger.info(
        'No specific job description container found, looking for sections...'
      )

      // Look for "About the role" section
      const aboutRole = await page.$(
        'h2:has-text("About the role"), h3:has-text("About the role")'
      )
      if (aboutRole) {
        const content = await page.evaluate((el) => {
          const next = el.nextElementSibling
          return next ? next.innerText : ''
        }, aboutRole)

        if (content) {
          logger.info('Found "About the role" section')
          descriptionSections.push(`About the role\n\n${content}`)
        }
      }

      // Look for "Responsibilities" section
      const responsibilities = await page.$(
        'h2:has-text("Responsibilities"), h3:has-text("Responsibilities")'
      )
      if (responsibilities) {
        const content = await page.evaluate((el) => {
          const next = el.nextElementSibling
          return next ? next.innerText : ''
        }, responsibilities)

        if (content) {
          logger.info('Found "Responsibilities" section')
          descriptionSections.push(`Responsibilities\n\n${content}`)
        }
      }

      // Look for "Requirements" section
      const requirements = await page.$(
        'h2:has-text("Requirements"), h3:has-text("Requirements")'
      )
      if (requirements) {
        const content = await page.evaluate((el) => {
          const next = el.nextElementSibling
          return next ? next.innerText : ''
        }, requirements)

        if (content) {
          logger.info('Found "Requirements" section')
          descriptionSections.push(`Requirements\n\n${content}`)
        }
      }

      // Combine all sections
      if (descriptionSections.length > 0) {
        jobDetails.job_description = descriptionSections.join('\n\n')
        logger.info(
          `Assembled job description from ${descriptionSections.length} sections`
        )
      } else {
        // Fallback to main content if no specific sections found
        logger.info('No specific sections found, falling back to main content')
        const mainContent = await page.$('main')
        if (mainContent) {
          jobDetails.job_description = await mainContent.innerText()
          logger.info('Extracted job description from main content')
        } else {
          logger.info('Could not extract job description')
        }
      }
    }

    // Log the length of job description if found
    if (jobDetails.job_description) {
      logger.info(
        `Job description extracted: ${jobDetails.job_description.length} characters`
      )
    }

    // Extract location details and check for remote
    jobDetails.is_remote = false // Default to false
    const companyDetailsDiv = await page.$('.company-details')
    if (companyDetailsDiv) {
      const detailItems = await companyDetailsDiv.$$eval(
        'div.text-gray-500',
        (divs) => divs.map((div) => div.innerText.trim())
      )
      logger.info(`Found company detail items: ${detailItems.join(', ')}`)

      // First, check if any detail item contains location information with remote
      for (const itemText of detailItems) {
        const lowerText = itemText.toLowerCase()
        // Look for "Remote" anywhere in the job details
        if (lowerText.includes('remote')) {
          logger.info(`Identified as remote job: ${itemText}`)
          jobDetails.is_remote = true
          break // Found remote, no need to check further
        }
      }
    } else {
      logger.info('Could not find company-details div for location check.')
    }
  } catch (error) {
    logger.error(`Error scraping job page: ${error}`)
    throw error
  } finally {
    await page.close()
  }

  return jobDetails
}

async function scrapeCompanyPage(
  browser: Browser,
  url: string,
  logger: any
): Promise<CompanyPageDetails> {
  logger.info(`Scraping company page: ${url}`)

  const companyDetails: CompanyPageDetails = {
    company_url: url,
    founders: [],
  }

  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })

    // Extract company name
    const companyNameElement = await page.$('h1')
    if (companyNameElement) {
      companyDetails.company_name = await companyNameElement.innerText()
      logger.info(`Found company name: ${companyDetails.company_name}`)
    }

    // Extract company website
    const websiteLink = await page.$(
      'div.text-blue-600.ellipsis a[target="_blank"]'
    )
    if (websiteLink) {
      try {
        const websiteText = await websiteLink.innerText()
        if (websiteText) {
          companyDetails.company_website = websiteText.trim()
          logger.info(
            `Found company website: ${companyDetails.company_website}`
          )
        }
      } catch (error) {
        logger.info(`Error extracting website text: ${error}`)
      }
    }

    // Extract founders using the provided selectors
    // Look for LinkedIn links with specific class that indicate founders
    const founderLinkedInLinks = await page.$$(
      'a[href*="linkedin.com"][class*="fa-linkedin"]'
    )

    for (const link of founderLinkedInLinks) {
      try {
        // Get the LinkedIn URL
        const linkedinUrl = await link.getAttribute('href')
        if (!linkedinUrl) continue

        // Find the parent container with founder info
        const founderContainer = await link.evaluateHandle((link) => {
          // Go up the DOM to find the container with both name and title
          let element = link
          for (let i = 0; i < 4; i++) {
            const parent = element.parentElement
            if (!parent) break
            element = parent
            // Look for div with specific classes that likely contains all founder info
            if (
              element.classList.contains('ml-2') ||
              element.classList.contains('w-full')
            ) {
              return element
            }
          }
          return element
        })

        // Extract name and title from the container
        const founderInfo = await founderContainer.evaluate((container) => {
          // Look for name in div with font-medium class
          const nameEl = container.querySelector('div.font-medium, div.mb-1')
          let name = nameEl ? nameEl.innerText : null

          // Clean up name by removing the LinkedIn icon text if present
          if (name && name.includes(' ')) {
            name = name
              .split(' ')
              .filter((part) => !part.includes('linkedin'))
              .join(' ')
          }

          // Look for title in the text content div
          const titleEl = container.querySelector(
            'div.sm\\:text-md, div.text-sm, div.w-full'
          )
          let title = titleEl ? titleEl.innerText : null

          // Extract just the title portion if possible
          if (title && title.toLowerCase().includes('founder')) {
            // Try to extract just the title at the beginning of the text
            const founderMatch = title.match(
              /([^.]+?(founder|ceo|chief)[^.]+?\.)/i
            )
            if (founderMatch) {
              title = founderMatch[0].trim()
            }
          }

          return { name, title }
        })

        if (linkedinUrl || founderInfo.name) {
          const founder = {
            linkedin_url: linkedinUrl,
            name: founderInfo.name,
            title: founderInfo.title || 'Co-founder', // Default title if none found
          }

          // Check for duplicates
          if (
            !companyDetails.founders.some((f) => f.linkedin_url === linkedinUrl)
          ) {
            companyDetails.founders.push(founder)
            logger.info(`Found founder: ${founder.name}, ${founder.title}`)
          }
        }
      } catch (error) {
        logger.info(`Error processing founder link: ${error}`)
      }
    }

    // If we still don't have any founders, fall back to the previous approach
    if (companyDetails.founders.length === 0) {
      // Find founders section
      const foundersSection = await page.$(
        'h2:has-text("Founders"), h3:has-text("Founders"), h4:has-text("Founders")'
      )

      if (foundersSection) {
        // Get the container with founders profiles
        const foundersContainer = await page.evaluate((el) => {
          const container = el.nextElementSibling
          return container ? container.outerHTML : null
        }, foundersSection)

        if (foundersContainer) {
          // Extract all founder profiles
          const founderProfiles = await page.evaluate((html) => {
            const container = document.createElement('div')
            container.innerHTML = html

            const profiles = []

            // Look for LinkedIn links
            const linkedInLinks = container.querySelectorAll(
              'a[href*="linkedin.com"]'
            )

            for (const link of linkedInLinks) {
              // For each LinkedIn link, find the surrounding profile info
              let profileElement = link
              // Go up to likely profile container
              for (let i = 0; i < 3; i++) {
                if (!profileElement.parentElement) break
                profileElement = profileElement.parentElement

                // If this element has multiple children, it might be the profile container
                if (profileElement.children.length >= 3) break
              }

              // Extract profile information
              const profile = {
                name: null,
                title: null,
                linkedin_url: link.href,
              }

              // Find name and title
              const nameElements = profileElement.querySelectorAll(
                'h3, h4, strong, b, p'
              )
              for (const el of nameElements) {
                const text = el.innerText.trim()
                // Skip elements with "founder" which is likely a title
                if (
                  text &&
                  text.length < 50 &&
                  !text.toLowerCase().includes('founder')
                ) {
                  profile.name = text
                  break
                }
              }

              // Find title
              const titleElements = profileElement.querySelectorAll('p, div')
              for (const el of titleElements) {
                const text = el.innerText.trim()
                if (
                  text &&
                  (text.toLowerCase().includes('founder') ||
                    text.toLowerCase().includes('ceo') ||
                    text.toLowerCase().includes('chief'))
                ) {
                  profile.title = text
                  break
                }
              }

              // Only add if we have a LinkedIn URL
              if (profile.linkedin_url) {
                profiles.push(profile)
              }
            }

            return profiles
          }, foundersContainer)

          if (founderProfiles.length > 0) {
            // Filter out duplicates
            const seenLinks = new Set()
            for (const profile of founderProfiles) {
              if (
                profile.linkedin_url &&
                !seenLinks.has(profile.linkedin_url)
              ) {
                seenLinks.add(profile.linkedin_url)

                // If no title was found but we have LinkedIn, set a default title
                if (!profile.title && profile.linkedin_url) {
                  profile.title = 'Co-founder'
                }

                companyDetails.founders.push(profile)
              }
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error scraping company page: ${error}`)
    throw error
  } finally {
    await page.close()
  }

  logger.info(
    `Found ${companyDetails.founders.length} founders for company: ${companyDetails.company_name}`
  )
  return companyDetails
}

function findBestContact(
  companyDetails: CompanyPageDetails | null
): { name?: string; title?: string; linkedin_url?: string } | null {
  if (
    !companyDetails ||
    !companyDetails.founders ||
    companyDetails.founders.length === 0
  ) {
    return null
  }

  // First, look for CEO or primary founder
  for (const founder of companyDetails.founders) {
    const title = founder.title?.toLowerCase() || ''
    if (title && (title.includes('ceo') || title.includes('chief'))) {
      return founder
    }
  }

  // Next, look for any co-founder
  for (const founder of companyDetails.founders) {
    const title = founder.title?.toLowerCase() || ''
    if (title && title.includes('founder')) {
      return founder
    }
  }

  // If no CEO or specific founder title found, return the first founder with a LinkedIn URL
  for (const founder of companyDetails.founders) {
    if (founder.linkedin_url) {
      return founder
    }
  }

  // No suitable LinkedIn URL found
  return null
}
