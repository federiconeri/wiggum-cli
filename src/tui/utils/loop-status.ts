/**
 * Loop status helpers for the TUI run/monitor screens.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfigWithDefaults } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';

/**
 * Find the implementation plan file, checking main project and git worktrees.
 *
 * Shared between loop-status.ts and monitor.ts to avoid duplicating the
 * worktree search logic.
 */
export function findImplementationPlan(
  projectRoot: string,
  specsRelPath: string,
  feature: string,
): string | null {
  // 1. Check main project
  const mainPath = join(projectRoot, specsRelPath, `${feature}-implementation-plan.md`);
  if (existsSync(mainPath)) return mainPath;

  // 2. Check git worktrees for the feature branch
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    const worktrees = output.split('\n\n').filter(Boolean);
    for (const wt of worktrees) {
      const pathMatch = wt.match(/^worktree (.+)$/m);
      const escapedFeature = feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const branchMatch = wt.match(new RegExp(`^branch .+/feat/${escapedFeature}$`, 'm'));
      if (pathMatch && branchMatch) {
        const wtPlan = join(pathMatch[1], specsRelPath, `${feature}-implementation-plan.md`);
        if (existsSync(wtPlan)) return wtPlan;
      }
    }
  } catch {
    // git worktree list failed — ignore
  }

  return null;
}

export interface LoopStatus {
  running: boolean;
  phase: string;
  iteration: number;
  maxIterations: number;
  tokensInput: number;
  tokensOutput: number;
  cacheCreate: number;
  cacheRead: number;
  tokensUpdatedAt?: number;
}

export interface TaskCounts {
  tasksDone: number;
  tasksPending: number;
  e2eDone: number;
  e2ePending: number;
  planExists: boolean;
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
  status: 'success' | 'skipped' | 'failed' | 'started';
  /** Duration in milliseconds, if available */
  durationMs?: number;
  /** Number of iterations in this phase (e.g., for implementation) */
  iterations?: number;
}

/**
 * Phase ID to human-readable label mapping.
 * Matches the phase IDs written by feature-loop.sh.
 */
export const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning',
  implementation: 'Implementation',
  e2e_testing: 'E2E Testing',
  verification: 'Verification',
  pr_review: 'PR & Review',
};

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
  if (isProcessRunning('PROMPT_review_manual.md')) return 'PR Review';
  if (isProcessRunning('PROMPT_review_auto.md')) return 'PR Review';
  if (isProcessRunning('PROMPT.md')) return 'Implementation';
  if (isProcessRunning(`feature-loop.sh.*${feature}`)) return 'Running';
  return 'Idle';
}

/**
 * Read the current phase from the `.phases` file written by feature-loop.sh.
 * Returns the human-readable label of the active phase, or null if unavailable.
 *
 * The file format is: phase_id|status|start_timestamp|end_timestamp
 * A line with status "started" and no end timestamp indicates the active phase.
 */
