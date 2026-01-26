/**
 * ToolCallCard - Clean Claude Code-style tool execution display
 *
 * Shows tool executions with:
 * - Colored status dot (green/yellow/red)
 * - Tool name and input as description
 * - Condensed output preview (not raw JSON)
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * Tool execution status
 */
export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Props for the ToolCallCard component
 */
export interface ToolCallCardProps {
  /** Name of the tool (e.g., "read_file", "search_codebase") */
  toolName: string;
  /** Tool execution status */
  status: ToolCallStatus;
  /** Input passed to the tool (e.g., file path, search query) */
  input: string;
  /** Result summary when status is 'complete' */
  output?: string;
  /** Error message when status is 'error' */
  error?: string;
}

/**
 * Format tool name for display (snake_case → Title Case)
 */
function formatToolName(toolName: string): string {
  // Convert snake_case or camelCase to readable format
  return toolName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get status dot character and color
 */
function getStatusDisplay(status: ToolCallStatus): { dot: string; color: string } {
  switch (status) {
    case 'pending':
      return { dot: '○', color: colors.brown };
    case 'running':
      return { dot: '◐', color: colors.yellow };
    case 'complete':
      return { dot: '●', color: colors.green };
    case 'error':
      return { dot: '●', color: colors.pink };
  }
}

/**
 * Format output for display - extract key info, not raw JSON
 */
function formatOutput(output: string | undefined, toolName: string): string | undefined {
  if (!output) return undefined;

  // Try to parse as JSON and extract meaningful summary
  try {
    const parsed = JSON.parse(output);

    // Handle different tool output patterns
    if (typeof parsed === 'object' && parsed !== null) {
      // For list_directory - show item count
      if (parsed.items && Array.isArray(parsed.items)) {
        return `${parsed.items.length} items`;
      }

      // For read_file - show line count or truncated content
      if (parsed.content && typeof parsed.content === 'string') {
        const lines = parsed.content.split('\n').length;
        return `${lines} lines`;
      }

      // For search results - show match count
      if (parsed.matches && Array.isArray(parsed.matches)) {
        return `${parsed.matches.length} matches`;
      }

      // For results array
      if (parsed.results && Array.isArray(parsed.results)) {
        return `${parsed.results.length} results`;
      }
    }

    // If it's a simple string
    if (typeof parsed === 'string') {
      return parsed.length > 50 ? parsed.slice(0, 50) + '...' : parsed;
    }
  } catch {
    // Not JSON - use as-is but truncate
    if (output.length > 60) {
      return output.slice(0, 60) + '...';
    }
    return output;
  }

  return undefined;
}

/**
 * Format input for display - extract the key part
 */
function formatInput(input: string): string {
  // Try to parse as JSON and extract path or query
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === 'object' && parsed !== null) {
      // Common input patterns
      if (parsed.path) return String(parsed.path);
      if (parsed.filePath) return String(parsed.filePath);
      if (parsed.query) return `"${parsed.query}"`;
      if (parsed.pattern) return `"${parsed.pattern}"`;
      if (parsed.directory) return String(parsed.directory);
    }
  } catch {
    // Not JSON - use as-is
  }

  // Truncate if too long
  if (input.length > 50) {
    return input.slice(0, 50) + '...';
  }
  return input;
}

/**
 * ToolCallCard component
 *
 * Displays a tool execution in Claude Code style:
 * - Status dot (colored based on status)
 * - Tool name with input as description
 * - Clean output summary (not raw JSON)
 *
 * @example
 * ```tsx
 * <ToolCallCard
 *   toolName="read_file"
 *   status="complete"
 *   input='{"path": "src/utils/config.ts"}'
 *   output='{"content": "...", "lines": 45}'
 * />
 * // Renders:
 * // ● Read File(src/utils/config.ts)  45 lines
 * ```
 */
export function ToolCallCard({
  toolName,
  status,
  input,
  output,
  error,
}: ToolCallCardProps): React.ReactElement {
  const { dot, color } = getStatusDisplay(status);
  const displayName = formatToolName(toolName);
  const displayInput = formatInput(input);
  const displayOutput = status === 'error' ? error : formatOutput(output, toolName);

  return (
    <Box flexDirection="row" gap={1}>
      {/* Status dot */}
      <Text color={color}>{dot}</Text>

      {/* Tool name and input */}
      <Text color={color} bold>
        {displayName}
      </Text>
      <Text color={color}>(</Text>
      <Text>{displayInput}</Text>
      <Text color={color}>)</Text>

      {/* Output summary */}
      {displayOutput && (
        <>
          <Text dimColor> → </Text>
          <Text color={status === 'error' ? colors.pink : undefined} dimColor={status !== 'error'}>
            {displayOutput}
          </Text>
        </>
      )}
    </Box>
  );
}
