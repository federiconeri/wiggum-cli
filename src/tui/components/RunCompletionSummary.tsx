/**
 * RunCompletionSummary - Displays run loop completion recap
 *
 * Extracted from App.tsx handleRunComplete. Shows the feature,
 * iterations, tasks, tokens, exit status, log tail, and "what's next".
 */

import React from 'react';
import { Box, Text } from 'ink';
import { StatusLine } from './StatusLine.js';
import { colors, theme } from '../theme.js';
import { formatNumber } from '../utils/loop-status.js';
import type { RunSummary } from '../screens/RunScreen.js';

/**
 * Props for RunCompletionSummary component
 */
export interface RunCompletionSummaryProps {
  /** Run summary data */
  summary: RunSummary;
}

/**
 * RunCompletionSummary component
 *
 * Renders the run loop completion recap inline within the
 * RunScreen content area.
 */
export function RunCompletionSummary({
  summary,
}: RunCompletionSummaryProps): React.ReactElement {
  const totalTokens = summary.tokensInput + summary.tokensOutput;
  const stoppedCodes = new Set([130, 143]);
  const exitState = summary.exitCode === 0
    ? { label: 'Complete', color: colors.green, message: 'Done. Feature loop completed successfully.' }
    : stoppedCodes.has(summary.exitCode)
      ? { label: 'Stopped', color: colors.orange, message: 'Stopped. Feature loop interrupted.' }
      : { label: 'Failed', color: colors.pink, message: `Done. Feature loop exited with code ${summary.exitCode}.` };

  return (
    <Box flexDirection="column" marginY={1}>
      <StatusLine
        action="Run Loop"
        phase={exitState.label}
        path={summary.feature}
      />

      <Box marginTop={1} flexDirection="column">
        <Text bold>Summary</Text>
        <Text>- Feature: {summary.feature}</Text>
        <Text>- Iterations: {summary.iterations}/{summary.maxIterations}</Text>
        <Text>- Tasks: {summary.tasksDone}/{summary.tasksTotal}</Text>
        <Text>- Tokens: {formatNumber(totalTokens)} (in:{formatNumber(summary.tokensInput)} out:{formatNumber(summary.tokensOutput)})</Text>
        {summary.branch && summary.branch !== '-' && (
          <Text>- Branch: {summary.branch}</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Text color={exitState.color}>{theme.chars.bullet} </Text>
        <Text>{exitState.message}</Text>
      </Box>

      {(summary.errorTail || summary.logPath) && (
        <Box marginTop={1} flexDirection="column">
          {summary.logPath && (
            <Text dimColor>Log: {summary.logPath}</Text>
          )}
          {summary.errorTail && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Last output:</Text>
              {summary.errorTail.split('\n').map((line, idx) => (
                <Text key={`${line}-${idx}`} dimColor>
                  {line}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold>What's next:</Text>
        <Box flexDirection="row" gap={1}>
          <Text color={colors.green}>{theme.chars.prompt}</Text>
          <Text dimColor>Review changes and open a PR if needed</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color={colors.green}>{theme.chars.prompt}</Text>
          <Text color={colors.blue}>/new {'<feature>'}</Text>
          <Text dimColor>Create another feature specification</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color={colors.green}>{theme.chars.prompt}</Text>
          <Text color={colors.blue}>/help</Text>
          <Text dimColor>See all commands</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter or Esc to return to shell</Text>
      </Box>
    </Box>
  );
}
