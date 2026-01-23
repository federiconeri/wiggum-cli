/**
 * WorkingIndicator - Spinner + status display during AI calls
 *
 * Displays an animated spinner with status text when the AI is processing.
 * Similar to Claude Code's "Thinking..." indicator.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors } from '../theme.js';

/**
 * Working state object describing the current processing state
 */
export interface WorkingState {
  /** Whether to show the indicator */
  isWorking: boolean;
  /** Status text (e.g., "Thinking...", "Reading files...", "Searching...") */
  status: string;
  /** Optional hint text (e.g., "esc to interrupt") */
  hint?: string;
}

/**
 * Props for the WorkingIndicator component
 */
export interface WorkingIndicatorProps {
  /** Working state object */
  state: WorkingState;
}

/**
 * WorkingIndicator component
 *
 * Displays a spinner with status text when AI is processing.
 * Returns null when not working.
 *
 * @example
 * ```tsx
 * <WorkingIndicator
 *   state={{
 *     isWorking: true,
 *     status: "Thinking...",
 *     hint: "esc to interrupt"
 *   }}
 * />
 * // Renders: ⠋ Thinking... (esc to interrupt)
 * ```
 */
export function WorkingIndicator({ state }: WorkingIndicatorProps): React.ReactElement | null {
  const { isWorking, status, hint } = state;

  // Don't render anything when not working
  if (!isWorking) {
    return null;
  }

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={colors.yellow}>
        <Spinner type="dots" />
      </Text>
      <Text color={colors.yellow}>{status}</Text>
      {hint && (
        <Text color={colors.brown} dimColor>
          ({hint})
        </Text>
      )}
    </Box>
  );
}
