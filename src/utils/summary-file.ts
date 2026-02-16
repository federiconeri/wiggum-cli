/**
 * Summary File Writer
 * Persists enhanced run summaries to JSON files for later retrieval
 */

import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger.js';
import type { RunSummary } from '../tui/screens/RunScreen.js';

/**
 * Write enhanced run summary to a JSON file in the temp directory
 *
 * @param featureName - The feature name used to construct the file path
 * @param summary - The complete RunSummary object to persist
 * @returns Promise that resolves when the file is written, or rejects on error
 *
 * @example
 * ```ts
 * await writeRunSummaryFile('my-feature', {
 *   feature: 'my-feature',
 *   exitCode: 0,
 *   // ... other RunSummary fields
 * });
 * // Writes to: /tmp/ralph-loop-my-feature.summary.json
 * ```
 */
export async function writeRunSummaryFile(
  featureName: string,
  summary: RunSummary
): Promise<void> {
  const dir = process.env.RALPH_SUMMARY_TMP_DIR ?? tmpdir();
  const filePath = join(dir, `ralph-loop-${featureName}.summary.json`);
  const jsonContent = JSON.stringify(summary, null, 2);
  await writeFile(filePath, jsonContent, 'utf8');
  logger.debug(`Summary written to ${filePath}`);
}
