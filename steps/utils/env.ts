/**
 * Gets a required environment variable or throws an error
 */
export function getRequiredEnv(name: string, logger?: any): string {
  const value = process.env[name]
  if (!value) {
    const error = new Error(`${name} environment variable is required`)
    if (logger) {
      logger.error(`${name} not found in environment variables`)
    }
    throw error
  }
  return value
}

/**
 * Gets an optional environment variable with a default value
 */
export function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue
}
