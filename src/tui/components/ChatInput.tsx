/**
 * ChatInput - Multi-line input with history for chat interactions
 *
 * Displays a prompt character followed by a text input.
 * Handles submission on Enter and clears input after submit.
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';

/**
 * Props for the ChatInput component
 */
export interface ChatInputProps {
  /** Called when user presses Enter with the current input value */
  onSubmit: (value: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether input is disabled (e.g., during AI processing) */
  disabled?: boolean;
  /** Prompt character/text shown before input (default "> ") */
  prompt?: string;
}

/**
 * ChatInput component
 *
 * Provides a text input with a prompt character for chat-style interactions.
 * Clears input after submission. Shows dimmed appearance when disabled.
 *
 * @example
 * ```tsx
 * <ChatInput
 *   onSubmit={(value) => console.log('User said:', value)}
 *   placeholder="Type your response..."
 *   disabled={isProcessing}
 * />
 * // Renders: > Type your response...
 * ```
 */
export function ChatInput({
  onSubmit,
  placeholder = 'Type your message...',
  disabled = false,
  prompt = '> ',
}: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('');

  /**
   * Handle input submission
   * Calls onSubmit with current value and clears the input
   */
  const handleSubmit = (submittedValue: string): void => {
    // Don't submit empty values or when disabled
    if (disabled || !submittedValue.trim()) {
      return;
    }

    onSubmit(submittedValue);
    setValue('');
  };

  /**
   * Handle value changes
   * Only update if not disabled
   */
  const handleChange = (newValue: string): void => {
    if (!disabled) {
      setValue(newValue);
    }
  };

  // When disabled, show a waiting message
  if (disabled) {
    return (
      <Box flexDirection="row">
        <Text dimColor color={colors.brown}>
          {prompt}[waiting for AI...]
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row">
      <Text color={colors.yellow}>{prompt}</Text>
      <TextInput
        value={value}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
}
