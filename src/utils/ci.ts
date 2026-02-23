/**
 * CI environment detection
 */

/**
 * Returns true when running inside a CI environment.
 * Checks the standard CI and CONTINUOUS_INTEGRATION environment variables.
 */
export function isCI(): boolean {
  const ci = process.env['CI'];
  const continuous = process.env['CONTINUOUS_INTEGRATION'];
  return (!!ci && ci !== 'false' && ci !== '0') ||
    (!!continuous && continuous !== 'false' && continuous !== '0');
}
