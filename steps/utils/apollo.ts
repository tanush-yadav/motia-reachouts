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
      linkedin_url: linkedinUrl,
    }

    // Set headers with API key
    const headers = {
      'X-Api-Key': apiKey
    }

    // Log request details (masking the API key)
    logger.info(`Apollo API Request: POST ${url}`)

    // Make the request with headers
    const response = await axios.post(url, payload, { headers })

    // Log response info
    logger.info(`Apollo API Response Status: ${response.status}`)

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
    logger.debug(`Apollo API full response: ${JSON.stringify(data, null, 2)}`)
    return null
  } catch (error) {
    // Enhanced error logging
    logger.error(`Apollo API call failed for LinkedIn URL: ${linkedinUrl}`)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      logger.error(`Status: ${error.response.status}`)
      logger.error(
        `Headers: ${JSON.stringify(error.response.headers, null, 2)}`
      )
      logger.error(
        `Response data: ${JSON.stringify(error.response.data, null, 2)}`
      )
    } else if (error.request) {
      // The request was made but no response was received
      logger.error('No response received from Apollo API')
      logger.error(`Request details: ${JSON.stringify(error.request, null, 2)}`)
    } else {
      // Something happened in setting up the request
      logger.error(`Error message: ${error.message}`)
      logger.error(`Error stack: ${error.stack}`)
    }
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
