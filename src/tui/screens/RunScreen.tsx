/**
 * RunScreen - TUI screen for running feature loop
 *
 * Spawns feature-loop.sh and polls status files for progress.
 * Wrapped in AppShell for consistent layout.
 *
 * Supports two modes:
 * - Foreground: spawns the process and monitors it
 * - Monitor-only: polls status files without spawning (for /monitor)
 *
 * Esc backgrounds the run in foreground mode; in monitor mode, Esc returns to shell.
 * On completion, shows RunCompletionSummary inline.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Confirm } from '../components/Confirm.js';
import { Select, type SelectOption } from '../components/Select.js';
import { AppShell } from '../components/AppShell.js';
import { RunCompletionSummary } from '../components/RunCompletionSummary.js';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { colors, theme } from '../theme.js';
import {
  readLoopStatus,
  parseImplementationPlan,
  getGitBranch,
  formatNumber,
  getLoopLogPath,
  parseLoopLog,
  parsePhaseChanges,
  type LoopStatus,
  type TaskCounts,
  type ActivityEvent,
  type PhaseInfo,
} from '../utils/loop-status.js';
import { buildEnhancedRunSummary } from '../utils/build-run-summary.js';
import { writeRunSummaryFile } from '../../utils/summary-file.js';
import { loadConfigWithDefaults } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import type { SessionState } from '../../repl/session-state.js';
import { readActionRequest, writeActionReply, cleanupActionFiles, type ActionRequest } from '../utils/action-inbox.js';

// PhaseInfo is defined in loop-status.ts and re-exported here for backward compatibility
export type { PhaseInfo } from '../utils/loop-status.js';

/**
 * Iteration breakdown across different contexts
 */
export interface IterationBreakdown {
  /** Total iterations across all runs */
  total: number;
  /** Iterations during implementation phase */
  implementation?: number;
  /** Iterations during resume operations */
  resumes?: number;
}

/**
 * File change statistics from git diff
 */
export interface FileChangeStat {
  /** Relative path from project root */
  path: string;
  /** Lines added */
  added: number;
  /** Lines removed */
  removed: number;
}

/**
 * Changes summary with git diff stats
 */
export interface ChangesSummary {
  /** Total number of files changed */
  totalFilesChanged?: number;
  /** Per-file diff statistics */
  files?: FileChangeStat[];
  /** Whether git diff information was available */
  available: boolean;
}

/**
 * Commit information from git
 */
export interface CommitsSummary {
  /** Starting commit hash (short) */
  fromHash?: string;
  /** Ending commit hash (short) */
  toHash?: string;
  /** Merge type if applicable */
  mergeType?: 'squash' | 'normal' | 'none';
  /** Whether git commit information was available */
  available: boolean;
}

/**
 * Pull request metadata
 */
export interface PrSummary {
  /** PR number if created */
  number?: number;
  /** PR URL if created */
  url?: string;
  /** Whether PR information was available to query */
  available: boolean;
  /** Whether a PR was created as part of this loop */
  created: boolean;
}

/**
 * Issue metadata
 */
export interface IssueSummary {
  /** Issue number if linked */
  number?: number;
  /** Issue URL if available */
  url?: string;
  /** Issue status (e.g., 'Closed') */
  status?: string;
  /** Whether issue information was available to query */
  available: boolean;
  /** Whether an issue was linked/closed as part of this loop */
  linked: boolean;
}

export interface RunSummary {
  feature: string;
  /** Legacy field: total iterations (deprecated, use iterationBreakdown.total) */
  iterations: number;
  maxIterations: number;
  tasksDone: number;
  tasksTotal: number;
  tokensInput: number;
  tokensOutput: number;
  exitCode: number;
  /** True when the exit code was inferred (e.g. monitor mode heuristic) rather than observed directly */
  exitCodeInferred?: boolean;
  branch?: string;
  logPath?: string;
  errorTail?: string;

