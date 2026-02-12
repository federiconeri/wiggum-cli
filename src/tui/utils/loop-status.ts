/**
 * Loop status helpers for the TUI run/monitor screens.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfigWithDefaults } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';

export interface LoopStatus {
  running: boolean;
  phase: string;
  iteration: number;
  maxIterations: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface TaskCounts {
  tasksDone: number;
  tasksPending: number;
  e2eDone: number;
  e2ePending: number;
}

/**
 * Track whether pgrep is available to avoid repeated failed calls.
 * null = untested, true = available, false = unavailable
 */
let pgrepAvailable: boolean | null = null;

/**
 * Check if a process matching pattern is running.
 */
function isProcessRunning(pattern: string): boolean {
  if (pgrepAvailable === false) return false;

  try {
    const result = execFileSync('pgrep', ['-f', pattern], { encoding: 'utf-8' });
    pgrepAvailable = true;
    return result.trim().length > 0;
  } catch (err: unknown) {
    // pgrep exits with code 1 when no processes match — that's expected
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      pgrepAvailable = true;
      return false;
    }
    // Any other error (pgrep not installed, permission denied, etc.)
    if (pgrepAvailable === null) {
      logger.warn(`Process detection unavailable: ${err instanceof Error ? err.message : String(err)}. Background run status may be inaccurate.`);
      pgrepAvailable = false;
    }
    return false;
  }
}

/**
 * Detect current phase of the loop based on active prompt files.
 */
export function detectPhase(feature: string): string {
  if (isProcessRunning('PROMPT_feature.md')) return 'Planning';
  if (isProcessRunning('PROMPT_e2e.md')) return 'E2E Testing';
  if (isProcessRunning('PROMPT_verify.md')) return 'Verification';
  if (isProcessRunning('PROMPT_review_manual.md')) return 'PR Review';
  if (isProcessRunning('PROMPT_review_auto.md')) return 'PR Review';
  if (isProcessRunning('PROMPT.md')) return 'Implementation';
  if (isProcessRunning(`feature-loop.sh.*${feature}`)) return 'Running';
  return 'Idle';
}

/**
 * Read status from temp files.
 */
export function readLoopStatus(feature: string): LoopStatus {
  const statusFile = `/tmp/ralph-loop-${feature}.status`;
  const finalStatusFile = `/tmp/ralph-loop-${feature}.final`;
  const tokensFile = `/tmp/ralph-loop-${feature}.tokens`;

  let iteration = 0;
  let maxIterations = 0;

  if (existsSync(statusFile) || existsSync(finalStatusFile)) {
    const fileToRead = existsSync(statusFile) ? statusFile : finalStatusFile;
    try {
      const content = readFileSync(fileToRead, 'utf-8').trim();
      const parts = content.split('|');
      iteration = parseInt(parts[0] || '0', 10) || 0;
      maxIterations = parseInt(parts[1] || '0', 10) || 0;
    } catch (err) {
      logger.debug(`Failed to parse status file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let tokensInput = 0;
  let tokensOutput = 0;
  if (existsSync(tokensFile)) {
    try {
      const content = readFileSync(tokensFile, 'utf-8').trim();
      const parts = content.split('|');
      tokensInput = parseInt(parts[0] || '0', 10) || 0;
      tokensOutput = parseInt(parts[1] || '0', 10) || 0;
    } catch (err) {
      logger.debug(`Failed to parse tokens file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    running: isProcessRunning(`feature-loop.sh.*${feature}`),
    phase: detectPhase(feature),
    iteration,
    maxIterations,
    tokensInput,
    tokensOutput,
  };
}

/**
 * Parse implementation plan for task counts.
 */
export async function parseImplementationPlan(
  projectRoot: string,
  feature: string,
  specsDirOverride?: string
): Promise<TaskCounts> {
  const config = specsDirOverride
    ? null
    : await loadConfigWithDefaults(projectRoot);
  const specsDir = specsDirOverride || config?.paths.specs || '.ralph/specs';
  const planPath = join(projectRoot, specsDir, `${feature}-implementation-plan.md`);

  let tasksDone = 0;
  let tasksPending = 0;
  let e2eDone = 0;
  let e2ePending = 0;

  if (existsSync(planPath)) {
    try {
      const content = readFileSync(planPath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed.match(/^- \[x\]/)) {
          if (trimmed.includes('E2E:')) {
            e2eDone++;
          } else {
            tasksDone++;
          }
        } else if (trimmed.match(/^- \[ \]/)) {
          if (trimmed.includes('E2E:')) {
            e2ePending++;
          } else {
            tasksPending++;
          }
        }
      }
    } catch (err) {
      logger.debug(`Failed to parse implementation plan: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tasksDone, tasksPending, e2eDone, e2ePending };
}

/**
 * Get current git branch.
 */
export function getGitBranch(projectRoot: string): string {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim() || '(detached HEAD)';
  } catch (err) {
    logger.debug(`getGitBranch failed: ${err instanceof Error ? err.message : String(err)}`);
    return '-';
  }
}

/**
 * Format number with K/M suffix.
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return String(num);
}
