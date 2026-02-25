/**
 * AgentScreen - TUI dashboard for the autonomous agent mode
 *
 * Displays a two-column layout showing issue processing status on the left
 * (active issue, queue, completed) and an agent log on the right.
 * This is the visual shell; actual orchestrator integration comes later.
 *
 * Wrapped in AppShell for consistent layout with header and footer.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, Static, useInput, useStdout } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { colors, theme, phase } from '../theme.js';
import type { AgentLogEntry, AgentIssueState, AgentPhase } from '../../agent/types.js';

/**
 * Props for the AgentScreen component
 */
export interface AgentScreenProps {
  /** Pre-built header element from App */
  header: React.ReactNode;
  /** Called when the user exits the agent screen */
  onExit?: () => void;
}

/**
 * Agent operational status
 */
type AgentStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error';

/**
 * Map phase to a display label
 */
function phaseLabel(p: AgentPhase): string {
  switch (p) {
    case 'idle': return 'Idle';
    case 'planning': return 'Planning';
    case 'generating_spec': return 'Generating Spec';
    case 'running_loop': return 'Running Loop';
    case 'reporting': return 'Reporting';
    case 'reflecting': return 'Reflecting';
    default: return String(p);
  }
}

/**
 * Map log level to a color
 */
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
 * AgentScreen component
 *
 * Two-column dashboard layout:
 * - Left panel: Active issue, queued issues, completed issues
 * - Right panel: Agent log (uses Static for write-once performance)
 *
 * Keyboard: q or Esc to exit
 */
export function AgentScreen({
  header,
  onExit,
}: AgentScreenProps): React.ReactElement {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  // Internal state (shell only - orchestrator integration comes later)
  const [status] = useState<AgentStatus>('idle');
  const [activeIssue] = useState<AgentIssueState | null>(null);
  const [queue] = useState<AgentIssueState[]>([]);
  const [completed] = useState<AgentIssueState[]>([]);
  const [logEntries] = useState<AgentLogEntry[]>([]);

  // Keyboard handling
  useInput(useCallback((input: string, key: { escape?: boolean }) => {
    if (input === 'q' || key.escape) {
      onExit?.();
    }
  }, [onExit]));

  // Layout sizing
  const leftWidth = Math.max(30, Math.floor(columns * 0.4));
  const rightWidth = Math.max(30, columns - leftWidth - 3); // 3 for gap

  return (
    <AppShell
      header={header}
      tips="Agent mode: autonomous issue processing"
      footerStatus={{
        action: 'Agent',
        phase: status === 'idle' ? 'Waiting' : status === 'running' ? 'Processing' : status,
      }}
    >
      {/* Two-column main area */}
      <Box flexDirection="row" gap={1}>

        {/* Left panel: Issues */}
        <Box flexDirection="column" width={leftWidth} borderStyle="round" borderColor={colors.brown} paddingX={1}>

          {/* Active Issue */}
          <Box flexDirection="column" marginBottom={1}>
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
          </Box>

          {/* Queue */}
          <Box flexDirection="column" marginBottom={1}>
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
          </Box>

          {/* Completed */}
          <Box flexDirection="column">
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
                    <Text dimColor> {theme.chars.lineEnd} PR: {issue.prUrl}</Text>
                  )}
                </Box>
              ))
            )}
          </Box>
        </Box>

        {/* Right panel: Agent Log */}
        <Box flexDirection="column" width={rightWidth} borderStyle="round" borderColor={colors.brown} paddingX={1}>
          <Text bold color={colors.yellow}>Agent Log</Text>
          {logEntries.length === 0 ? (
            <Text dimColor>Waiting for agent activity...</Text>
          ) : (
            <Static items={logEntries}>
              {(entry, index) => (
                <Box key={index}>
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
      </Box>

      {/* Hotkey hints */}
      <Box marginTop={1}>
        <Text dimColor>
          <Text bold color={colors.gray}>q</Text>
          <Text dimColor>/</Text>
          <Text bold color={colors.gray}>Esc</Text>
          <Text dimColor> exit</Text>
        </Text>
      </Box>
    </AppShell>
  );
}
