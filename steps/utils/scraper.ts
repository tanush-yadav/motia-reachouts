import { Browser } from 'playwright'
import { URL } from 'url'
import {
  CompanyPageDetails,
  FounderInfo,
  JobPageDetails,
} from '../types/common'

/**
 * Scrapes job details from a job posting page
 */
export async function scrapeJobPage(
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
    // Keep this line for potential future use if needed, but we won't populate it now.

    // Look for job description in HTML format (div with class="prose" or similar)
    // Use page.$$ to find all matching elements
    const jobDescriptionElements = await page.$$(
      '.prose, .job-description, .job-details, [data-testid="job-description"]'
    );

    if (jobDescriptionElements.length > 0) {
      let combinedHtmlContent = '';
      logger.info(`Found ${jobDescriptionElements.length} potential job description elements.`);

      for (const element of jobDescriptionElements) {
          try {
              // Try to get HTML content from each element
              const htmlContent = await page.evaluate(
                  (el) => el.innerHTML,
                  element
              );
              if (htmlContent && htmlContent.length > 0) {
                  combinedHtmlContent += htmlContent + '\n\n'; // Add separator
              }
          } catch (error) {
              logger.warn(`Error extracting HTML from a description element: ${error}`);
              // Optionally try innerText as fallback for this specific element
              try {
                  const textContent = await element.innerText();
                  if (textContent && textContent.length > 0) {
                      combinedHtmlContent += `<p>${textContent}</p>\n\n`; // Wrap in paragraph for consistency
                  }
              } catch (innerTextError) {
                  logger.warn(`Error extracting innerText from description element: ${innerTextError}`);
              }
          }
      }

      if (combinedHtmlContent) {
          jobDetails.job_description = combinedHtmlContent.trim();
          logger.info('Combined job description from multiple elements.');
      } else {
          logger.warn('Found description elements but could not extract content.');
      }
    }

    // Fallback to main content if no specific container or content found yet

    // Log the length of job description if found
    if (jobDetails.job_description) {
      logger.info(
        `Job description extracted: ${jobDetails.job_description.length} characters`
      )
    }
  } catch (error) {
    logger.error(`Error scraping job page: ${error}`)
    throw error
  } finally {
    await page.close()
  }

  return jobDetails
}

/**
 * Scrapes company details from a company page
 */
export async function scrapeCompanyPage(
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
        logger.warn(`Error extracting website text: ${error}`)
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
        logger.warn(`Error processing founder link: ${error}`)
      }
    }

    // If we still don't have any founders, fall back to the previous approach
    if (companyDetails.founders.length === 0) {
      // Find founders section
      const foundersSection = await page.$(
        'h2:has-text("Founders"), h3:has-text("Founders"), h4:has-text("Founders")'
      )

      if (foundersSection) {
        // Try extracting founders from this section
        await extractFoundersFromSection(
          page,
          foundersSection,
          companyDetails,
          logger
        )
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

/**
 * Extract founders from a specific section on the page
 */
async function extractFoundersFromSection(
  page: any,
  foundersSection: any,
  companyDetails: CompanyPageDetails,
  logger: any
): Promise<void> {
  try {
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
          if (profile.linkedin_url && !seenLinks.has(profile.linkedin_url)) {
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
  } catch (error) {
    logger.warn(`Error extracting founders from section: ${error}`)
  }
}

/**
 * Finds the best contact from company details
 */
export function findBestContact(
  companyDetails: CompanyPageDetails | null
): FounderInfo | null {
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
