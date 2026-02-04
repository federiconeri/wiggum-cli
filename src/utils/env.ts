/**
 * Env Loader Utility
 * Loads known AI provider API keys from .ralph/.env.local into process.env
 */

/**
 * Parse dotenv-style content into a key-value map.
 * - Ignores empty lines and comments (lines starting with #).
 * - Ignores malformed lines without `=`.
 * - Treats everything after the first `=` as the value.
 * - Trims whitespace around keys and values.
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (!key) continue;
    result[key] = value;
  }

  return result;
}