export function readCurrentPhase(feature: string): string | null {
  const phasesFile = `/tmp/ralph-loop-${feature}.phases`;

  let content: string;
  try {
    content = readFileSync(phasesFile, 'utf-8').trim();
  } catch {
    return null;
  }

  if (!content) return null;

  const lines = content.split('\n');
  let lastStartedPhase: string | null = null;
  let lastCompletedPhase: string | null = null;

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 2) continue;
    const [id, status] = parts;
    if (status === 'started') {
      lastStartedPhase = id;
    } else if (status === 'success' || status === 'failed' || status === 'skipped') {
      lastCompletedPhase = id;
    }
  }

  if (lastStartedPhase) {
    return PHASE_LABELS[lastStartedPhase] || lastStartedPhase;
  }

  if (lastCompletedPhase) {
    const label = PHASE_LABELS[lastCompletedPhase] || lastCompletedPhase;
    return `post-${label}`;
  }

  return null;
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
      // Require at least 2 fields (iteration|maxIterations); skip partial writes
      if (parts.length >= 2) {
        iteration = parseInt(parts[0] || '0', 10) || 0;
        maxIterations = parseInt(parts[1] || '0', 10) || 0;
      } else {
        logger.debug(`Status file has fewer than 2 fields, using defaults: ${content}`);
      }
    } catch (err) {
      logger.debug(`Failed to parse status file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let tokensInput = 0;
  let tokensOutput = 0;
  let cacheCreate = 0;
  let cacheRead = 0;
  let tokensUpdatedAt: number | undefined;
  if (existsSync(tokensFile)) {
    try {
      const content = readFileSync(tokensFile, 'utf-8').trim();
      const parts = content.split('|');
      // Require at least 2 fields (input|output); cache fields are optional (legacy format)
      if (parts.length >= 2) {
        tokensInput = parseInt(parts[0] || '0', 10) || 0;
        tokensOutput = parseInt(parts[1] || '0', 10) || 0;
        cacheCreate = parts.length >= 3 ? (parseInt(parts[2] || '0', 10) || 0) : 0;
        cacheRead = parts.length >= 4 ? (parseInt(parts[3] || '0', 10) || 0) : 0;
        if (parts[4]) {
          const epoch = parseInt(parts[4], 10);
          if (epoch > 0) tokensUpdatedAt = epoch * 1000; // convert to ms
        }
      } else {
        logger.debug(`Tokens file has fewer than 2 fields, using defaults: ${content}`);
      }
    } catch (err) {
      logger.debug(`Failed to parse tokens file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const running = isProcessRunning(`feature-loop.sh.*${feature}`);

  // Prefer .phases file (written by feature-loop.sh on transitions) over process
  // detection. pgrep-based detection can return stale results when old Claude
  // sessions linger, causing the phase to appear stuck (e.g., "Planning" during
  // Verification). The .phases file is the authoritative source of phase transitions.
  const phaseFromFile = readCurrentPhase(feature);
  let phase = phaseFromFile ?? detectPhase(feature);

  return {
    running,
    phase,
    iteration,
    maxIterations,
    tokensInput,
    tokensOutput,
    cacheCreate,
    cacheRead,
    tokensUpdatedAt,
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
  const planPath = findImplementationPlan(projectRoot, specsDir, feature);

  let tasksDone = 0;
  let tasksPending = 0;
  let e2eDone = 0;
  let e2ePending = 0;

  const planExists = planPath !== null;

  if (planPath) {
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

      // Fallback: if no checkboxes found, count "#### Task N:" headers
      if (tasksDone === 0 && tasksPending === 0 && e2eDone === 0 && e2ePending === 0) {
        let headerTaskCount = 0;
        for (const line of lines) {
          if (line.match(/^#{1,4}\s+Task\s+\d+/i)) {
            headerTaskCount++;
          }
        }
        if (headerTaskCount > 0) {
          // Check phases file to determine completion
          const phasesPath = `/tmp/ralph-loop-${feature}.phases`;
          let implDone = false;
          if (existsSync(phasesPath)) {
            const phases = readFileSync(phasesPath, 'utf-8');
            implDone = phases.includes('implementation|success');
          }
          if (implDone) {
            tasksDone = headerTaskCount;
          } else {
            tasksPending = headerTaskCount;
          }
        }
      }
    } catch (err) {
      logger.debug(`Failed to parse implementation plan: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tasksDone, tasksPending, e2eDone, e2ePending, planExists };
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
  let raw: string;
  if (diffSeconds < 60) {
    raw = `${diffSeconds}s ago`;
  } else {
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      raw = `${diffMinutes}m ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      raw = `${diffHours}h ago`;
    }
  }
  return raw.padStart(7);
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

/**
 * Lines matching any of these patterns are filtered out of the activity feed.
 * Order: most common patterns first for faster short-circuit.
 */
const SKIP_LINE_PATTERNS: RegExp[] = [
  // Markdown formatting noise
  /^\|.*\|$/,                              // Pipe-delimited markdown table rows (incl. separator rows)
  /^\d+\.\s/,                              // Numbered list items (1. foo, 2. bar)
  /^\*\*/,                                 // Bold markdown headers (**Summary:**)
  /^#{1,6}\s/,                             // Markdown section headers (## Summary)
  // Separator lines
  /^=+\s*$/,                               // bare separator lines (====)
  /^-+\s*$/,                               // bare dash lines (----)
  /^={5,}\s+\S+.*={5,}$/,                  // phase headers like "======= IMPL PHASE ======="
  /^-{5,}\s+\S+.*-{5,}$/,                  // dashed phase headers
  /^={10,}$/,                              // long separator (top/bottom of log)
  // Iteration / review separators
  /^---\s*(Iteration|Review attempt)/i,    // Iteration separator lines
  // Interactive prompts and action lines
  /^(Action request written|User selected|User chose):/i,
  /^\d+\.\s+(Merge back|Push and create|Keep the branch|Discard this work)/i,
  /^Which option\??$/i,
  /^Implementation complete\.\s+What would you like/i,
  // Token usage and loop lifecycle
  /^(Final Token Usage:|Input:|Output:|Total:)/i,
  /^(Loop complete\. Exiting\.|Ralph loop completed)/i,
  // Loop config / header lines
  /^Ralph Loop:/,
  /^(Spec|Plan|Branch|App dir|Worktree|Resume|Review|Model|Max):/,
  /^Baseline commit:/,
  /^Creating branch:/,
  // Misc noise
  /^\{"/,                                  // Any line starting with JSON object (Claude result, log entries)
  /^Pending implementation tasks: \d+$/,   // raw task count (redundant with progress bar)
  /^Ready for feedback\.?$/i,              // Conversational filler
];

/**
 * Returns true if a log line should be excluded from the activity feed.
 */
export function shouldSkipLine(line: string): boolean {
  return SKIP_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

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

const SUCCESS_KEYWORDS = /\b(completed|passed|success|approved|fixed|resolved|merged|works)\b/i;
const ERROR_KEYWORDS = /\b(error|failed|failure)\b/i;
const POSITIVE_ERROR_CONTEXT = /\b(fixed|resolved|added|handled|handling|recovery|boundary|boundaries|tests?\s+passed)\b/i;

function inferStatus(message: string): ActivityEvent['status'] {
  if (SUCCESS_KEYWORDS.test(message)) return 'success';
  if (ERROR_KEYWORDS.test(message)) {
    // Avoid misclassifying positive actions that mention error-related words
    if (POSITIVE_ERROR_CONTEXT.test(message)) return 'in-progress';
    return 'error';
  }
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
    if (shouldSkipLine(message)) continue;

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

  const content = rawContent.trim();
  if (!content) {
    return { events: [], currentPhases: lastKnownPhases };
  }

  // Parse pipe-delimited format: phase_id|status|start_timestamp|end_timestamp
  const VALID_STATUSES = new Set(['success', 'skipped', 'failed', 'started']);
  const phaseMap = new Map<string, PhaseInfo>();

  for (const line of content.split('\n')) {
    const parts = line.split('|');
    if (parts.length < 2) continue;

    const [id, status] = parts;
    if (!id || !VALID_STATUSES.has(status)) continue;

    const label = PHASE_LABELS[id] || id;
    const validStatus = status as PhaseInfo['status'];

    // Last status wins for each phase id
    phaseMap.set(id, { id, label, status: validStatus });
  }

  const currentPhases = Array.from(phaseMap.values());
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

/**
 * Parse phase information from the phases file written by feature-loop.sh.
 *
 * Format: phase_id|status|start_timestamp|end_timestamp
 * Accepts both 3-field lines (started: phase_id|started|timestamp) and
 * 4-field lines (completed: phase_id|status|start_ts|end_ts).
 *
 * The parser handles duplicate phase entries defensively (last status wins,
 * durations aggregate), though feature-loop.sh normally writes one final
 * line per phase.
 *
 * Used by build-run-summary.ts for completion summaries.
 */
export function parsePhases(phasesFilePath: string): PhaseInfo[] {
  if (!existsSync(phasesFilePath)) {
    return [];
  }

  try {
    const content = readFileSync(phasesFilePath, 'utf-8').trim();
    if (!content) {
      return [];
    }

    const lines = content.split('\n');
    const VALID_STATUSES = new Set(['success', 'skipped', 'failed', 'started']);
    const phaseMap = new Map<string, PhaseInfo>();

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 2) continue;

      const [id, status] = parts;
      if (!id || !VALID_STATUSES.has(status)) {
        logger.warn(`Unknown phase status "${status}" for phase "${id}", treating as failed`);
        // Still process with 'failed' status
      }

      const validatedStatus: PhaseInfo['status'] = VALID_STATUSES.has(status)
        ? (status as PhaseInfo['status'])
        : 'failed';

      // Parse timestamps (may be absent for 3-field 'started' lines)
      const startTime = parts.length >= 3 ? (parseInt(parts[2], 10) || 0) : 0;
      const endTime = parts.length >= 4 ? (parseInt(parts[3], 10) || 0) : 0;

      // Calculate duration (end - start) in milliseconds
      const durationMs = endTime > 0 && startTime > 0 ? (endTime - startTime) * 1000 : undefined;

      // Get or create phase entry
      let phase = phaseMap.get(id);
      if (!phase) {
        phase = {
          id,
          label: PHASE_LABELS[id] || id,
          status: validatedStatus,
          durationMs: 0,
        };
        phaseMap.set(id, phase);
      }

      // Update status (last status wins)
      phase.status = validatedStatus;

      // Aggregate duration
      if (durationMs !== undefined) {
        phase.durationMs = (phase.durationMs || 0) + durationMs;
      }
    }

    return Array.from(phaseMap.values());
  } catch (err) {
    logger.warn(`Failed to parse phases file: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
