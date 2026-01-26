/**
 * ActionOutput - Claude Code-style action output preview
 *
 * Shows tool/action executions with:
 * - Status indicator (colored dot)
 * - Action name and brief description
 * - Collapsible output preview with line count
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

/**
 * Action execution status
 */
export type ActionStatus = 'running' | 'success' | 'error';

/**
 * Props for the ActionOutput component
 */
export interface ActionOutputProps {
  /** Name of the action (e.g., "Read", "Search", "List") */
  actionName: string;
  /** Brief description of what the action did */
  description: string;
  /** Action execution status */
  status: ActionStatus;
  /** Full output content (may be multi-line) */
  output?: string;
  /** Error message when status is 'error' */
  error?: string;
  /** Number of preview lines to show when collapsed (default: 3) */
  previewLines?: number;
  /** Whether this action is focused for expansion */
  isFocused?: boolean;
}

/**
 * Get status dot color
 */
function getStatusColor(status: ActionStatus): string {
  switch (status) {
    case 'running':
      return colors.yellow;
    case 'success':
      return colors.green;
    case 'error':
      return colors.pink;
  }
}

/**
 * Get status dot character
 */
function getStatusDot(status: ActionStatus): string {
  switch (status) {
    case 'running':
      return '◐'; // Half-filled circle for running
    case 'success':
      return '●'; // Filled circle for success
    case 'error':
      return '●'; // Filled circle for error (color indicates)
  }
}

/**
 * Truncate and format output for preview
 */
function formatPreview(
  output: string | undefined,
  maxLines: number
): { preview: string; totalLines: number; truncated: boolean } {
  if (!output) {
    return { preview: '', totalLines: 0, truncated: false };
  }

  const lines = output.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines) {
    return { preview: output, totalLines, truncated: false };
  }

  const previewText = lines.slice(0, maxLines).join('\n');
  return { preview: previewText, totalLines, truncated: true };
}

/**
 * ActionOutput component
 *
 * Displays an action execution in Claude Code style:
 * - Status dot (colored based on status)
 * - Action name with description
 * - Indented output preview
 * - Expansion hint if output is truncated
 *
 * @example
 * ```tsx
 * <ActionOutput
 *   actionName="Read"
 *   description="src/utils/config.ts"
 *   status="success"
 *   output="const config = {...}\n// 45 lines"
 *   previewLines={3}
 * />
 * // Renders:
 * // ● Read(src/utils/config.ts)
 * //   const config = {...}
 * //   // 45 lines
 * //   ... +42 lines (ctrl+o to see all)
 * ```
 */
export function ActionOutput({
  actionName,
  description,
  status,
  output,
  error,
  previewLines = 3,
  isFocused = false,
}: ActionOutputProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const statusColor = getStatusColor(status);
  const statusDot = getStatusDot(status);

  // Handle expansion toggle when focused
  useInput((input, key) => {
    if (isFocused && (key.ctrl && input === 'o')) {
      setExpanded((prev) => !prev);
    }
  });

  const displayOutput = status === 'error' ? error : output;
  const { preview, totalLines, truncated } = formatPreview(
    displayOutput,
    expanded ? 1000 : previewLines
  );

  const hiddenLines = totalLines - previewLines;

  return (
    <Box flexDirection="column">
      {/* Header line: status dot + action name + description */}
      <Box flexDirection="row">
        <Text color={statusColor}>{statusDot} </Text>
        <Text color={statusColor} bold>{actionName}</Text>
        <Text color={statusColor}>(</Text>
        <Text>{description}</Text>
        <Text color={statusColor}>)</Text>
      </Box>

      {/* Output preview (indented) */}
      {preview && (
        <Box flexDirection="column" marginLeft={2}>
          {preview.split('\n').map((line, index) => (
            <Text key={index} dimColor={status !== 'error'} color={status === 'error' ? colors.pink : undefined}>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Truncation hint */}
      {truncated && !expanded && (
        <Box marginLeft={2}>
          <Text dimColor>
            ... +{hiddenLines} lines (ctrl+o to see all)
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Props for the ActionList component
 */
export interface ActionListProps {
  /** List of actions to display */
  actions: Array<{
    id: string;
    actionName: string;
    description: string;
    status: ActionStatus;
    output?: string;
    error?: string;
  }>;
  /** Maximum preview lines per action */
  previewLines?: number;
}

/**
 * ActionList component
 *
 * Displays a list of actions with their outputs.
 */
export function ActionList({
  actions,
  previewLines = 3,
}: ActionListProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      {actions.map((action) => (
        <ActionOutput
          key={action.id}
          actionName={action.actionName}
          description={action.description}
          status={action.status}
          output={action.output}
          error={action.error}
          previewLines={previewLines}
        />
      ))}
    </Box>
  );
}
