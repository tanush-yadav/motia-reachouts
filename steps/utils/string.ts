/**
 * Extracts the first name from a full name string
 * @param fullName The full name string to extract from
 * @returns The first name only
 */
export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ''

  // Remove any titles or designations
  const cleanName = fullName.replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, '').trim()

  // Split by whitespace and take the first part
  return cleanName.split(/\s+/)[0].trim()
}

/**
 * Cleans a string by removing excessive whitespace
 * @param str The string to clean
 * @returns The cleaned string
 */
export function cleanString(str: string | null | undefined): string {
  if (!str) return ''

  return str
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .trim() // Remove leading/trailing whitespace
}

/**
 * Checks if a string contains another string, case insensitive
 * @param str The string to check
 * @param search The substring to look for
 * @returns True if the string contains the substring
 */
export function containsIgnoreCase(
  str: string | null | undefined,
  search: string
): boolean {
  if (!str) return false
  return str.toLowerCase().includes(search.toLowerCase())
}

/**
 * Removes excessive padding (whitespace or repeated characters) in text templates
 * @param text The text to process
 * @returns The text with normalized padding
 */
export function normalizeTemplatePadding(text: string): string {
  if (!text) return ''

  return (
    text
      // Fix horizontal padding (remove excess spaces at line beginnings/ends)
      .replace(/^[ \t]+/gm, '') // Remove leading spaces on each line
      .replace(/[ \t]+$/gm, '') // Remove trailing spaces on each line
      .replace(/[ \t]{2,}/g, ' ') // Replace 2+ spaces with single space

      // Fix vertical padding (excessive newlines)
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2 newlines
      .trim()
  ) // Trim the entire string
}

/**
 * Capitalizes the first letter of a string
 * @param str The string to capitalize
 * @returns The capitalized string
 */
export function capitalize(str: string | null | undefined): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Formats a job role title for consistency
 * @param role The job role title to format
 * @returns The formatted job role
 */
export function formatRoleTitle(role: string | null | undefined): string {
  if (!role) return ''

  const cleanRole = cleanString(role)

  // Remove common prefixes like "Looking for a..." or "Hiring a..."
  return cleanRole
    .replace(/^(looking\s+for\s+a|hiring\s+a|seeking\s+a|need\s+a)\s+/i, '')
    .replace(/^(a|an)\s+/i, '')
    .trim()
}

/**
 * Extracts the core role title by removing qualifiers in parentheses and after slashes
 * Examples:
 * "Founding Engineer (Fullstack / AI)" -> "Founding Engineer"
 * "Founding Engineer / Full Stack" -> "Founding Engineer"
 * "Founding Engineer (Platform)" -> "Founding Engineer"
 *
 * @param roleTitle The full role title to extract from
 * @returns The core role title
 */
export function extractCoreRole(roleTitle: string | null | undefined): string {
  if (!roleTitle) return ''

  // First, remove anything in parentheses (including the parentheses)
  let coreRole = roleTitle.replace(/\s*\([^)]*\)/g, '')

  // Remove anything after a slash or dash
  coreRole = coreRole.split(/\s*[/\-]\s*/)[0]

  // Remove any commas and text after them (which might be from parenthetical content)
  coreRole = coreRole.split(',')[0]

  // Final cleanup of any remaining whitespace
  return coreRole.trim()
}