  // Enhanced fields for detailed summary
  /** Loop start timestamp (ISO 8601 or epoch ms) */
  startedAt?: string | number;
  /** Loop end timestamp (ISO 8601 or epoch ms) */
  endedAt?: string | number;
  /** Total duration across all runs/resumes in milliseconds */
  totalDurationMs?: number;
  /** Detailed iteration breakdown */
  iterationBreakdown?: IterationBreakdown;
  /** Task completion counts */
  tasks?: {
    completed: number | null;
    total: number | null;
  };
  /** Phase execution details */
  phases?: PhaseInfo[];
  /** Git diff changes summary */
  changes?: ChangesSummary;
  /** Git commit information */
  commits?: CommitsSummary;
  /** Pull request metadata */
  pr?: PrSummary;
  /** Issue metadata */
  issue?: IssueSummary;
}

export interface RunScreenProps {
  /** Pre-built header element from App */
  header: React.ReactNode;
  featureName: string;
  projectRoot: string;
  sessionState: SessionState;
  /** Monitor-only mode: don't spawn, just poll status */
  monitorOnly?: boolean;
  /** Override review mode from CLI flags (takes precedence over config) */
  reviewMode?: 'manual' | 'auto';
  onComplete: (summary: RunSummary) => void;
  /** Called when user presses Esc to background the run */
  onBackground?: (featureName: string) => void;
  onCancel: () => void;
}

const POLL_INTERVAL_MS = 2500;
const ERROR_TAIL_LINES = 12;

function findFeatureLoopScript(projectRoot: string, scriptsDir: string): string | null {
  const localScript = join(projectRoot, scriptsDir, 'feature-loop.sh');
  if (existsSync(localScript)) {
    return localScript;
  }

  const siblingRalph = join(projectRoot, '..', 'ralph', 'feature-loop.sh');
  if (existsSync(siblingRalph)) {
    return siblingRalph;
  }

  const parentRalph = join(projectRoot, 'feature-loop.sh');
  if (existsSync(parentRalph)) {
    return parentRalph;
  }

  return null;
}

function findSpecFile(projectRoot: string, feature: string, specsDir: string): string | null {
  const possiblePaths = [
    join(projectRoot, specsDir, `${feature}.md`),
    join(projectRoot, '.ralph', 'specs', `${feature}.md`),
    join(projectRoot, 'specs', `${feature}.md`),
  ];

  for (const specPath of possiblePaths) {
    if (existsSync(specPath)) {
      return specPath;
    }
  }

  return null;
}

function ProgressBar({ percent, width = 18 }: { percent: number; width?: number }): React.ReactElement {
  const safePercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((safePercent / 100) * width);
  const empty = Math.max(0, width - filled);

  return (
    <Box flexDirection="row">
      <Text color={colors.green}>{'\u2588'.repeat(filled)}</Text>
      <Text dimColor>{'\u2591'.repeat(empty)}</Text>
    </Box>
  );
}

