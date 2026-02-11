/**
 * WiggumBanner - ASCII art banner component
 *
 * Displays the Wiggum CLI ASCII art logo in Simpson yellow.
 * Inspired by Claude Code's welcome banner style.
 */

import React from 'react';
import { Text, Box, useStdout } from 'ink';
import { colors } from '../theme.js';

/**
 * ASCII art banner for Wiggum CLI
 * Block-style font to match the cfonts 'block' style
 */
const BANNER = `██╗    ██╗██╗ ██████╗  ██████╗ ██╗   ██╗███╗   ███╗
██║    ██║██║██╔════╝ ██╔════╝ ██║   ██║████╗ ████║
██║ █╗ ██║██║██║  ███╗██║  ███╗██║   ██║██╔████╔██║
██║███╗██║██║██║   ██║██║   ██║██║   ██║██║╚██╔╝██║
╚███╔███╔╝██║╚██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║
 ╚══╝╚══╝ ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝
`;

/** Minimum terminal columns needed to display the banner without wrapping */
const BANNER_MIN_WIDTH = 55;

/**
 * Props for WiggumBanner component
 */
export interface WiggumBannerProps {
  /** Optional color override (defaults to Simpson yellow) */
  color?: string;
  /** Whether to show a compact version */
  compact?: boolean;
}

/**
 * WiggumBanner component
 *
 * Displays the Wiggum CLI ASCII art logo.
 *
 * @example
 * ```tsx
 * <WiggumBanner />
 * <WiggumBanner color="blue" />
 * <WiggumBanner compact />
 * ```
 */
export function WiggumBanner({
  color = colors.yellow,
  compact = false,
}: WiggumBannerProps): React.ReactElement {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  // Auto-compact when terminal is too narrow for the ASCII art
  if (compact || columns < BANNER_MIN_WIDTH) {
    return (
      <Box>
        <Text color={color} bold>
          WIGGUM CLI
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" overflow="hidden">
      <Text color={color} wrap="truncate">{BANNER}</Text>
    </Box>
  );
}
