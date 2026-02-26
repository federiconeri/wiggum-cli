/**
 * AgentScreen - TUI dashboard for the autonomous agent mode
 *
 * Displays issue processing status and an agent log.
 * Two-column layout on wide terminals (>=65 cols), single-column on narrow.
 * This is the visual shell; actual orchestrator integration comes later.
 *
 * Wrapped in AppShell for consistent layout with header and footer.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, Static, useInput, useStdout } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { colors, phase } from '../theme.js';
import type { AgentLogEntry, AgentIssueState, AgentPhase } from '../../agent/types.js';

const NARROW_BREAKPOINT = 65;
const SECTION_CHAR = '\u2500'; // ─

export interface AgentScreenProps {
  header: React.ReactNode;
  onExit?: () => void;
}

type AgentStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error';

function phaseLabel(p: AgentPhase): string {
  switch (p) {
    case 'idle': return 'Idle';
    case 'planning': return 'Planning...';
    case 'generating_spec': return 'Generating spec...';
    case 'running_loop': return 'Running loop...';
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
 * Build a working status string from active issue state
 */
function workingLabel(activeIssue: AgentIssueState | null): string {
  if (!activeIssue) return 'Starting...';
  const iter = activeIssue.loopIterations != null ? ` (iter ${activeIssue.loopIterations})` : '';
  return `${phaseLabel(activeIssue.phase)} #${activeIssue.issueNumber}${iter}`;
}

/**
 * Build the footer phase string from current state
 */
function footerPhase(status: AgentStatus, activeIssue: AgentIssueState | null): string {
  if (status === 'idle') return 'Waiting';
  if (status === 'complete') return 'Done';
  if (status === 'error') return 'Error';
  if (status === 'paused') return 'Paused';
  if (!activeIssue) return 'Starting...';
  return `#${activeIssue.issueNumber} ${activeIssue.title}`;
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
            {phase.active} {phaseLabel(activeIssue.phase)}
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
          <Box key={issue.issueNumber} marginLeft={1}>
            <Text>
              <Text dimColor>#{issue.issueNumber}</Text>
              <Text> {issue.title}</Text>
            </Text>
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
              <Text dimColor>  └ PR: {issue.prUrl}</Text>
            )}
          </Box>
        ))
      )}
    </Box>
  );
}

/**
 * Log panel content — shared between wide and narrow layouts
 */
function LogPanel({ logEntries }: { logEntries: AgentLogEntry[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color={colors.yellow}>Agent Log</Text>
      {logEntries.length === 0 ? (
        <Text dimColor>Waiting for agent activity...</Text>
      ) : (
        <Static items={logEntries}>
          {(entry, index) => (
            <Box key={`${entry.timestamp}-${index}`}>
              <Text>
                <Text dimColor>{entry.timestamp.slice(11, 19)}</Text>
                <Text> </Text>
                <Text color={logLevelColor(entry.level)}>{entry.message}</Text>
              </Text>
            </Box>
          )}
        </Static>
      )}
    </Box>
  );
}

export function AgentScreen({
  header,
  onExit,
}: AgentScreenProps): React.ReactElement {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isNarrow = columns < NARROW_BREAKPOINT;

  // Internal state (shell only — orchestrator integration comes later)
  const [status] = useState<AgentStatus>('idle');
  const [activeIssue] = useState<AgentIssueState | null>(null);
  const [queue] = useState<AgentIssueState[]>([]);
  const [completed] = useState<AgentIssueState[]>([]);
  const [logEntries] = useState<AgentLogEntry[]>([]);

  const isWorking = status === 'running';

  useInput(useCallback((input: string, key: { escape?: boolean }) => {
    if (input === 'q' || key.escape) {
      onExit?.();
    }
  }, [onExit]));

  // #2+#3: Actionable tips in the TipsBar zone (not manual Box in content)
  const tips = 'q exit \u2502 Esc back';

  if (isNarrow) {
    // #4: Single-column stacked layout for narrow terminals
    const panelWidth = Math.max(20, columns - 4); // border + padding
    return (
      <AppShell
        header={header}
        tips={tips}
        isWorking={isWorking}
        workingStatus={workingLabel(activeIssue)}
        footerStatus={{
          action: 'Agent',
          phase: footerPhase(status, activeIssue),
        }}
      >
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1}>
            <IssuesPanel activeIssue={activeIssue} queue={queue} completed={completed} panelWidth={panelWidth} />
          </Box>
          <Box flexDirection="column" borderStyle="round" borderColor={colors.brown} paddingX={1}>
            <LogPanel logEntries={logEntries} />
          </Box>
        </Box>
      </AppShell>
    );
  }

  // Wide layout: two-column
  const leftWidth = Math.max(30, Math.floor(columns * 0.4));
  const rightWidth = Math.max(30, columns - leftWidth - 3);
  const leftInnerWidth = leftWidth - 4; // border (2) + paddingX (2)

  return (
    <AppShell
      header={header}
      tips={tips}
      isWorking={isWorking}
      workingStatus={workingLabel(activeIssue)}
      footerStatus={{
        action: 'Agent',
        phase: footerPhase(status, activeIssue),
      }}
    >
      <Box flexDirection="row" gap={1}>
        {/* Left panel: Issues */}
        <Box flexDirection="column" width={leftWidth} borderStyle="round" borderColor={colors.brown} paddingX={1}>
          <IssuesPanel activeIssue={activeIssue} queue={queue} completed={completed} panelWidth={leftInnerWidth} />
        </Box>

        {/* Right panel: Agent Log */}
        <Box flexDirection="column" width={rightWidth} borderStyle="round" borderColor={colors.brown} paddingX={1}>
          <LogPanel logEntries={logEntries} />
        </Box>
      </Box>
    </AppShell>
  );
}
