/**
 * Loop status helpers for the TUI run/monitor screens.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
 * Phase execution status and timing.
 * Shared between RunScreen and loop-status utilities.
 */
export interface PhaseInfo {
  /** Unique phase identifier (e.g., 'planning', 'implementation') */
  id: string;
  /** Human-readable phase label */
  label: string;
  /** Phase completion status */
  status: 'success' | 'skipped' | 'failed';
  /** Duration in milliseconds, if available */
  durationMs?: number;
  /** Number of iterations in this phase (e.g., for implementation) */
  iterations?: number;
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
 * Return the conventional log file path for a feature loop.
 */
export function getLoopLogPath(feature: string): string {
  return `/tmp/ralph-loop-${feature}.log`;
}

/**
 * Detect current phase of the loop by checking for processes with prompt file patterns in their command line.
 *
 * Note: prompt-file checks (PROMPT_feature.md, etc.) are global — they match any
 * running process, not just the one for `feature`. This is acceptable because
 * concurrent loops are rare, but callers should be aware of the limitation.
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
 * Read loop status from temp files written by feature-loop.sh.
 *
 * Reads `ralph-loop-<feature>.status` (or `.final`) for iteration progress
 * and `ralph-loop-<feature>.tokens` for token counts. Also runs `pgrep` to
 * check whether the loop process is still alive.
 *
 * @throws {Error} If `feature` contains invalid characters.
 */
export function readLoopStatus(feature: string): LoopStatus {
  if (!/^[a-zA-Z0-9_-]+$/.test(feature)) {
    throw new Error(`Invalid feature name: "${feature}". Must contain only letters, numbers, hyphens, and underscores.`);
  }

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
 * Parse the markdown implementation plan for a feature to extract task/E2E counts.
 *
 * Looks for `- [x]` (done) and `- [ ]` (pending) checklist items.
 * Items containing "E2E:" are counted separately as end-to-end tests.
 *
 * @returns Counts of done/pending tasks and E2E tests.
 */
export async function parseImplementationPlan(
  projectRoot: string,
  feature: string,
  specsDirOverride?: string
): Promise<TaskCounts> {
  let config = null;
  if (!specsDirOverride) {
    try {
      config = await loadConfigWithDefaults(projectRoot);
    } catch (err) {
      logger.debug(`Failed to load config for plan parsing: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
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

/**
 * Format epoch milliseconds as a relative time string (e.g., "30s ago", "2m ago", "1h ago").
 */
export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
}

/**
 * A structured activity event derived from loop log or phase changes.
 */
export interface ActivityEvent {
  /** Epoch milliseconds when the event occurred */
  timestamp: number;
  /** Human-readable description of the event */
  message: string;
  /** Inferred status based on event content */
  status: 'success' | 'error' | 'in-progress';
}

const SUCCESS_KEYWORDS = /completed|passed|success|approved|all implementation tasks completed/i;
const ERROR_KEYWORDS = /error|failed|failure/i;

/**
 * Lines matching these patterns are noise and should be skipped entirely.
 */
const SKIP_LINE_PATTERNS = [
  /^=+\s*$/,                                    // bare separator lines (====)
  /^-+\s*$/,                                    // bare dash lines (----)
  /^={5,}\s+\S+.*={5,}$/,                       // phase headers like "======= IMPL PHASE ======="
  /^-{5,}\s+\S+.*-{5,}$/,                       // dashed phase headers
  /^#{1,4}\s/,                                   // markdown headers (### Files Updated)
  /^\d+\.\s+(Merge back|Push and create|Keep the branch|Discard this work)/i, // interactive choices
  /^Which option\??$/i,                          // interactive prompt
  /^Implementation complete\.\s+What would you like/i, // finishing prompt
  /^Ralph Loop:/,                                // loop header info
  /^(Spec|Plan|Branch|App dir|Worktree|Resume|Review|Model|Max):/,  // loop config lines
  /^Baseline commit:/,                           // baseline
  /^Creating branch:/,                           // branch creation
  /^={10,}$/,                                    // long separator (top/bottom of log)
  /^\{"level"/,                                  // JSON log lines (BashTool warnings etc.)
  /^Pending implementation tasks: \d+$/,         // raw task count (redundant with progress bar)
];

/**
 * Strip markdown formatting from a message for cleaner display.
 */
function stripMarkdown(msg: string): string {
  return msg
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold** → bold
    .replace(/`([^`]+)`/g, '$1')          // `code` → code
    .replace(/^\s*[-*]\s+/, '')           // leading bullet points
    .trim();
}

/**
 * Check whether a log line should be skipped from the activity feed.
 */
function shouldSkipLine(line: string): boolean {
  return SKIP_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function inferStatus(message: string): ActivityEvent['status'] {
  if (SUCCESS_KEYWORDS.test(message)) return 'success';
  if (ERROR_KEYWORDS.test(message)) return 'error';
  return 'in-progress';
}

/**
 * Parse the loop log file into structured activity events.
 *
 * Filters out noise lines (separators, markdown headers, interactive prompts,
 * config lines) and strips markdown formatting from remaining messages.
 *
 * @param logPath - Absolute path to the loop log file.
 * @param since - Optional epoch ms cutoff; only return events at or after this time.
 */
export function parseLoopLog(logPath: string, since?: number): ActivityEvent[] {
  let content: string;
  try {
    content = readFileSync(logPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`parseLoopLog: failed to read ${logPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [];
  }

  let fileMtimeMs: number;
  try {
    fileMtimeMs = statSync(logPath).mtimeMs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.debug(`parseLoopLog: statSync failed for ${logPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    fileMtimeMs = Date.now();
  }

  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const events: ActivityEvent[] = [];

  for (const line of lines) {
    // Try to extract a timestamp from common prefixes like "[2024-01-15 10:30:45]" or "2024-01-15T10:30:45"
    let timestamp = fileMtimeMs;
    const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
    if (isoMatch) {
      const parsed = Date.parse(isoMatch[1]);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    }

    const rawMessage = line.replace(/^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*\]\s*/, '').trim();
    if (!rawMessage) continue;

    // Skip noise lines
    if (shouldSkipLine(rawMessage)) continue;

    // Strip markdown formatting
    const message = stripMarkdown(rawMessage);
    if (!message) continue;

    if (since !== undefined && timestamp < since) continue;

    events.push({ timestamp, message, status: inferStatus(message) });
  }

  return events;
}

/**
 * Detect phase changes by comparing current phases file to a known previous state,
 * and emit activity events for newly completed or started phases.
 *
 * @param feature - Feature name (used to locate the phases file).
 * @param lastKnownPhases - Phase array from the previous poll cycle.
 */
export function parsePhaseChanges(
  feature: string,
  lastKnownPhases?: PhaseInfo[]
): { events: ActivityEvent[]; currentPhases?: PhaseInfo[] } {
  const phasesFile = `/tmp/ralph-loop-${feature}.phases`;

  let rawContent: string;
  try {
    rawContent = readFileSync(phasesFile, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`parsePhaseChanges: failed to read ${phasesFile}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { events: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) {
      logger.debug(`parsePhaseChanges: expected array in ${phasesFile}, got ${typeof parsed}`);
      return { events: [], currentPhases: lastKnownPhases };
    }
  } catch (err) {
    logger.debug(`parsePhaseChanges: invalid JSON in ${phasesFile}: ${err instanceof Error ? err.message : String(err)}`);
    return { events: [], currentPhases: lastKnownPhases };
  }

  // Validate each phase has required fields
  const currentPhases: PhaseInfo[] = [];
  for (const item of parsed as unknown[]) {
    if (
      typeof item === 'object' && item !== null &&
      'id' in item && typeof (item as PhaseInfo).id === 'string' &&
      'label' in item && typeof (item as PhaseInfo).label === 'string' &&
      'status' in item && typeof (item as PhaseInfo).status === 'string'
    ) {
      currentPhases.push(item as PhaseInfo);
    }
  }

  const events: ActivityEvent[] = [];
  const now = Date.now();

  for (const current of currentPhases) {
    const prev = lastKnownPhases?.find((p) => p.id === current.id);

    if (!prev) {
      // New phase appeared — emit "started" event
      events.push({
        timestamp: now,
        message: `${current.label} phase started`,
        status: 'in-progress',
      });
    } else if (prev.status !== current.status && (current.status === 'success' || current.status === 'failed')) {
      // Phase transitioned to a terminal state
      events.push({
        timestamp: now,
        message: `${current.label} phase ${current.status === 'success' ? 'completed' : 'failed'}`,
        status: current.status === 'success' ? 'success' : 'error',
      });
    }
  }

  return { events, currentPhases };
}
