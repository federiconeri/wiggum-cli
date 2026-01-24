/**
 * WiggumBanner - ASCII art banner component
 *
 * Displays the Wiggum CLI ASCII art logo in Simpson yellow.
 * Inspired by Claude Code's welcome banner style.
 */

import React from 'react';
import { Text, Box } from 'ink';
import { colors } from '../theme.js';

/**
 * ASCII art banner for Wiggum CLI
 * Block-style font to match the cfonts 'block' style
 */
const BANNER = `
██╗    ██╗██╗ ██████╗  ██████╗ ██╗   ██╗███╗   ███╗
██║    ██║██║██╔════╝ ██╔════╝ ██║   ██║████╗ ████║
██║ █╗ ██║██║██║  ███╗██║  ███╗██║   ██║██╔████╔██║
██║███╗██║██║██║   ██║██║   ██║██║   ██║██║╚██╔╝██║
╚███╔███╔╝██║╚██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║
 ╚══╝╚══╝ ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝
`;

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
  if (compact) {
    return (
      <Box>
        <Text color={color} bold>
          WIGGUM CLI
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={color}>{BANNER}</Text>
    </Box>
  );
}
