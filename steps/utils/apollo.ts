import axios from 'axios'

/**
 * Use Apollo.io API to get email address from a LinkedIn profile URL
 */
export async function getEmailFromLinkedIn(
  linkedinUrl: string,
  apiKey: string,
  logger: any
): Promise<string | null> {
  if (!linkedinUrl) {
    logger.warn('No LinkedIn URL provided')
    return null
  }

  try {
    logger.info(`Looking up email for LinkedIn URL: ${linkedinUrl}`)

    // Prepare the request to Apollo's people/match endpoint
    const url = 'https://api.apollo.io/v1/people/match'
    const payload = {
      api_key: apiKey,
      linkedin_url: linkedinUrl,
    }

    // Make the request
    const response = await axios.post(url, payload)

    // Parse the response
    const data = response.data

    // Check if we got a person record
    if (data.person) {
      const person = data.person

      // Check for email
      const email = person.email
      if (email) {
        logger.info(`Found email for ${linkedinUrl}: ${email}`)
        return email
      }

      // If no direct email, look in contact details
      const contactInfo = person.contact_info || {}
      const emailFromContact = contactInfo.email
      if (emailFromContact) {
        logger.info(
          `Found email from contact info for ${linkedinUrl}: ${emailFromContact}`
        )
        return emailFromContact
      }
    }

    logger.warn(`No email found for LinkedIn URL: ${linkedinUrl}`)
    return null
  } catch (error) {
    logger.error(`Error during Apollo API call: ${error}`)
    return null
  }
}

/**
 * Apollo API response structure for people/match endpoint
 */
export interface ApolloPersonResponse {
  person?: {
    id?: string
    name?: string
    email?: string
    contact_info?: {
      email?: string
    }
    linkedin_url?: string
    title?: string
    organization?: {
      name?: string
    }
  }
  status?: string
}
