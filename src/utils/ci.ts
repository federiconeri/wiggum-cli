/**
 * CI environment detection
 */

/**
 * Returns true when running inside a CI environment.
 * Checks the standard CI and CONTINUOUS_INTEGRATION environment variables.
 */
export function isCI(): boolean {
  return !!process.env['CI'] || !!process.env['CONTINUOUS_INTEGRATION'];
}
