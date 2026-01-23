/**
 * ToolCallCard - Collapsible tool execution display
 *
 * Shows tool executions in a bordered card format, similar to Claude Code.
 * Displays tool name, input, status indicator, and output/error.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, box, phase } from '../theme.js';

/**
 * Tool execution status
 */
export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Props for the ToolCallCard component
 */
export interface ToolCallCardProps {
  /** Name of the tool (e.g., "Read File", "Search Codebase") */
  toolName: string;
  /** Tool execution status */
  status: ToolCallStatus;
  /** Input passed to the tool (e.g., file path, search query) */
  input: string;
  /** Result summary when status is 'complete' */
  output?: string;
  /** Error message when status is 'error' */
  error?: string;
  /** Whether to show full details (default: false = collapsed) */
  expanded?: boolean;
}

/**
 * Maps status to phase indicator character
 */
function getStatusIndicator(status: ToolCallStatus): string {
  switch (status) {
    case 'pending':
      return phase.pending;
    case 'running':
      return phase.active;
    case 'complete':
      return phase.complete;
    case 'error':
      return phase.error;
  }
}

/**
 * Gets the color for the status indicator
 */
function getStatusColor(status: ToolCallStatus): string {
  switch (status) {
    case 'pending':
      return colors.brown;
    case 'running':
      return colors.yellow;
    case 'complete':
      return colors.yellow;
    case 'error':
      return colors.pink;
  }
}

/**
 * Gets human-readable status text
 */
function getStatusText(status: ToolCallStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Error';
  }
}

/**
 * ToolCallCard component
 *
 * Displays a tool execution in a bordered card format.
 *
 * @example
 * ```tsx
 * // Collapsed (default)
 * <ToolCallCard
 *   toolName="Read File"
 *   status="complete"
 *   input="src/utils/config.ts"
 *   output="45 lines read"
 * />
 * // Renders:
 * // ┌─ Read File ────────────────────────────────┐
 * // │ src/utils/config.ts   ✓ 45 lines read      │
 * // └────────────────────────────────────────────┘
 *
 * // Expanded
 * <ToolCallCard
 *   toolName="Read File"
 *   status="complete"
 *   input="src/utils/config.ts"
 *   output="45 lines read"
 *   expanded={true}
 * />
 * // Renders:
 * // ┌─ Read File ────────────────────────────────┐
 * // │ Input: src/utils/config.ts                 │
 * // │ Status: Complete                           │
 * // │ Result: 45 lines read                      │
 * // └────────────────────────────────────────────┘
 * ```
 */
export function ToolCallCard({
  toolName,
  status,
  input,
  output,
  error,
  expanded = false,
}: ToolCallCardProps): React.ReactElement {
  const statusIndicator = getStatusIndicator(status);
  const statusColor = getStatusColor(status);
  const statusText = getStatusText(status);

  // Build the title with box drawing
  const titlePadding = box.horizontal.repeat(3);
  const title = `${box.horizontal} ${toolName} ${titlePadding}`;

  // Determine result text
  const resultText = status === 'error' ? error : output;

  if (expanded) {
    // Expanded layout: multiple lines with labels
    return (
      <Box flexDirection="column">
        {/* Top border with title */}
        <Box flexDirection="row">
          <Text color={colors.brown}>{box.topLeft}</Text>
          <Text color={colors.yellow}>{title}</Text>
        </Box>

        {/* Input line */}
        <Box flexDirection="row">
          <Text color={colors.brown}>{box.vertical} </Text>
          <Text color={colors.brown}>Input: </Text>
          <Text color={colors.white}>{input}</Text>
        </Box>

        {/* Status line */}
        <Box flexDirection="row">
          <Text color={colors.brown}>{box.vertical} </Text>
          <Text color={colors.brown}>Status: </Text>
          <Text color={statusColor}>
            {statusIndicator} {statusText}
          </Text>
        </Box>

        {/* Result/Error line (if present) */}
        {resultText && (
          <Box flexDirection="row">
            <Text color={colors.brown}>{box.vertical} </Text>
            <Text color={colors.brown}>{status === 'error' ? 'Error: ' : 'Result: '}</Text>
            <Text color={status === 'error' ? colors.pink : colors.white}>{resultText}</Text>
          </Box>
        )}

        {/* Bottom border */}
        <Box flexDirection="row">
          <Text color={colors.brown}>
            {box.bottomLeft}
            {box.horizontal.repeat(40)}
          </Text>
        </Box>
      </Box>
    );
  }

  // Collapsed layout: single content line
  return (
    <Box flexDirection="column">
      {/* Top border with title */}
      <Box flexDirection="row">
        <Text color={colors.brown}>{box.topLeft}</Text>
        <Text color={colors.yellow}>{title}</Text>
      </Box>

      {/* Content line: input + status + result */}
      <Box flexDirection="row">
        <Text color={colors.brown}>{box.vertical} </Text>
        <Text color={colors.white}>{input}</Text>
        <Text>   </Text>
        <Text color={statusColor}>{statusIndicator}</Text>
        {resultText && (
          <>
            <Text> </Text>
            <Text color={status === 'error' ? colors.pink : colors.white}>{resultText}</Text>
          </>
        )}
      </Box>

      {/* Bottom border */}
      <Box flexDirection="row">
        <Text color={colors.brown}>
          {box.bottomLeft}
          {box.horizontal.repeat(40)}
        </Text>
      </Box>
    </Box>
  );
}
