/**
 * AgentScreen - TUI dashboard for the autonomous agent mode
 *
 * Displays issue processing status, a loop monitor, and an agent log.
 * Two-column layout on wide terminals (>=65 cols), single-column on narrow.
 *
 * When a loop is running, the right panel splits: loop monitor (top) + log (bottom).
 * When no loop is running, the right panel shows only the agent log.
 *
 * Wired to the orchestrator via useAgentOrchestrator hook, which
 * interprets tool calls into structured React state. Console is patched
 * on mount to prevent Ink rendering corruption.
 *
 * Wrapped in AppShell for consistent layout with header and footer.
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { colors, phase, theme } from '../theme.js';
import { useAgentOrchestrator, type AgentStatus, type LoopMonitorData } from '../hooks/useAgentOrchestrator.js';
import { formatNumber } from '../utils/loop-status.js';
import type { AgentAppProps } from '../app.js';
import type { AgentLogEntry, AgentIssueState, AgentPhase, ReviewMode } from '../../agent/types.js';

const NARROW_BREAKPOINT = 65;
const SECTION_CHAR = '\u2500'; // ─

export interface AgentScreenProps {
  header: React.ReactNode;
  projectRoot: string;
  agentOptions?: AgentAppProps;
  onExit?: () => void;
}

function phaseLabel(p: AgentPhase, activeIssue?: AgentIssueState | null): string {
  switch (p) {
    case 'idle': return 'Idle';
    case 'planning': return 'Planning...';
    case 'generating_spec': return 'Generating spec...';
    case 'running_loop': return activeIssue?.loopPhase ?? 'Running loop...';
    case 'reporting': return 'Reporting...';
    case 'reflecting': return 'Reflecting...';
    default: return String(p);
  }
}

function logLevelColor(level: AgentLogEntry['level']): string {
  switch (level) {
    case 'info': return colors.blue;
    case 'warn': return colors.orange;
    case 'error': return colors.pink;
    case 'success': return colors.green;
    default: return colors.gray;
  }
}

/**
 * Build a working status string from active issue state.
 * Issue number/title is already shown in Active Issue panel — just show phase.
 */
function workingLabel(activeIssue: AgentIssueState | null): string {
  if (!activeIssue) return 'Starting...';
  return phaseLabel(activeIssue.phase, activeIssue);
}

/**
 * Build the footer phase string from current state.
 * Shows loop sub-phase and iteration instead of duplicating issue title.
 */
function footerPhase(status: AgentStatus, activeIssue: AgentIssueState | null, completedCount: number, cancelling: boolean): string {
  if (cancelling) return 'Cancelling...';
  if (status === 'idle') return 'Waiting';
  if (status === 'complete') return `Done \u2014 ${completedCount} issue${completedCount === 1 ? '' : 's'} processed`;
  if (status === 'error') return 'Error';
  if (!activeIssue) return 'Starting...';
  const loopDetail = activeIssue.loopPhase ? ` \u00b7 ${activeIssue.loopPhase}` : '';
  const iter = activeIssue.loopIterations != null ? ` (iter ${activeIssue.loopIterations})` : '';
  return `#${activeIssue.issueNumber}${loopDetail}${iter}`;
}

/**
 * Horizontal section separator line
 */
function SectionSeparator({ width }: { width: number }): React.ReactElement {
  const lineWidth = Math.max(1, width - 2); // account for panel padding
  return <Text color={colors.separator}>{SECTION_CHAR.repeat(lineWidth)}</Text>;
}

/**
 * Issues panel content — shared between wide and narrow layouts
 */
