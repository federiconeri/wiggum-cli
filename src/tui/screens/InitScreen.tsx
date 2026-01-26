/**
 * InitScreen - Screen for the /init command workflow
 *
 * Handles project initialization within the TUI context.
 * Since the init workflow uses readline-based prompts, this screen
 * signals that init should run outside of Ink.
 */

import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * Props for the InitScreen component
 */
export interface InitScreenProps {
  /** Called to trigger the init workflow (runs outside Ink) */
  onRunInit: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

/**
 * InitScreen component
 *
 * Displays a message and triggers the init workflow.
 * The actual init workflow runs outside of Ink because it uses
 * readline-based interactive prompts.
 */
export function InitScreen({
  onRunInit,
  onCancel: _onCancel,
}: InitScreenProps): React.ReactElement {
  // Trigger init workflow on mount
  useEffect(() => {
    // Small delay to allow the screen to render before unmounting
    const timer = setTimeout(() => {
      onRunInit();
    }, 100);

    return () => clearTimeout(timer);
  }, [onRunInit]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={colors.yellow} bold>
          Initializing Project
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Starting initialization workflow...</Text>
      </Box>

      <Box>
        <Text dimColor>
          Press Ctrl+C to cancel
        </Text>
      </Box>
    </Box>
  );
}
