/**
 * ToolCallCard - Claude Code-style tool execution display
 *
 * Shows tool executions with:
 * - Colored status dot (green/yellow/red)
 * - Tool name and input as description
 * - Condensed output preview with collapsible content
 * - Dimmed by default to reduce visual weight
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

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
  /** Whether the tool output is expanded (shows preview lines) */
  expanded?: boolean;
  /** Number of preview lines to show when expanded (default: 3) */
  previewLines?: number;
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
      return { dot: '○', color: theme.colors.tool.pending };
    case 'running':
      return { dot: '◐', color: theme.colors.tool.running };
    case 'complete':
      return { dot: theme.chars.bullet, color: theme.colors.tool.success };
    case 'error':
      return { dot: theme.chars.bullet, color: theme.colors.tool.error };
  }
}

/**
 * Parse output and extract summary and preview lines
 */
interface ParsedOutput {
  summary: string;
  previewLines: string[];
  totalLines: number;
  remainingCount: number;
}

function parseOutput(output: string | undefined, toolName: string): ParsedOutput | null {
  if (!output) return null;

  let summary = '';
  let lines: string[] = [];
  let totalLines = 0;

  // Try to parse as JSON and extract meaningful content
  try {
    const parsed = JSON.parse(output);

    if (typeof parsed === 'object' && parsed !== null) {
      // For list_directory - show item count and items
      if (parsed.items && Array.isArray(parsed.items)) {
        totalLines = parsed.items.length;
        summary = `${totalLines} items`;
        lines = parsed.items.slice(0, 10).map((item: string | { name: string; type: string }) => {
          if (typeof item === 'string') return item;
          const icon = item.type === 'directory' ? '📁' : '📄';
          return `${icon} ${item.name}`;
        });
      }
      // For read_file - show line count and content preview
      else if (parsed.content && typeof parsed.content === 'string') {
        const contentLines = parsed.content.split('\n');
        totalLines = contentLines.length;
        summary = `${totalLines} lines`;
        lines = contentLines.slice(0, 10).map((line: string) =>
          line.length > 80 ? line.slice(0, 77) + '...' : line
        );
      }
      // For search results - show match count and matches
      else if (parsed.matches && Array.isArray(parsed.matches)) {
        totalLines = parsed.matches.length;
        summary = `${totalLines} matches`;
        lines = parsed.matches.slice(0, 10).map((match: { file?: string; path?: string; line?: number }) => {
          const file = match.file || match.path || '';
          const lineNum = match.line ? `:${match.line}` : '';
          return `${file}${lineNum}`;
        });
      }
      // For results array
      else if (parsed.results && Array.isArray(parsed.results)) {
        totalLines = parsed.results.length;
        summary = `${totalLines} results`;
        lines = parsed.results.slice(0, 10).map((r: unknown) =>
          typeof r === 'string' ? r : JSON.stringify(r).slice(0, 60)
        );
      }
      // Generic object - stringify first few keys
      else {
        const keys = Object.keys(parsed);
        summary = `${keys.length} fields`;
        lines = keys.slice(0, 5).map((k) => `${k}: ${JSON.stringify(parsed[k]).slice(0, 40)}`);
        totalLines = keys.length;
      }
    } else if (typeof parsed === 'string') {
      // Simple string result
      const stringLines = parsed.split('\n');
      totalLines = stringLines.length;
      summary = totalLines > 1 ? `${totalLines} lines` : (parsed.length > 50 ? parsed.slice(0, 50) + '...' : parsed);
      lines = stringLines.slice(0, 10);
    }
  } catch {
    // Not JSON - treat as plain text
    const textLines = output.split('\n');
    totalLines = textLines.length;
    summary = totalLines > 1 ? `${totalLines} lines` : (output.length > 50 ? output.slice(0, 50) + '...' : output);
    lines = textLines.slice(0, 10).map((line: string) =>
      line.length > 80 ? line.slice(0, 77) + '...' : line
    );
  }

  return {
    summary,
    previewLines: lines,
    totalLines,
    remainingCount: Math.max(0, totalLines - lines.length),
  };
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
 * - Clean output summary with optional preview lines
 * - Dimmed by default for reduced visual weight
 *
 * @example
 * ```tsx
 * <ToolCallCard
 *   toolName="read_file"
 *   status="complete"
 *   input='{"path": "src/utils/config.ts"}'
 *   output='{"content": "...", "lines": 45}'
 *   expanded={true}
 * />
 * // Renders:
 * // ● Read File(src/utils/config.ts) → 45 lines
 * //   │ import { Config } from './types';
 * //   │ export function loadConfig() {
 * //   └ +43 more
 * ```
 */
export function ToolCallCard({
  toolName,
  status,
  input,
  output,
  error,
  expanded = false,
  previewLines: maxPreviewLines = 3,
}: ToolCallCardProps): React.ReactElement {
  const { dot, color } = getStatusDisplay(status);
  const displayName = formatToolName(toolName);
  const displayInput = formatInput(input);

  // Parse output for summary and preview
  const parsedOutput = status === 'complete' ? parseOutput(output, toolName) : null;
  const displayError = status === 'error' ? error : undefined;

  // Determine what to show
  const summary = displayError || parsedOutput?.summary;
  const showPreview = expanded && parsedOutput && parsedOutput.previewLines.length > 0;
  const linesToShow = showPreview ? parsedOutput.previewLines.slice(0, maxPreviewLines) : [];
  const remainingCount = showPreview
    ? parsedOutput.totalLines - linesToShow.length
    : (parsedOutput?.remainingCount || 0);

  return (
    <Box flexDirection="column">
      {/* Main line: colored LED, bold name, dimmed args */}
      <Box flexDirection="row">
        <Text color={color}>{dot}</Text>
        <Text> </Text>
        <Text bold>{displayName}</Text>
        <Text dimColor>({displayInput})</Text>
      </Box>

      {/* Summary on next line with └ prefix */}
      {summary && (
        <Box marginLeft={2}>
          <Text dimColor>{theme.chars.lineEnd} </Text>
          <Text color={status === 'error' ? theme.colors.error : undefined} dimColor={status !== 'error'}>
            {summary}
          </Text>
        </Box>
      )}

      {/* Preview lines with line numbers when expanded */}
      {showPreview && (
        <Box flexDirection="column" marginLeft={4}>
          {linesToShow.map((line, index) => (
            <Box key={index} flexDirection="row">
              <Text dimColor>{String(index + 1).padStart(4)} </Text>
              <Text dimColor>{line}</Text>
            </Box>
          ))}
          {remainingCount > 0 && (
            <Text dimColor>... +{remainingCount} lines (ctrl+o to expand)</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