function IssuesPanel({
  activeIssue,
  queue,
  completed,
  panelWidth,
}: {
  activeIssue: AgentIssueState | null;
  queue: AgentIssueState[];
  completed: AgentIssueState[];
  panelWidth: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {/* Active Issue */}
      <Text bold color={colors.yellow}>Active Issue</Text>
      {activeIssue ? (
        <Box flexDirection="column" marginLeft={1}>
          <Text>
            <Text color={colors.blue}>#{activeIssue.issueNumber}</Text>
            <Text> {activeIssue.title}</Text>
          </Text>
          <Text dimColor>
            {phase.active} {phaseLabel(activeIssue.phase, activeIssue)}
            {activeIssue.loopIterations != null ? ` (iter ${activeIssue.loopIterations})` : ''}
          </Text>
        </Box>
      ) : (
        <Box marginLeft={1}><Text dimColor>No active issue</Text></Box>
      )}

      <SectionSeparator width={panelWidth} />

      {/* Queue */}
      <Text bold color={colors.yellow}>
        Queue
        <Text dimColor> ({queue.length})</Text>
      </Text>
      {queue.length === 0 ? (
        <Box marginLeft={1}><Text dimColor>Empty</Text></Box>
      ) : (
        queue.slice(0, 5).map((issue) => (
          <Box key={issue.issueNumber} marginLeft={1} flexDirection="column">
            <Text>
              <Text dimColor>#{issue.issueNumber}</Text>
              <Text> {issue.title}</Text>
            </Text>
            {(issue.actionability || issue.recommendation || issue.dependsOn?.length || issue.inferredDependsOn?.length) && (
              <Text dimColor>
                {issue.actionability ?? 'ready'}
                {issue.recommendation ? ` · ${issue.recommendation}` : ''}
                {issue.dependsOn?.length ? ` · explicit: ${issue.dependsOn.map(n => `#${n}`).join(', ')}` : ''}
                {issue.inferredDependsOn?.length ? ` · inferred: ${issue.inferredDependsOn.map(dep => `#${dep.issueNumber} (${dep.confidence})`).join(', ')}` : ''}
              </Text>
            )}
            {issue.blockedBy?.length ? (
              <Text color={colors.orange}>  blocked: {issue.blockedBy[0].reason}</Text>
            ) : null}
          </Box>
        ))
      )}
      {queue.length > 5 && (
        <Box marginLeft={1}><Text dimColor>...and {queue.length - 5} more</Text></Box>
      )}

      <SectionSeparator width={panelWidth} />

      {/* Completed */}
      <Text bold color={colors.yellow}>
        Completed
        <Text dimColor> ({completed.length})</Text>
      </Text>
      {completed.length === 0 ? (
        <Box marginLeft={1}><Text dimColor>None yet</Text></Box>
      ) : (
        completed.slice(-5).map((issue) => (
          <Box key={issue.issueNumber} marginLeft={1}>
            <Text>
              <Text color={issue.error ? colors.pink : colors.green}>
                {issue.error ? phase.error : phase.complete}
              </Text>
              <Text dimColor> #{issue.issueNumber}</Text>
              <Text> {issue.title}</Text>
            </Text>
            {issue.prUrl && (
              <Text dimColor>  \u2514 PR: {issue.prUrl}</Text>
            )}
          </Box>
        ))
      )}
    </Box>
  );
}

/**
 * Log panel content — shared between wide and narrow layouts.
 * tailSize controls how many entries to show (shrinks when monitor is visible).
 */
function LogPanel({ logEntries, tailSize = 20 }: { logEntries: AgentLogEntry[]; tailSize?: number }): React.ReactElement {
  const visible = logEntries.slice(-tailSize);
  return (
    <Box flexDirection="column">
      <Text bold color={colors.yellow}>Agent Log</Text>
      {visible.length === 0 ? (
        <Text dimColor>Waiting for agent activity...</Text>
      ) : (
        visible.map((entry, index) => (
          <Box key={`${entry.timestamp}-${index}`}>
            <Text>
              <Text dimColor>{entry.timestamp.slice(11, 19)}</Text>
              <Text> </Text>
              <Text color={logLevelColor(entry.level)}>{entry.message}</Text>
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}

/**
 * ProgressBar — inline progress indicator
 */
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

const PROGRESS_LABEL_WIDTH = 17;
const padLabel = (label: string) => label.padEnd(PROGRESS_LABEL_WIDTH);

/**
 * Loop Monitor panel — shows progress, commits, and activity for the active loop
 */
function LoopMonitorPanel({
  monitor,
  featureName,
  panelWidth,
}: {
  monitor: LoopMonitorData;
  featureName: string;
  panelWidth: number;
}): React.ReactElement {
  const { loopStatus, tasks, branch, recentCommits, activityEvents, startTime } = monitor;
  const totalTokens = loopStatus.tokensInput + loopStatus.tokensOutput + loopStatus.cacheCreate + loopStatus.cacheRead;
  const totalTasks = tasks.tasksDone + tasks.tasksPending;
  const totalE2e = tasks.e2eDone + tasks.e2ePending;
  const totalAll = totalTasks + totalE2e;
  const doneAll = tasks.tasksDone + tasks.e2eDone;
  const percentTasks = totalTasks > 0 ? Math.round((tasks.tasksDone / totalTasks) * 100) : 0;
  const percentE2e = totalE2e > 0 ? Math.round((tasks.e2eDone / totalE2e) * 100) : 0;
  const percentAll = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

  return (
    <Box flexDirection="column">
      <Text bold color={colors.yellow}>Loop Monitor <Text dimColor>\u2014 {featureName}</Text></Text>

      <Box flexDirection="row">
        <Text>Phase: </Text>
        <Text color={colors.yellow}>{loopStatus.phase}</Text>
        <Text dimColor>{theme.statusLine.separator}</Text>
        <Text>Iter: </Text>
        <Text color={colors.green}>{loopStatus.iteration}</Text>
        <Text dimColor>/{loopStatus.maxIterations || '-'}</Text>
        <Text dimColor>{theme.statusLine.separator}</Text>
        <Text>Branch: </Text>
        <Text color={colors.blue}>{branch}</Text>
      </Box>

      {totalTokens > 0 && (
        <Box flexDirection="row">
          <Text>Tokens: </Text>
          <Text color={colors.pink}>{formatNumber(totalTokens)}</Text>
          <Text dimColor> (in:{formatNumber(loopStatus.tokensInput)} out:{formatNumber(loopStatus.tokensOutput)} cache:{formatNumber(loopStatus.cacheRead)})</Text>
          <Text dimColor>{theme.statusLine.separator}</Text>
          <Text dimColor>Elapsed: {formatDuration(startTime)}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold>{padLabel('Implementation:')}</Text>
          <ProgressBar percent={percentTasks} />
          <Text>{String(percentTasks).padStart(3)}%</Text>
          <Text color={colors.green}>{'\u2713'} {tasks.tasksDone}</Text>
          <Text color={colors.yellow}>{'\u25cb'} {tasks.tasksPending}</Text>
        </Box>

        {totalE2e > 0 && (
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text bold>{padLabel('E2E Tests:')}</Text>
            <ProgressBar percent={percentE2e} />
            <Text>{String(percentE2e).padStart(3)}%</Text>
            <Text color={colors.green}>{'\u2713'} {tasks.e2eDone}</Text>
            <Text color={colors.yellow}>{'\u25cb'} {tasks.e2ePending}</Text>
          </Box>
        )}

        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold>{padLabel('Overall:')}</Text>
          <ProgressBar percent={percentAll} />
          <Text>{String(percentAll).padStart(3)}%</Text>
          <Text color={colors.green}>{'\u2713'} {doneAll}</Text>
          <Text color={colors.yellow}>{'\u25cb'} {totalAll - doneAll}</Text>
        </Box>
      </Box>

      {recentCommits.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Recent Commits</Text>
          {recentCommits.map((c) => (
            <Box key={c.hash} flexDirection="row">
              <Text dimColor>  {c.hash} {c.title}</Text>
            </Box>
          ))}
        </Box>
      )}

      {activityEvents.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Activity</Text>
          <ActivityFeed events={activityEvents} maxEvents={6} />
        </Box>
      )}
    </Box>
  );
}

const REVIEW_MODES: ReviewMode[] = ['manual', 'auto', 'merge'];

export function AgentScreen({
  header,
  projectRoot,
  agentOptions,
  onExit,
}: AgentScreenProps): React.ReactElement {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isNarrow = columns < NARROW_BREAKPOINT;

  // Patch console on mount to prevent Ink rendering corruption
  // from any console.* calls in the orchestrator or AI SDK.
  useEffect(() => {
    let restore: (() => void) | undefined;
    import('patch-console').then((mod) => {
      const patchConsole = mod.default;
      restore = patchConsole(() => {
        // Swallow console output — Ink renders its own UI
      });
    }).catch(() => {
      // patch-console not available — continue without it
    });
    return () => {
      restore?.();
    };
  }, []);

  const { status, activeIssue, queue, completed, logEntries, loopMonitor, error, abort } =
    useAgentOrchestrator({
      projectRoot,
      modelOverride: agentOptions?.modelOverride,
      maxItems: agentOptions?.maxItems,
      maxSteps: agentOptions?.maxSteps,
      labels: agentOptions?.labels,
      issues: agentOptions?.issues,
      reviewMode: agentOptions?.reviewMode,
      dryRun: agentOptions?.dryRun,
    });

  // Track whether the user requested cancellation
  const [cancelling, setCancelling] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>(agentOptions?.reviewMode ?? 'manual');
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // When cancelling and the orchestrator finishes, exit
  useEffect(() => {
    if (cancelling && (status === 'complete' || status === 'error')) {
      onExitRef.current?.();
    }
  }, [cancelling, status]);

  const isWorking = status === 'running' || cancelling;
  const hasLoopMonitor = loopMonitor !== null && activeIssue?.phase === 'running_loop';

  useInput(useCallback((input: string, key: { escape?: boolean }) => {
    if (input === 'q' || key.escape) {
      if (status === 'running') {
        // Signal abort — stay mounted so cleanup can propagate to subprocesses
        setCancelling(true);
        abort();
      } else {
        // Already done — exit immediately
        onExitRef.current?.();
      }
      return;
    }
    // Shift+R cycles review mode (manual → auto → merge)
    if (input === 'R') {
      setReviewMode((prev) => {
        const idx = REVIEW_MODES.indexOf(prev);
        return REVIEW_MODES[(idx + 1) % REVIEW_MODES.length];
      });
    }
  }, [abort, status]));

  const tips = cancelling
    ? 'Cancelling...'
    : 'q exit \u2502 Esc back \u2502 Shift+R review mode';

  const footerStatus = {
    action: 'Agent',
    phase: footerPhase(status, activeIssue, completed.length, cancelling),
    extra: `review: ${reviewMode}`,
  };

  if (isNarrow) {
    const panelWidth = Math.max(20, columns - 4);
    return (
      <AppShell
        header={header}
        tips={tips}
        isWorking={isWorking}
        workingStatus={workingLabel(activeIssue)}
        footerStatus={footerStatus}
      >
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1}>
            <IssuesPanel activeIssue={activeIssue} queue={queue} completed={completed} panelWidth={panelWidth} />
          </Box>
          {hasLoopMonitor && (
            <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1}>
              <LoopMonitorPanel monitor={loopMonitor} featureName={activeIssue!.loopFeatureName ?? `issue-${activeIssue!.issueNumber}`} panelWidth={panelWidth} />
            </Box>
          )}
          <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1}>
            <LogPanel logEntries={logEntries} tailSize={hasLoopMonitor ? 8 : 20} />
          </Box>
        </Box>
      </AppShell>
    );
  }

  // Wide layout: two-column
  const leftWidth = Math.max(30, Math.floor(columns * 0.4));
  const rightWidth = Math.max(30, columns - leftWidth - 3);
  const leftInnerWidth = leftWidth - 4; // border (2) + paddingX (2)
  const rightInnerWidth = rightWidth - 4;

  return (
    <AppShell
      header={header}
      tips={tips}
      isWorking={isWorking}
      workingStatus={workingLabel(activeIssue)}
      footerStatus={footerStatus}
    >
      <Box flexDirection="row" gap={1}>
        {/* Left panel: Issues */}
        <Box flexDirection="column" width={leftWidth} borderStyle="round" borderColor={colors.brown} paddingX={1}>
          <IssuesPanel activeIssue={activeIssue} queue={queue} completed={completed} panelWidth={leftInnerWidth} />
        </Box>

        {/* Right panel: Loop Monitor (when running) + Agent Log */}
        <Box flexDirection="column" width={rightWidth}>
          {hasLoopMonitor && (
            <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1} marginBottom={1}>
              <LoopMonitorPanel monitor={loopMonitor} featureName={activeIssue!.loopFeatureName ?? `issue-${activeIssue!.issueNumber}`} panelWidth={rightInnerWidth} />
            </Box>
          )}
          <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1}>
            <LogPanel logEntries={logEntries} tailSize={hasLoopMonitor ? 8 : 20} />
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}
