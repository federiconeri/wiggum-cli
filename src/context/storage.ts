/**
 * Context Storage
 * Read/write .ralph/.context.json for persisted project analysis
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { PersistedContext } from './types.js';

export const CONTEXT_VERSION = 1;
const CONTEXT_FILENAME = '.context.json';

/**
 * Get the path to the context file
 */
function getContextFilePath(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  return path.join(root, '.ralph', CONTEXT_FILENAME);
}

/**
 * Save context to .ralph/.context.json
 *
 * Ensures .ralph directory exists. Stamps version automatically.
 * Throws on filesystem errors.
 */
export async function saveContext(
  context: Omit<PersistedContext, 'version'>,
  projectRoot?: string,
): Promise<void> {
  const fullContext: PersistedContext = {
    version: CONTEXT_VERSION,
    ...context,
  };
  const filePath = getContextFilePath(projectRoot);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(fullContext, null, 2), 'utf8');
}

/**
 * Load context from .ralph/.context.json
 *
 * Returns null if file does not exist.
 * Throws if file exists but contains invalid JSON or fails validation.
 */
export async function loadContext(
  projectRoot?: string,
): Promise<PersistedContext | null> {
  const filePath = getContextFilePath(projectRoot);
  let json: string;
  try {
    json = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Failed to parse .ralph/.context.json: invalid JSON`);
  }

  // Basic validation
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as PersistedContext).version !== 'number' ||
    typeof (parsed as PersistedContext).lastAnalyzedAt !== 'string'
  ) {
    throw new Error(
      'Failed to parse .ralph/.context.json: missing required fields (version, lastAnalyzedAt)',
    );
  }

  return parsed as PersistedContext;
}

/**
 * Calculate the age of a persisted context
 */
export function getContextAge(
  context: PersistedContext,
): { ms: number; human: string } {
  const ts = new Date(context.lastAnalyzedAt).getTime();
  const now = Date.now();
  const ms = Math.max(0, now - ts);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let human: string;
  if (days > 0) {
    human = `${days} day${days === 1 ? '' : 's'}`;
  } else if (hours > 0) {
    human = `${hours} hour${hours === 1 ? '' : 's'}`;
  } else if (minutes > 0) {
    human = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  } else {
    human = `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  return { ms, human };
}
