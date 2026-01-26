/**
 * Confirm - Yes/No confirmation component
 *
 * Simple y/n style confirmation with keyboard navigation.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

/**
 * Props for the Confirm component
 */
export interface ConfirmProps {
  /** The message/question to display */
  message: string;
  /** Called when user confirms or denies */
  onConfirm: (value: boolean) => void;
  /** Called when user cancels (Escape) */
  onCancel?: () => void;
  /** Initial value (default: true) */
  initialValue?: boolean;
}

/**
 * Confirm component
 *
 * A yes/no confirmation prompt. Use left/right arrows or y/n keys
 * to toggle, Enter to confirm, Escape to cancel.
 *
 * @example
 * ```tsx
 * <Confirm
 *   message="Generate Ralph configuration files?"
 *   onConfirm={(value) => {
 *     if (value) generateFiles();
 *     else navigate('back');
 *   }}
 *   onCancel={() => navigate('back')}
 * />
 * ```
 */
export function Confirm({
  message,
  onConfirm,
  onCancel,
  initialValue = true,
}: ConfirmProps): React.ReactElement {
  const [value, setValue] = useState(initialValue);

  useInput((input, key) => {
    // Toggle with left/right arrows
    if (key.leftArrow || key.rightArrow) {
      setValue((prev) => !prev);
      return;
    }

    // Direct yes/no input
    if (input === 'y' || input === 'Y') {
      setValue(true);
      onConfirm(true);
      return;
    }

    if (input === 'n' || input === 'N') {
      setValue(false);
      onConfirm(false);
      return;
    }

    // Submit on Enter
    if (key.return) {
      onConfirm(value);
      return;
    }

    // Cancel on Escape
    if (key.escape) {
      onCancel?.();
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {/* Question */}
      <Box marginBottom={1}>
        <Text color={colors.yellow}>? </Text>
        <Text>{message}</Text>
      </Box>

      {/* Options */}
      <Box paddingLeft={2}>
        <Text color={value ? colors.green : undefined} bold={value}>
          {value ? '❯ ' : '  '}Yes
        </Text>
        <Text> / </Text>
        <Text color={!value ? colors.pink : undefined} bold={!value}>
          {!value ? '❯ ' : '  '}No
        </Text>
      </Box>

      {/* Hint */}
      <Box marginTop={1} paddingLeft={2}>
        <Text dimColor>(←→ to toggle, y/n or Enter to confirm, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}
