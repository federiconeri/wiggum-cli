/**
 * useAgentOrchestrator — React hook that bridges the agent orchestrator
 * lifecycle to TUI state via callbacks.
 *
 * Creates the orchestrator, runs it via stream(), and interprets tool
 * calls into structured state (active issue, queue, completed, log).
 * Exposes an abort() function for clean shutdown on q/Esc.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveAgentEnv } from '../../agent/resolve-config.js';
import {
  createAgentOrchestrator,
} from '../../agent/orchestrator.js';
import type {
  AgentConfig,
  AgentOrchestratorEvent,
  AgentStepEvent,
  AgentIssueState,
  AgentLogEntry,
  AgentPhase,
  ReviewMode,
} from '../../agent/types.js';
import { initTracing, flushTracing } from '../../utils/tracing.js';
import {
  readCurrentPhase,
  readLoopStatus,
  parseLoopLogDelta,
  parsePhaseChanges,
  parseImplementationPlan,
  getLoopLogPath,
  shouldSkipLine,
  formatNumber,
  getGitBranch,
  type LoopStatus,
  type TaskCounts,
  type ActivityEvent,
  type PhaseInfo,
} from '../utils/loop-status.js';
import { getCurrentCommitHash, getRecentCommits, type CommitLogEntry } from '../utils/git-summary.js';

const MAX_LOG_ENTRIES = 500;

export type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

export interface UseAgentOrchestratorOptions {
  projectRoot: string;
  modelOverride?: string;
  maxItems?: number;
  maxSteps?: number;
  labels?: string[];
  issues?: number[];
  reviewMode?: ReviewMode;
  dryRun?: boolean;
}

export interface LoopMonitorData {
  loopStatus: LoopStatus;
  tasks: TaskCounts;
  branch: string;
  recentCommits: CommitLogEntry[];
  activityEvents: ActivityEvent[];
  startTime: number;
}

export interface UseAgentOrchestratorResult {
  status: AgentStatus;
  activeIssue: AgentIssueState | null;
  queue: AgentIssueState[];
  completed: AgentIssueState[];
  logEntries: AgentLogEntry[];
  loopMonitor: LoopMonitorData | null;
  error: string | null;
  abort: () => void;
}

function now(): string {
  return new Date().toISOString();
}

const MAX_LOG_LINE_LENGTH = 120;

function appendLog(
  prev: AgentLogEntry[],
  message: string,
  level: AgentLogEntry['level'] = 'info',
): AgentLogEntry[] {
  const truncated = message.length > MAX_LOG_LINE_LENGTH
    ? message.slice(0, MAX_LOG_LINE_LENGTH - 1) + '\u2026'
    : message;
  const next = [...prev, { timestamp: now(), message: truncated, level }];
  if (next.length > MAX_LOG_ENTRIES) {
    return next.slice(next.length - MAX_LOG_ENTRIES);
  }
  return next;
}

interface PollingState {
  interval: ReturnType<typeof setInterval>;
  featureName: string;
  lastLogCursor: number;
  lastPhases?: PhaseInfo[];
}

/**
 * Interpret a tool call name and extract relevant info from args/results
 * to drive TUI state transitions.
 */
