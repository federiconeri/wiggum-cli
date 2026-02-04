/**
 * Env Loader Utility
 * Loads known AI provider API keys from .ralph/.env.local into process.env
 */

import fs from 'fs';
import path from 'path';
import { KNOWN_API_KEYS } from '../ai/providers.js';
import { logger } from './logger.js';

/**
 * Parse dotenv-style content into a key-value map.
 * - Ignores empty lines and comments (lines starting with #).
 * - Ignores malformed lines without `=`.
 * - Treats everything after the first `=` as the value.
 * - Trims whitespace around keys and values.
 * - Strips matching surrounding quotes (single or double) from values.
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    // Strip matching surrounding quotes
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }

    if (!key) continue;
    result[key] = value;
  }

  return result;
}

/**
 * Load known AI provider API keys from .ralph/.env.local into process.env.
 *
 * - Only keys in KNOWN_API_KEYS are loaded; all others are ignored.
 * - File values override existing process.env values (file takes precedence).
 * - If the file does not exist or cannot be read, this is a silent no-op.
 * - Malformed lines are skipped without aborting.
 */
export function loadApiKeysFromEnvLocal(): void {
  try {
    const envPath = path.join(process.cwd(), '.ralph', '.env.local');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnvContent(content);

    for (const key of KNOWN_API_KEYS) {
      if (parsed[key] !== undefined && parsed[key] !== '') {
        process.env[key] = parsed[key];
      }
    }
  } catch (err) {
    logger.debug(`Failed to load .ralph/.env.local: ${err instanceof Error ? err.message : String(err)}`);
  }
}
