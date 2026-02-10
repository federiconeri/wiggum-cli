/**
 * TipsBar - Contextual hints bar
 *
 * Renders a single dimmed line with slash commands highlighted in blue.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * Props for TipsBar component
 */
export interface TipsBarProps {
  /** Tip text - slash commands (e.g. /help) are auto-highlighted */
  text: string;
}

/**
 * TipsBar component
 *
 * Displays contextual tips with slash commands highlighted in blue.
 *
 * @example
 * ```tsx
 * <TipsBar text="Tip: /new <feature> to create spec, /help for commands" />
 * ```
 */
export function TipsBar({ text }: TipsBarProps): React.ReactElement {
  // Split text on slash commands to highlight them
  const parts = text.split(/(\/[a-zA-Z]+)/g);

  return (
    <Box>
      {parts.map((part, i) => {
        if (part.startsWith('/')) {
          return <Text key={i} color={colors.blue}>{part}</Text>;
        }
        return <Text key={i} dimColor>{part}</Text>;
      })}
    </Box>
  );
}