function interpretToolCalls(
  event: AgentStepEvent,
  setActiveIssue: React.Dispatch<React.SetStateAction<AgentIssueState | null>>,
  setQueue: React.Dispatch<React.SetStateAction<AgentIssueState[]>>,
  setCompleted: React.Dispatch<React.SetStateAction<AgentIssueState[]>>,
  setLogEntries: React.Dispatch<React.SetStateAction<AgentLogEntry[]>>,
  pollingRef: React.MutableRefObject<PollingState | null>,
  stopLoopPolling: () => void,
  ranLoopRef: React.MutableRefObject<Set<number>>,
  activeIssueRef: React.MutableRefObject<AgentIssueState | null>,
): void {
  // If a new tool call arrives while polling, the runLoop tool has finished — stop polling
  for (const tc of event.toolCalls) {
    if (tc.toolName !== 'runLoop' && pollingRef.current) {
      clearInterval(pollingRef.current.interval);
      pollingRef.current = null;
    }
  }

  for (const tc of event.toolCalls) {
    const args = tc.args as Record<string, unknown> | undefined;

    switch (tc.toolName) {
      case 'listIssues':
        setLogEntries((prev) => appendLog(prev, 'Scanning backlog...'));
        break;

      case 'readIssue': {
        const issueNumber = (args?.issueNumber ?? args?.number) as number | undefined;
        if (issueNumber) {
          setLogEntries((prev) => appendLog(prev, `Reading #${issueNumber}`));
        }
        break;
      }

      case 'assessFeatureState': {
        const issueNumber = args?.issueNumber as number | undefined;
        setLogEntries((prev) =>
          appendLog(prev, `Assessing feature state${issueNumber ? ` for #${issueNumber}` : ''}`),
        );
        break;
      }

      case 'generateSpec': {
        const genFeatureName = args?.featureName as string | undefined;
        const genIssueNumber = args?.issueNumber as number | undefined;
        // generateSpec signals commitment — promote from queue to active
        setQueue((prev) => {
          const issueNum = genIssueNumber ?? activeIssueRef.current?.issueNumber;
          if (issueNum) {
            const queueEntry = prev.find((i) => i.issueNumber === issueNum);
            setActiveIssue((currentActive) => {
              if (currentActive?.issueNumber === issueNum) {
                return { ...currentActive, phase: 'generating_spec' as AgentPhase, loopFeatureName: genFeatureName ?? currentActive.loopFeatureName };
              }
              return {
                issueNumber: issueNum,
                title: queueEntry?.title ?? genFeatureName ?? `Issue #${issueNum}`,
                labels: queueEntry?.labels ?? [],
                phase: 'generating_spec' as AgentPhase,
                loopFeatureName: genFeatureName,
              };
            });
            return prev.filter((i) => i.issueNumber !== issueNum);
          }
          setActiveIssue((prev) =>
            prev ? { ...prev, phase: 'generating_spec' as AgentPhase } : prev,
          );
          return prev;
        });
        setLogEntries((prev) => appendLog(prev, 'Generating spec...'));
        break;
      }

      case 'runLoop': {
        // onStepFinish: runLoop tool has completed (may have run for 10+ min).
        // Phase + polling were already started by onProgress handler.
        // Stop polling now that the tool has returned.
        stopLoopPolling();
        const featureName = args?.featureName as string | undefined;
        const runIssueNumber = args?.issueNumber as number | undefined;
        // runLoop signals commitment — promote from queue to active if not already
        setQueue((prev) => {
          const issueNum = runIssueNumber ?? activeIssueRef.current?.issueNumber;
          if (issueNum) {
            const queueEntry = prev.find((i) => i.issueNumber === issueNum);
            setActiveIssue((currentActive) => {
              if (currentActive?.issueNumber === issueNum) {
                const updated = { ...currentActive, phase: 'running_loop' as AgentPhase };
                if (featureName && !currentActive.loopFeatureName) updated.loopFeatureName = featureName;
                ranLoopRef.current.add(issueNum);
                return updated;
              }
              const entry: AgentIssueState = {
                issueNumber: issueNum,
                title: queueEntry?.title ?? featureName ?? `Issue #${issueNum}`,
                labels: queueEntry?.labels ?? [],
                phase: 'running_loop' as AgentPhase,
                loopFeatureName: featureName,
              };
              ranLoopRef.current.add(issueNum);
              return entry;
            });
            return prev.filter((i) => i.issueNumber !== issueNum);
          }
          setActiveIssue((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, phase: 'running_loop' as AgentPhase };
            if (featureName && !prev.loopFeatureName) updated.loopFeatureName = featureName;
            ranLoopRef.current.add(prev.issueNumber);
            return updated;
          });
          return prev;
        });
        setLogEntries((prev) => appendLog(prev, 'Development loop complete'));
        break;
      }

      case 'checkLoopStatus':
        setLogEntries((prev) => appendLog(prev, 'Checking loop status...'));
        break;

      case 'commentOnIssue':
        setActiveIssue((prev) =>
          prev ? { ...prev, phase: 'reporting' as AgentPhase } : prev,
        );
        setLogEntries((prev) => appendLog(prev, 'Commenting on issue'));
        break;

      case 'createIssue': {
        const title = args?.title as string | undefined;
        const labels = args?.labels as string[] | undefined;
        const labelStr = labels?.length ? ` [${labels.join(', ')}]` : '';
        setLogEntries((prev) =>
          appendLog(prev, `Creating issue: ${title ?? 'untitled'}${labelStr}`, 'warn'),
        );
        break;
      }

      case 'closeIssue': {
        const issueNumber = args?.issueNumber as number | undefined;
        setLogEntries((prev) =>
          appendLog(prev, `Closed #${issueNumber ?? '?'}`, 'success'),
        );
        break;
      }

      case 'reflectOnWork': {
        const outcome = args?.outcome as string | undefined;
        const reflectIssueNum = args?.issueNumber as number | undefined;
        // Remove from ranLoopRef since we're explicitly tracking completion
        if (reflectIssueNum) {
          ranLoopRef.current.delete(reflectIssueNum);
        }
        setActiveIssue((current) => {
          // Build the completed entry from activeIssue if it matches, or from args
          const completedEntry: AgentIssueState = current && current.issueNumber === reflectIssueNum
            ? { ...current, phase: 'reflecting' as AgentPhase, error: outcome === 'failure' ? 'failed' : undefined }
            : {
                issueNumber: reflectIssueNum ?? 0,
                title: `Issue #${reflectIssueNum ?? '?'}`,
                labels: [],
                phase: 'reflecting' as AgentPhase,
                error: outcome === 'failure' ? 'failed' : undefined,
              };
          if (completedEntry.issueNumber) {
            setCompleted((prev) => {
              if (prev.some((c) => c.issueNumber === completedEntry.issueNumber)) return prev;
              return [...prev, completedEntry];
            });
          }
          // Clear activeIssue only if it was the reflected issue
          if (current?.issueNumber === reflectIssueNum) return null;
          return current;
        });
        setLogEntries((prev) =>
          appendLog(prev, `Reflected on #${reflectIssueNum ?? '?'}: ${outcome ?? 'done'}`, outcome === 'failure' ? 'error' : 'success'),
        );
        break;
      }

      default:
        setLogEntries((prev) => appendLog(prev, `[tool] ${tc.toolName}`));
        break;
    }
  }

  // Process tool results for additional state updates
  for (const tr of event.toolResults) {
    const result = tr.result as Record<string, unknown> | undefined;

    switch (tr.toolName) {
      case 'listIssues': {
        const issues = (result?.issues ?? result) as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(issues)) {
          setLogEntries((prev) =>
            appendLog(prev, `Found ${issues.length} issue(s) in backlog`),
          );
        }
        break;
      }

      case 'checkLoopStatus': {
        const iteration = (result?.iteration ?? result?.currentIteration) as number | undefined;
        if (iteration != null) {
          setActiveIssue((prev) =>
            prev ? { ...prev, loopIterations: iteration } : prev,
          );
        }
        break;
      }

      default:
        break;
    }
  }
}

