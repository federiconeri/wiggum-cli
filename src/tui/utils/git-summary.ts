/**
 * Git utilities for enhanced run summary.
 */

import { execFileSync } from 'node:child_process';
import { logger } from '../../utils/logger.js';

export interface FileDiffStat {
  path: string;
  added: number;
  removed: number;
}

/**
 * Get the current commit hash (HEAD).
 *
 * @param projectRoot - Root directory of the git repository
 * @returns Short commit hash, or null if not available
 */
export function getCurrentCommitHash(projectRoot: string): string | null {
  try {
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();
    return hash || null;
  } catch (err) {
    logger.warn(`getCurrentCommitHash failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Get diff stats between two commits.
 *
 * @param projectRoot - Root directory of the git repository
 * @param fromHash - Starting commit hash
 * @param toHash - Ending commit hash
 * @returns Array of file diff stats, or null if not available
 */
export function getDiffStats(
  projectRoot: string,
  fromHash: string,
  toHash: string
): FileDiffStat[] | null {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--numstat', `${fromHash}..${toHash}`],
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 10_000,
      }
    ).trim();

    if (!output) {
      return [];
    }

    const stats: FileDiffStat[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Format: <added>\t<removed>\t<path>
      const parts = line.split('\t');
      if (parts.length !== 3) continue;

      const [addedStr, removedStr, path] = parts;

      // Binary files show '-' for added/removed
      const added = addedStr === '-' ? 0 : parseInt(addedStr, 10) || 0;
      const removed = removedStr === '-' ? 0 : parseInt(removedStr, 10) || 0;

      stats.push({ path, added, removed });
    }

    return stats;
  } catch (err) {
    logger.warn(`getDiffStats failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
