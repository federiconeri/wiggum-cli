/**
 * FooterStatusBar - Persistent footer with separator and status line
 *
 * Wraps the existing StatusLine component with a horizontal separator
 * to create a Claude Code-style footer bar at the bottom of TUI screens.
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { StatusLine, type StatusLineProps } from './StatusLine.js';
import { colors } from '../theme.js';

/**
 * Props for the FooterStatusBar component.
 * Passes through all StatusLine props directly.
 */
export interface FooterStatusBarProps extends StatusLineProps {}

/**
 * Horizontal separator character (box drawing light horizontal)
 */
const SEPARATOR_CHAR = '\u2500';

/**
 * FooterStatusBar component
 *
 * Renders a full-width horizontal separator line followed by the existing
 * StatusLine component. Designed to be placed at the bottom of each
 * interactive TUI screen, below the input prompt.
 *
 * @example
 * ```tsx
 * <FooterStatusBar
 *   action="New Spec"
 *   phase="Context (1/4)"
 *   path="my-feature"
 * />
 * ```
 */
export function FooterStatusBar(props: FooterStatusBarProps): React.ReactElement {
  const { stdout } = useStdout();
  // Screens use padding={1}, so subtract 2 to avoid wrapping on narrow terminals.
  const width = Math.max(1, (stdout?.columns ?? 80) - 2);

  return (
    <Box flexDirection="column" width="100%">
      {/* Horizontal separator */}
      <Box width="100%">
        <Text color={colors.separator}>
          {SEPARATOR_CHAR.repeat(width)}
        </Text>
      </Box>

      {/* Status row - delegates to existing StatusLine */}
      <StatusLine {...props} />
    </Box>
  );
}
