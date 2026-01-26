/**
 * PasswordInput - Masked text input for sensitive data
 *
 * Displays asterisks instead of actual characters.
 * Useful for API key entry.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

/**
 * Props for the PasswordInput component
 */
export interface PasswordInputProps {
  /** The message/question to display */
  message: string;
  /** Called when user submits (Enter) */
  onSubmit: (value: string) => void;
  /** Called when user cancels (Escape or Ctrl+C) */
  onCancel?: () => void;
  /** Mask character (default: *) */
  mask?: string;
  /** Placeholder text when empty */
  placeholder?: string;
}

/**
 * PasswordInput component
 *
 * A masked text input that shows asterisks instead of actual characters.
 * Supports backspace for deletion and Enter to submit.
 *
 * @example
 * ```tsx
 * <PasswordInput
 *   message="Enter your ANTHROPIC_API_KEY:"
 *   onSubmit={(value) => saveApiKey(value)}
 *   onCancel={() => navigate('back')}
 * />
 * ```
 */
export function PasswordInput({
  message,
  onSubmit,
  onCancel,
  mask = '*',
  placeholder = 'Enter value...',
}: PasswordInputProps): React.ReactElement {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    // Cancel on Escape or Ctrl+C
    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel?.();
      return;
    }

    // Submit on Enter
    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
      return;
    }

    // Handle backspace/delete
    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Add printable characters (including pasted content)
    // Filter out control characters but allow multiple characters (paste)
    if (input && input.length > 0) {
      // Filter to only printable ASCII characters
      const printable = input.split('').filter(char => {
        const code = char.charCodeAt(0);
        return code >= 32 && code <= 126;
      }).join('');

      if (printable) {
        setValue((prev) => prev + printable);
      }
    }
  });

  const maskedValue = mask.repeat(value.length);
  const displayValue = value.length > 0 ? maskedValue : placeholder;

  return (
    <Box flexDirection="column">
      {/* Question */}
      <Box marginBottom={1}>
        <Text color={colors.yellow}>? </Text>
        <Text>{message}</Text>
      </Box>

      {/* Input field */}
      <Box paddingLeft={2}>
        <Text color={colors.brown}>&gt; </Text>
        <Text color={value.length > 0 ? colors.white : undefined} dimColor={value.length === 0}>
          {displayValue}
        </Text>
        <Text color={colors.yellow}>▌</Text>
      </Box>

      {/* Hint */}
      <Box marginTop={1} paddingLeft={2}>
        <Text dimColor>(Enter to submit, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}
