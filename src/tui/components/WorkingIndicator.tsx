/**
 * WorkingIndicator - Spinner + status display during AI calls
 *
 * Displays an animated spinner with status text and elapsed time when the AI is processing.
 * Similar to Claude Code's "Thinking..." indicator with time tracking.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors, theme } from '../theme.js';

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
  /** Optional start time for elapsed time display (if not provided, tracks automatically) */
  startTime?: number;
}

/**
 * Props for the WorkingIndicator component
 */
export interface WorkingIndicatorProps {
  /** Working state object */
  state: WorkingState;
  /** Whether to show elapsed time (default: true) */
  showElapsedTime?: boolean;
  /** Visual variant: 'active' (yellow) or 'thinking' (grey) */
  variant?: 'active' | 'thinking';
}

/**
 * Format elapsed time in seconds
 */
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${seconds}s`;
}

/**
 * WorkingIndicator component
 *
 * Displays a spinner with status text and elapsed time when AI is processing.
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
 * // Renders: ⠋ Thinking... (12s) (esc to interrupt)
 * ```
 */
export function WorkingIndicator({
  state,
  showElapsedTime = true,
  variant = 'active',
}: WorkingIndicatorProps): React.ReactElement | null {
  const { isWorking, status, hint, startTime } = state;
  const indicatorColor = variant === 'thinking' ? colors.gray : colors.yellow;
  const [elapsedMs, setElapsedMs] = useState(0);
  const internalStartTimeRef = useRef<number | null>(null);

  // Track elapsed time
  useEffect(() => {
    if (!isWorking) {
      // Reset when not working
      internalStartTimeRef.current = null;
      setElapsedMs(0);
      return;
    }

    // Use provided startTime or create internal one
    const effectiveStartTime = startTime ?? internalStartTimeRef.current ?? Date.now();
    if (!startTime && !internalStartTimeRef.current) {
      internalStartTimeRef.current = effectiveStartTime;
    }

    // Update elapsed time every second
    const updateElapsed = () => {
      setElapsedMs(Date.now() - effectiveStartTime);
    };

    // Update immediately
    updateElapsed();

    // Then update every second
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isWorking, startTime]);

  // Don't render anything when not working
  if (!isWorking) {
    return null;
  }

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={indicatorColor}>
        <Spinner type="dots" />
      </Text>
      <Text color={indicatorColor}>{status}</Text>
      {showElapsedTime && elapsedMs >= 1000 && (
        <Text dimColor>({formatElapsedTime(elapsedMs)})</Text>
      )}
      {hint && (
        <Text color={colors.brown} dimColor>
          ({hint})
        </Text>
      )}
    </Box>
  );
}