function formatDuration(start: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function readLogTail(logPath: string, maxLines: number): string | null {
  if (!existsSync(logPath)) return null;
  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trimEnd().split('\n');
    if (lines.length === 0) return null;
    return lines.slice(-maxLines).join('\n');
  } catch (err) {
    return `[Unable to read log: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

export function RunScreen({
  header,
  featureName,
  projectRoot,
  sessionState,
  monitorOnly = false,
  reviewMode: reviewModeProp,
  onComplete,
  onBackground,
  onCancel,
}: RunScreenProps): React.ReactElement {
  const [status, setStatus] = useState<LoopStatus>(() => {
    try {
      return readLoopStatus(featureName);
    } catch (err) {
      logger.error(`Failed to read initial loop status: ${err instanceof Error ? err.message : String(err)}`);
      return { running: false, iteration: 0, maxIterations: 0, phase: 'unknown', tokensInput: 0, tokensOutput: 0 };
    }
  });
  const [tasks, setTasks] = useState<TaskCounts>({
    tasksDone: 0,
    tasksPending: 0,
    e2eDone: 0,
    e2ePending: 0,
  });
  const [branch, setBranch] = useState<string>('-');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(!monitorOnly);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<RunSummary | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  const childRef = useRef<ChildProcess | null>(null);
  const stopRequestedRef = useRef(false);
  const isMountedRef = useRef(true);
  const startTimeRef = useRef<number>(Date.now());
  const specsDirRef = useRef<string>('.ralph/specs');
  const completionSentRef = useRef(false);
  const configRootRef = useRef<string>('.ralph');
  const scriptsDirRef = useRef<string>('.ralph/scripts');
  const maxIterationsRef = useRef<number>(0);
  const maxE2eAttemptsRef = useRef<number>(0);
  const handledActionIdRef = useRef<string | null>(null);
  const lastLogLineCountRef = useRef<number>(0);
  const lastKnownPhasesRef = useRef<PhaseInfo[] | undefined>(undefined);

  useInput((input, key) => {
    // If showing completion summary, Enter or Esc dismisses
    if (completionSummary) {
      if (key.return || key.escape) {
        onComplete(completionSummary);
      }
      return;
    }

    if (showConfirm) return;
    // Action prompt handles its own input (Select component)
    if (actionRequest) return;
    if (key.ctrl && input === 'c') {
      setShowConfirm(true);
      return;
    }
    if (key.escape) {
      if (onBackground && !monitorOnly) {
        // Background the run: don't kill the child, just navigate away
        onBackground(featureName);
      } else {
        onCancel();
      }
    }
  });

  const refreshStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    const nextStatus = readLoopStatus(featureName);
    setStatus(nextStatus);

    const nextTasks = await parseImplementationPlan(projectRoot, featureName, specsDirRef.current);
    if (!isMountedRef.current) return;
    setTasks(nextTasks);

    if (!isMountedRef.current) return;
    setBranch(getGitBranch(projectRoot));

    // Collect new activity events from log and phase changes
    const logPath = getLoopLogPath(featureName);
    const allLogEvents = parseLoopLog(logPath);
    // Detect log file truncation/rotation and reset tracking
    if (allLogEvents.length < lastLogLineCountRef.current) {
      lastLogLineCountRef.current = 0;
    }
    const newLogEvents = allLogEvents.slice(lastLogLineCountRef.current);
    lastLogLineCountRef.current = allLogEvents.length;

    const { events: phaseEvents, currentPhases } = parsePhaseChanges(featureName, lastKnownPhasesRef.current);
    if (currentPhases) {
      lastKnownPhasesRef.current = currentPhases;
    }

    const MAX_STORED_EVENTS = 100;
    const newEvents = [...newLogEvents, ...phaseEvents];
    if (newEvents.length > 0 && isMountedRef.current) {
      setActivityEvents((prev) => [...prev, ...newEvents].slice(-MAX_STORED_EVENTS));
    }

    // Check for pending action request (loop waiting for user input)
    const request = readActionRequest(featureName);
    if (!isMountedRef.current) return;
    if (request) {
      // Only show if we haven't already handled this action
      if (request.id !== handledActionIdRef.current) {
        setActionRequest(request);
      }
    } else {
      // File cleaned up by shell — reset tracking so future requests work
      handledActionIdRef.current = null;
      setActionRequest((prev) => prev ? null : prev);
    }

    // In monitor mode, detect completion (only fire once)
    if (monitorOnly && !nextStatus.running && !completionSentRef.current) {
      completionSentRef.current = true;
      const logPath = getLoopLogPath(featureName);
      const finalMarker = `/tmp/ralph-loop-${featureName}.final`;
      const exitCode = existsSync(finalMarker) ? 0 : 1;
      if (exitCode !== 0) {
        logger.warn(`Monitor mode inferred exit code 1 for ${featureName} (no .final marker). This may be a false negative.`);
      }
      const tasksDone = nextTasks.tasksDone + nextTasks.e2eDone;
      const tasksTotal = tasksDone + nextTasks.tasksPending + nextTasks.e2ePending;
      const errorTail = exitCode !== 0 ? readLogTail(logPath, ERROR_TAIL_LINES) || undefined : undefined;

      const basicSummary: RunSummary = {
        feature: featureName,
        iterations: nextStatus.iteration,
        maxIterations: nextStatus.maxIterations,
        tasksDone,
        tasksTotal,
        tokensInput: nextStatus.tokensInput,
        tokensOutput: nextStatus.tokensOutput,
        exitCode,
        exitCodeInferred: true,
        branch: getGitBranch(projectRoot),
        logPath,
        errorTail,
      };

      let enhancedSummary: RunSummary;
      try {
        enhancedSummary = buildEnhancedRunSummary(basicSummary, projectRoot, featureName);
      } catch (err) {
        logger.error(`Failed to build enhanced summary for ${featureName}: ${err instanceof Error ? err.message : String(err)}`);
        enhancedSummary = basicSummary;
      }
      setCompletionSummary(enhancedSummary);

      // Persist summary to JSON file (non-blocking)
      writeRunSummaryFile(featureName, enhancedSummary).catch((err) => {
        logger.error(`Failed to persist summary file for ${featureName}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }, [featureName, projectRoot, monitorOnly]);

  // Keep a stable ref to the latest refreshStatus so the spawn effect
  // can schedule polls without re-running when refreshStatus changes.
  const refreshStatusRef = useRef(refreshStatus);
  useEffect(() => { refreshStatusRef.current = refreshStatus; }, [refreshStatus]);

  const stopLoop = useCallback(() => {
    stopRequestedRef.current = true;
    if (childRef.current) {
      childRef.current.kill('SIGINT');
    } else if (monitorOnly) {
      // In monitor mode, find and kill the loop process by pattern
      if (!/^[a-zA-Z0-9_-]+$/.test(featureName)) {
        logger.error(`Refusing to run pkill with unsafe feature name: ${featureName}`);
        setError('Feature name contains invalid characters.');
        return;
      }
      try {
        execFileSync('pkill', ['-INT', '-f', `feature-loop.sh.*${featureName}`]);
      } catch (err: unknown) {
        // pkill exit code 1 = no matching process (already exited)
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
          // Expected — process already exited
        } else {
          const reason = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to stop loop process for ${featureName}: ${reason}`);
          setError(`Could not stop the loop process (${reason}). You may need to kill it manually.`);
        }
      }
    }
  }, [monitorOnly, featureName]);

  const handleConfirm = useCallback((value: boolean) => {
    setShowConfirm(false);
    if (value) {
      stopLoop();
    }
  }, [stopLoop]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    if (monitorOnly) {
      // Monitor mode: load config for correct specs path, then poll
      const initMonitor = async () => {
        try {
          const config = sessionState.config ?? await loadConfigWithDefaults(projectRoot);
          specsDirRef.current = config.paths.specs;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to load config for monitor mode: ${reason}`);
          // Keep default .ralph/specs but warn user
          if (!cancelled) setError(`Could not load project config (${reason}). Showing status from default paths.`);
        }
        if (cancelled) return;
        setIsStarting(false);
        refreshStatusRef.current().catch((err: unknown) => {
          logger.warn(`Status refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        pollTimer = setInterval(() => {
          refreshStatusRef.current().catch((err: unknown) => {
            logger.warn(`Status refresh failed: ${err instanceof Error ? err.message : String(err)}`);
          });
        }, POLL_INTERVAL_MS);
      };
      initMonitor();

      return () => {
        cancelled = true;
        isMountedRef.current = false;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    // Foreground mode: spawn the process
    const startLoop = async () => {
      try {
        if (!/^[a-zA-Z0-9_-]+$/.test(featureName)) {
          setError('Feature name must contain only letters, numbers, hyphens, and underscores.');
          setIsStarting(false);
          return;
        }

        const config = sessionState.config ?? await loadConfigWithDefaults(projectRoot);
        specsDirRef.current = config.paths.specs;
        scriptsDirRef.current = config.paths.scripts;
        configRootRef.current = config.paths.root;
        maxIterationsRef.current = config.loop.maxIterations;
        maxE2eAttemptsRef.current = config.loop.maxE2eAttempts;

        const specFile = findSpecFile(projectRoot, featureName, config.paths.specs);
        if (!specFile) {
          setError(`Spec file not found for "${featureName}". Run /new ${featureName} first.`);
          setIsStarting(false);
          return;
        }

        const scriptPath = findFeatureLoopScript(projectRoot, config.paths.scripts);
        if (!scriptPath) {
          setError('feature-loop.sh script not found. Run /init to generate scripts.');
          setIsStarting(false);
          return;
        }

        const reviewMode = reviewModeProp ?? config.loop.reviewMode ?? 'manual';
        if (reviewMode !== 'manual' && reviewMode !== 'auto' && reviewMode !== 'merge') {
          setError(`Invalid reviewMode '${reviewMode}'. Allowed values are 'manual', 'auto', or 'merge'.`);
          setIsStarting(false);
          return;
        }

        // Clean up stale action files from previous runs
        await cleanupActionFiles(featureName).catch((err) => {
          logger.warn(`Failed to clean up stale action files: ${err instanceof Error ? err.message : String(err)}`);
        });

        const logPath = getLoopLogPath(featureName);
        const logFd = openSync(logPath, 'a');
        let logFdClosed = false;

        try {
          const args = [
            featureName,
            String(config.loop.maxIterations),
            String(config.loop.maxE2eAttempts),
            '--review-mode',
            reviewMode,
          ];

          const child = spawn('bash', [scriptPath, ...args], {
            cwd: dirname(scriptPath),
            stdio: ['ignore', logFd, logFd],
            env: {
              ...process.env,
              RALPH_CONFIG_ROOT: config.paths.root,
              RALPH_SPEC_DIR: config.paths.specs,
              RALPH_SCRIPTS_DIR: config.paths.scripts,
            },
          });

          childRef.current = child;
          startTimeRef.current = Date.now();
          setIsStarting(false);

          if (stopRequestedRef.current) {
            child.kill('SIGINT');
          }

          pollTimer = setInterval(() => {
            refreshStatusRef.current().catch((err: unknown) => {
              logger.warn(`Status refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            });
          }, POLL_INTERVAL_MS);

          refreshStatusRef.current().catch((err: unknown) => {
            logger.warn(`Status refresh failed: ${err instanceof Error ? err.message : String(err)}`);
          });

          child.on('error', (err) => {
            if (!logFdClosed) { closeSync(logFd); logFdClosed = true; }
            if (cancelled) return;
            setError(`Failed to start feature loop: ${err.message}`);
          });

          child.on('close', async (code) => {
            if (cancelled) return;
            if (pollTimer) clearInterval(pollTimer);
            if (!logFdClosed) { closeSync(logFd); logFdClosed = true; }
            if (!isMountedRef.current) return;

            let latestStatus: LoopStatus;
            let latestTasks: TaskCounts;
            try {
              latestStatus = readLoopStatus(featureName);
              latestTasks = await parseImplementationPlan(projectRoot, featureName, specsDirRef.current);
            } catch (err) {
              logger.error(`Failed to read final run status for ${featureName}: ${err instanceof Error ? err.message : String(err)}`);
              latestStatus = { running: false, iteration: 0, maxIterations: config.loop.maxIterations, phase: 'unknown', tokensInput: 0, tokensOutput: 0 };
              latestTasks = { tasksDone: 0, tasksPending: 0, e2eDone: 0, e2ePending: 0 };
            }

            const tasksDone = latestTasks.tasksDone + latestTasks.e2eDone;
            const tasksTotal = tasksDone + latestTasks.tasksPending + latestTasks.e2ePending;
            const exitCode = typeof code === 'number' ? code : 1;
            const errorTail = exitCode === 0 ? undefined : readLogTail(logPath, ERROR_TAIL_LINES) || undefined;

            const basicSummary: RunSummary = {
              feature: featureName,
              iterations: latestStatus.iteration,
              maxIterations: latestStatus.maxIterations || config.loop.maxIterations,
              tasksDone,
              tasksTotal,
              tokensInput: latestStatus.tokensInput,
              tokensOutput: latestStatus.tokensOutput,
              exitCode,
              branch: getGitBranch(projectRoot),
              logPath,
              errorTail,
            };

            // Build enhanced summary with phases, git stats, PR/issue metadata
            let enhancedSummary: RunSummary;
            try {
              enhancedSummary = buildEnhancedRunSummary(basicSummary, projectRoot, featureName);
            } catch (err) {
              logger.error(`Failed to build enhanced summary for ${featureName}: ${err instanceof Error ? err.message : String(err)}`);
              enhancedSummary = basicSummary;
            }

            // Show completion summary inline
            setCompletionSummary(enhancedSummary);

            // Persist summary to JSON file (non-blocking)
            writeRunSummaryFile(featureName, enhancedSummary).catch((err) => {
              logger.error(`Failed to persist summary file for ${featureName}: ${err instanceof Error ? err.message : String(err)}`);
            });
          });
        } catch (spawnErr) {
          if (!logFdClosed) { closeSync(logFd); logFdClosed = true; }
          throw spawnErr;
        }
      } catch (err) {
        if (cancelled) return;
        setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        setIsStarting(false);
      }
    };

    startLoop();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  // Note: refreshStatusRef (not refreshStatus) is used inside to avoid re-spawning
  // the child process when the callback identity changes due to actionRequest updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureName, projectRoot, monitorOnly, sessionState.config]);

  const totalTasks = tasks.tasksDone + tasks.tasksPending;
  const totalE2e = tasks.e2eDone + tasks.e2ePending;
  const totalAll = totalTasks + totalE2e;
  const doneAll = tasks.tasksDone + tasks.e2eDone;
  const percentTasks = totalTasks > 0 ? Math.round((tasks.tasksDone / totalTasks) * 100) : 0;
  const percentE2e = totalE2e > 0 ? Math.round((tasks.e2eDone / totalE2e) * 100) : 0;
  const percentAll = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

  const totalTokens = status.tokensInput + status.tokensOutput;
  const phaseLine = isStarting ? 'Starting...' : status.phase;
  const isRunning = !completionSummary && !error;

  // Tips text
  const tips = completionSummary
    ? 'Enter to return to shell'
    : actionRequest
      ? 'Select an option, Esc for default'
      : monitorOnly
        ? 'Ctrl+C stop, Esc back'
        : 'Ctrl+C stop, Esc background';

  // Action select handler — awaits write before clearing prompt
  const handleActionSelect = useCallback(async (choiceId: string) => {
    if (!actionRequest) return;
    try {
      await writeActionReply(featureName, { id: actionRequest.id, choice: choiceId });
      handledActionIdRef.current = actionRequest.id;
      setActionRequest(null);
    } catch (err) {
      logger.error(`Failed to write action reply: ${err instanceof Error ? err.message : String(err)}`);
      setError(`Failed to send action reply. The loop may time out to the default.`);
    }
  }, [actionRequest, featureName]);

  // Action cancel handler (Esc = use default) — awaits write before clearing
  const handleActionCancel = useCallback(async () => {
    if (!actionRequest) return;
    try {
      await writeActionReply(featureName, { id: actionRequest.id, choice: actionRequest.default });
      handledActionIdRef.current = actionRequest.id;
      setActionRequest(null);
    } catch (err) {
      logger.error(`Failed to write action reply (default): ${err instanceof Error ? err.message : String(err)}`);
      setError(`Failed to send action reply. The loop may time out to the default.`);
    }
  }, [actionRequest, featureName]);

  // Input element: completionSummary > showConfirm > actionRequest > null
  const actionSelectOptions: SelectOption<string>[] | null = actionRequest
    ? actionRequest.choices.map((c) => ({ value: c.id, label: c.label }))
    : null;
  const actionInitialIndex = actionRequest
    ? Math.max(0, actionRequest.choices.findIndex((c) => c.id === actionRequest.default))
    : 0;

  const inputElement = showConfirm ? (
    <Confirm
      message={stopRequestedRef.current ? 'Stopping loop...' : 'Stop the feature loop?'}
      onConfirm={handleConfirm}
      onCancel={() => setShowConfirm(false)}
      initialValue={false}
    />
  ) : !completionSummary && actionRequest && actionSelectOptions ? (
    <Select<string>
      message={actionRequest.prompt}
      options={actionSelectOptions}
      onSelect={handleActionSelect}
      onCancel={handleActionCancel}
      initialIndex={actionInitialIndex}
    />
  ) : null;

  return (
    <AppShell
      header={header}
      tips={tips}
      isWorking={isRunning && !isStarting}
      workingStatus={`${phaseLine} \u2014 ${featureName}`}
      workingHint={monitorOnly ? 'esc to go back' : 'esc to background'}
      input={inputElement}
      error={error}
      footerStatus={{
        action: 'Run Loop',
        phase: phaseLine,
        path: featureName,
      }}
    >
      {completionSummary ? (
        <RunCompletionSummary summary={completionSummary} />
      ) : (
        !error && (
          <>
            <Box marginTop={1} flexDirection="row">
              <Text>Phase: </Text>
              <Text color={colors.yellow}>{phaseLine}</Text>
              <Text dimColor>{theme.statusLine.separator}</Text>
              <Text>Iter: </Text>
              <Text color={colors.green}>{status.iteration}</Text>
              <Text dimColor>/{status.maxIterations || maxIterationsRef.current || '-'}</Text>
              <Text dimColor>{theme.statusLine.separator}</Text>
              <Text>Branch: </Text>
              <Text color={colors.blue}>{branch}</Text>
            </Box>

            <Box marginTop={1} flexDirection="row">
              <Text>Tokens: </Text>
              <Text color={colors.pink}>{formatNumber(totalTokens)}</Text>
              <Text dimColor> (in:{formatNumber(status.tokensInput)} out:{formatNumber(status.tokensOutput)})</Text>
              <Text dimColor>{theme.statusLine.separator}</Text>
              <Text dimColor>Elapsed: {formatDuration(startTimeRef.current)}</Text>
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Box flexDirection="row" alignItems="center" gap={1}>
                <Text bold>Implementation:</Text>
                <ProgressBar percent={percentTasks} />
                <Text>{percentTasks}%</Text>
                <Text color={colors.green}>{'\u2713'} {tasks.tasksDone}</Text>
                <Text color={colors.yellow}>{'\u25cb'} {tasks.tasksPending}</Text>
              </Box>

              {totalE2e > 0 && (
                <Box flexDirection="row" alignItems="center" gap={1}>
                  <Text bold>E2E Tests:</Text>
                  <ProgressBar percent={percentE2e} />
                  <Text>{percentE2e}%</Text>
                  <Text color={colors.green}>{'\u2713'} {tasks.e2eDone}</Text>
                  <Text color={colors.yellow}>{'\u25cb'} {tasks.e2ePending}</Text>
                </Box>
              )}

              <Box flexDirection="row" alignItems="center" gap={1} marginTop={1}>
                <Text bold>Overall:</Text>
                <ProgressBar percent={percentAll} />
                <Text>{percentAll}%</Text>
                <Text color={colors.green}>{'\u2713'} {doneAll}</Text>
                <Text color={colors.yellow}>{'\u25cb'} {totalAll - doneAll}</Text>
              </Box>
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text bold>Activity</Text>
              <ActivityFeed events={activityEvents} />
            </Box>
          </>
        )
      )}
    </AppShell>
  );
}