export function applyOrchestratorEvent(
  event: AgentOrchestratorEvent,
  setActiveIssue: React.Dispatch<React.SetStateAction<AgentIssueState | null>>,
  setQueue: React.Dispatch<React.SetStateAction<AgentIssueState[]>>,
  setCompleted: React.Dispatch<React.SetStateAction<AgentIssueState[]>>,
  setLogEntries: React.Dispatch<React.SetStateAction<AgentLogEntry[]>>,
  completedIssuesRef: React.MutableRefObject<Set<number>>,
): void {
  switch (event.type) {
    case 'scope_expanded':
      setLogEntries((prev) => appendLog(prev, `Expanded scope with ${event.expansions.map(expansion => `#${expansion.issueNumber}`).join(', ')}`));
      break;

    case 'backlog_progress':
      setLogEntries((prev) => appendLog(prev, event.message));
      break;

    case 'backlog_timing':
      setLogEntries((prev) => appendLog(prev, `${event.phase} took ${event.durationMs}ms${event.count != null ? ` (${event.count})` : ''}`));
      break;

    case 'backlog_scanned':
      setLogEntries((prev) => appendLog(prev, `Scanned ${event.total} backlog issue(s)`));
      break;

    case 'candidate_enriched':
      setLogEntries((prev) => appendLog(prev, `Enriched #${event.issue.issueNumber}: ${event.issue.title}`));
      break;

    case 'dependencies_inferred':
      if (event.edges.length > 0) {
        setLogEntries((prev) => appendLog(prev, `Inferred ${event.edges.length} dependency edge(s) for #${event.issueNumber}`));
      }
      break;

    case 'queue_ranked':
      {
        const resumedIssueNumbers = new Set(
          event.queue
            .filter(issue => issue.recommendation === 'resume_pr_phase')
            .map(issue => issue.issueNumber),
        );
        if (resumedIssueNumbers.size > 0) {
          for (const issueNumber of resumedIssueNumbers) {
            completedIssuesRef.current.delete(issueNumber);
          }
          setCompleted((prev) => prev.filter((issue) => !resumedIssueNumbers.has(issue.issueNumber)));
        }
        setQueue(event.queue.filter((issue) => !completedIssuesRef.current.has(issue.issueNumber)));
      }
      break;

    case 'task_selected':
      completedIssuesRef.current.delete(event.issue.issueNumber);
      setCompleted((prev) => prev.filter((issue) => issue.issueNumber !== event.issue.issueNumber));
      setActiveIssue({ ...event.issue, phase: 'planning' as AgentPhase });
      setQueue((prev) => prev.filter((issue) => issue.issueNumber !== event.issue.issueNumber));
      setLogEntries((prev) => appendLog(prev, `Selected #${event.issue.issueNumber}: ${event.issue.title}`));
      break;

    case 'task_blocked':
      setLogEntries((prev) => appendLog(prev, `Blocked #${event.issue.issueNumber}: ${event.issue.blockedBy?.[0]?.reason ?? event.issue.actionability ?? 'blocked'}`, 'warn'));
      break;

    case 'task_started':
      setActiveIssue((prev) => ({ ...(prev ?? event.issue), ...event.issue }));
      setLogEntries((prev) => appendLog(prev, `Started #${event.issue.issueNumber}`));
      break;

    case 'task_completed':
      if (event.outcome === 'success' || event.outcome === 'skipped') {
        setCompleted((prev) => {
          const filtered = prev.filter((issue) => issue.issueNumber !== event.issue.issueNumber);
          return [...filtered, {
            ...event.issue,
            error: event.outcome === 'failure' ? 'failed' : event.issue.error,
          }];
        });
        completedIssuesRef.current.add(event.issue.issueNumber);
      } else {
        setCompleted((prev) => prev.filter((issue) => issue.issueNumber !== event.issue.issueNumber));
        completedIssuesRef.current.delete(event.issue.issueNumber);
      }
      setQueue((prev) => prev.filter((issue) => issue.issueNumber !== event.issue.issueNumber));
      setActiveIssue((prev) => prev?.issueNumber === event.issue.issueNumber ? null : prev);
      setLogEntries((prev) => appendLog(
        prev,
        `${event.outcome === 'failure' ? 'Failed' : event.outcome === 'partial' ? 'Paused' : 'Completed'} #${event.issue.issueNumber} (${event.outcome})`,
        event.outcome === 'failure' ? 'error' : event.outcome === 'partial' ? 'warn' : 'success',
      ));
      break;

    default:
      break;
  }
}

export function useAgentOrchestrator(
  options: UseAgentOrchestratorOptions,
): UseAgentOrchestratorResult {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [activeIssue, setActiveIssue] = useState<AgentIssueState | null>(null);
  const [queue, setQueue] = useState<AgentIssueState[]>([]);
  const [completed, setCompleted] = useState<AgentIssueState[]>([]);
  const [logEntries, setLogEntries] = useState<AgentLogEntry[]>([]);
  const [loopMonitor, setLoopMonitor] = useState<LoopMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const pollingRef = useRef<PollingState | null>(null);
  const ranLoopRef = useRef<Set<number>>(new Set());
  const activeIssueRef = useRef<AgentIssueState | null>(null);
  const completedIssuesRef = useRef<Set<number>>(new Set());

  // Keep ref in sync for use inside polling callback
  useEffect(() => { activeIssueRef.current = activeIssue; }, [activeIssue]);

  const stopLoopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current.interval);
      pollingRef.current = null;
    }
    setLoopMonitor(null);
  }, []);

  const startLoopPolling = useCallback((featureName: string) => {
    stopLoopPolling(); // clear any existing polling

    const startTime = Date.now();
    const state: PollingState = {
      featureName,
      interval: null as unknown as ReturnType<typeof setInterval>,
      lastLogCursor: 0,
      lastPhases: undefined,
    };

    // Accumulated activity events across polls
    const activityEventsAcc: ActivityEvent[] = [];
    const MAX_ACTIVITY = 50;

    const poll = async () => {
      // Read current phase
      const currentPhase = readCurrentPhase(featureName);
      if (currentPhase) {
        setActiveIssue((prev) =>
          prev ? { ...prev, loopPhase: currentPhase } : prev,
        );
      }

      // Read loop status for iteration count + token data
      let loopStatus: LoopStatus | null = null;
      try {
        loopStatus = readLoopStatus(featureName);
        if (loopStatus.iteration > 0) {
          setActiveIssue((prev) =>
            prev ? { ...prev, loopIterations: loopStatus!.iteration } : prev,
          );
        }
      } catch {
        // Invalid feature name or file not ready — skip
      }

      // Read task progress
      let tasks: TaskCounts = { tasksDone: 0, tasksPending: 0, e2eDone: 0, e2ePending: 0, planExists: false };
      try {
        tasks = await parseImplementationPlan(options.projectRoot, featureName, '.ralph/specs');
      } catch {
        // Plan not yet available
      }

      // Git info
      const branch = getGitBranch(options.projectRoot);
      const recentCommits = getRecentCommits(options.projectRoot, 3);

      // Parse loop log for new events
      const logPath = getLoopLogPath(featureName);
      const logDelta = parseLoopLogDelta(logPath, state.lastLogCursor);
      const logEvents = logDelta.events;
      state.lastLogCursor = logDelta.nextCursor;
      if (logEvents.length > 0) {
        activityEventsAcc.push(...logEvents);
        if (activityEventsAcc.length > MAX_ACTIVITY) {
          activityEventsAcc.splice(0, activityEventsAcc.length - MAX_ACTIVITY);
        }
        setLogEntries((prev) => {
          let next = prev;
          for (const evt of logEvents) {
            next = appendLog(next, evt.message, evt.status === 'error' ? 'error' : evt.status === 'success' ? 'success' : 'info');
          }
          return next;
        });
      }

      // Parse phase changes for delta events
      const phaseResult = parsePhaseChanges(featureName, state.lastPhases);
      if (phaseResult.currentPhases) {
        state.lastPhases = phaseResult.currentPhases;
      }
      if (phaseResult.events.length > 0) {
        activityEventsAcc.push(...phaseResult.events);
        if (activityEventsAcc.length > MAX_ACTIVITY) {
          activityEventsAcc.splice(0, activityEventsAcc.length - MAX_ACTIVITY);
        }
        setLogEntries((prev) => {
          let next = prev;
          for (const evt of phaseResult.events) {
            next = appendLog(next, evt.message, evt.status === 'error' ? 'error' : evt.status === 'success' ? 'success' : 'info');
          }
          return next;
        });
      }

      // Update loop monitor data
      if (loopStatus) {
        setLoopMonitor({
          loopStatus,
          tasks,
          branch,
          recentCommits,
          activityEvents: [...activityEventsAcc],
          startTime,
        });
      }
    };

    state.interval = setInterval(poll, 3000);
    pollingRef.current = state;

    // Run first poll immediately
    poll();
  }, [stopLoopPolling, options.projectRoot]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    stopLoopPolling();
  }, [stopLoopPolling]);

  useEffect(() => {
    // Prevent double-start in React strict mode
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    initTracing();

    async function run() {
      try {
        setStatus('running');
        setLogEntries((prev) => appendLog(prev, 'Resolving agent environment...'));

        const env = await resolveAgentEnv(options.projectRoot, {
          model: options.modelOverride,
        });

        setLogEntries((prev) =>
          appendLog(prev, `Using ${env.provider}/${env.modelId ?? 'default'} on ${env.owner}/${env.repo}`),
        );

        const agentConfig: AgentConfig = {
          model: env.model,
          modelId: env.modelId,
          provider: env.provider,
          projectRoot: env.projectRoot,
          owner: env.owner,
          repo: env.repo,
          maxSteps: options.maxSteps,
          maxItems: options.maxItems,
          labels: options.labels,
          issues: options.issues,
          reviewMode: options.reviewMode,
          dryRun: options.dryRun,
          onStepUpdate: (event: AgentStepEvent) => {
            interpretToolCalls(
              event,
              setActiveIssue,
              setQueue,
              setCompleted,
              setLogEntries,
              pollingRef,
              stopLoopPolling,
              ranLoopRef,
              activeIssueRef,
            );
          },
          onOrchestratorEvent: (event: AgentOrchestratorEvent) => {
            applyOrchestratorEvent(
              event,
              setActiveIssue,
              setQueue,
              setCompleted,
              setLogEntries,
              completedIssuesRef,
            );
          },
          onProgress: (toolName: string, line: string) => {
            // Detect generateSpec execution start (onStepFinish fires too late)
            if (toolName === 'generateSpec') {
              setActiveIssue((prev) => {
                if (!prev || prev.phase === 'generating_spec') return prev;
                return { ...prev, phase: 'generating_spec' as AgentPhase };
              });
            }

            // Detect runLoop execution start and initiate temp file polling
            if (toolName === 'runLoop') {
              if (!pollingRef.current) {
                setActiveIssue((prev) =>
                  prev ? { ...prev, phase: 'running_loop' as AgentPhase } : prev,
                );
                setLogEntries((prev) => appendLog(prev, 'Running development loop...'));

                // Get feature name from activeIssue (stored during assessFeatureState)
                const featureName = activeIssueRef.current?.loopFeatureName;
                if (featureName) {
                  startLoopPolling(featureName);
                } else {
                  // Fallback: parse from "Ralph Loop: <feature>" stderr line
                  const match = line.match(/^Ralph Loop:\s*(.+)$/);
                  if (match) {
                    const parsed = match[1].trim();
                    setActiveIssue((prev) =>
                      prev ? { ...prev, loopFeatureName: parsed } : prev,
                    );
                    startLoopPolling(parsed);
                  }
                }
              }
              // All runLoop stderr handled by temp file polling — suppress raw lines
              return;
            }

            // Filter noise for other tools
            if (shouldSkipLine(line)) return;
            setLogEntries((prev) => appendLog(prev, line));
          },
        };

        const agent = createAgentOrchestrator(agentConfig);

        const result = await agent.stream({
          prompt: 'Begin working through the backlog.',
          abortSignal: controller.signal,
        });

        // Consume text stream (discarded — TUI shows tool activity)
        for await (const _chunk of result.textStream) {
          // no-op: tool calls drive the UI, not text output
        }

        if (!controller.signal.aborted) {
          // Promote any issue that ran a loop but wasn't explicitly completed
          setActiveIssue((current) => {
            if (current && ranLoopRef.current.has(current.issueNumber)) {
              setCompleted((prev) => {
                if (prev.some((c) => c.issueNumber === current.issueNumber)) return prev;
                return [...prev, { ...current, phase: 'reflecting' as AgentPhase }];
              });
              return null;
            }
            return current;
          });
          setStatus('complete');
          setLogEntries((prev) => appendLog(prev, 'Agent run complete', 'success'));
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Still promote tracked issues on abort
          setActiveIssue((current) => {
            if (current && ranLoopRef.current.has(current.issueNumber)) {
              setCompleted((prev) => {
                if (prev.some((c) => c.issueNumber === current.issueNumber)) return prev;
                return [...prev, { ...current, phase: 'reflecting' as AgentPhase }];
              });
              return null;
            }
            return current;
          });
          setStatus('complete');
          setLogEntries((prev) => appendLog(prev, 'Agent aborted by user', 'warn'));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setStatus('error');
        setError(message);
        setLogEntries((prev) => appendLog(prev, `Agent failed: ${message}`, 'error'));
      } finally {
        stopLoopPolling();
        await flushTracing();
      }
    }

    run();

    return () => {
      controller.abort();
      stopLoopPolling();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- options are stable from parent

  return { status, activeIssue, queue, completed, logEntries, loopMonitor, error, abort };
}
