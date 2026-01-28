/**
 * StatusLine - Horizontal pipe-separated status display
 *
 * Replaces heavy PhaseHeader with a compact, Claude Code-style status line.
 * Format: Action │ Phase (X/Y) │ Path
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme, colors } from '../theme.js';

/**
 * Props for the StatusLine component
 */
export interface StatusLineProps {
  /** Main action name (e.g., "Initialize Project", "New Spec") */
  action: string;
  /** Current phase with progress (e.g., "Analysis (4/5)") */
  phase?: string;
  /** Path or context info (e.g., working directory or feature name) */
  path?: string;
}

/**
 * StatusLine component
 *
 * Displays a horizontal, pipe-separated status line for tracking progress.
 * More compact and professional than centered phase headers.
 *
 * @example
 * ```tsx
 * <StatusLine
 *   action="Initialize Project"
 *   phase="Analysis (4/5)"
 *   path="/Users/name/project"
 * />
 * // Renders: Initialize Project │ Analysis (4/5) │ /Users/name/project
 * ```
 */
export function StatusLine({
  action,
  phase,
  path,
}: StatusLineProps): React.ReactElement {
  const separator = theme.statusLine.separator;

  // Truncate path if too long (keep last 40 chars)
  const displayPath = path && path.length > 40
    ? '...' + path.slice(-37)
    : path;

  return (
    <Box flexDirection="row">
      {/* Action name in brand color */}
      <Text color={colors.yellow} bold>
        {action}
      </Text>

      {/* Phase (optional) */}
      {phase && (
        <>
          <Text dimColor>{separator}</Text>
          <Text>{phase}</Text>
        </>
      )}

      {/* Path (optional) */}
      {displayPath && (
        <>
          <Text dimColor>{separator}</Text>
          <Text dimColor>{displayPath}</Text>
        </>
      )}
    </Box>
  );
}
