/**
 * ChatInput - Multi-line input with slash command support
 *
 * Displays a `›` prompt character followed by a text input.
 * Shows command dropdown when typing `/`.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';
import { CommandDropdown, DEFAULT_COMMANDS, type Command } from './CommandDropdown.js';

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
  /** Allow empty submissions (e.g., to continue/skip phases) */
  allowEmpty?: boolean;
  /** Available slash commands (uses defaults if not provided) */
  commands?: Command[];
  /** Called when a slash command is selected */
  onCommand?: (command: string) => void;
}

/**
 * ChatInput component
 *
 * Provides a text input with `›` prompt for chat-style interactions.
 * Shows command dropdown when input starts with `/`.
 *
 * @example
 * ```tsx
 * <ChatInput
 *   onSubmit={(value) => console.log('User said:', value)}
 *   placeholder="Type your message..."
 *   disabled={isProcessing}
 * />
 * // Renders: › Type your message...
 * ```
 */
export function ChatInput({
  onSubmit,
  placeholder = 'Type your message...',
  disabled = false,
  allowEmpty = false,
  commands = DEFAULT_COMMANDS,
  onCommand,
}: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Check if input is a slash command (only show dropdown before space is typed)
  const isSlashCommand = value.startsWith('/');
  const hasSpace = value.includes(' ');
  // Only filter on the command name part (before the first space)
  const commandFilter = isSlashCommand ? value.slice(1).split(' ')[0] : '';

  /**
   * Handle input submission
   */
  const handleSubmit = useCallback(
    (submittedValue: string): void => {
      if (disabled) return;

      // Handle slash commands
      if (submittedValue.startsWith('/') && onCommand) {
        const cmdName = submittedValue.slice(1).trim().split(' ')[0];
        if (cmdName) {
          onCommand(cmdName);
          setValue('');
          setShowDropdown(false);
          return;
        }
      }

      // Don't submit empty values unless allowEmpty is true
      if (!submittedValue.trim() && !allowEmpty) {
        return;
      }

      onSubmit(submittedValue);
      setValue('');
      setShowDropdown(false);
    },
    [disabled, allowEmpty, onSubmit, onCommand]
  );

  /**
   * Handle value changes
   */
  const handleChange = useCallback(
    (newValue: string): void => {
      if (disabled) return;
      setValue(newValue);

      // Show dropdown when typing / but hide once a space is typed (entering arguments)
      if (newValue.startsWith('/') && !newValue.includes(' ')) {
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
    },
    [disabled]
  );

  /**
   * Handle command selection from dropdown
   */
  const handleCommandSelect = useCallback(
    (cmdName: string) => {
      if (onCommand) {
        onCommand(cmdName);
      } else {
        // If no onCommand handler, just submit the command
        onSubmit(`/${cmdName}`);
      }
      setValue('');
      setShowDropdown(false);
    },
    [onCommand, onSubmit]
  );

  /**
   * Handle dropdown cancel
   */
  const handleDropdownCancel = useCallback(() => {
    setShowDropdown(false);
  }, []);

  // When disabled, show a waiting message
  if (disabled) {
    return (
      <Box flexDirection="row">
        <Text dimColor color={colors.brown}>
          › [waiting for AI...]
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Command dropdown - only show while typing command name, not arguments */}
      {showDropdown && isSlashCommand && !hasSpace && (
        <CommandDropdown
          commands={commands}
          filter={commandFilter}
          onSelect={handleCommandSelect}
          onCancel={handleDropdownCancel}
        />
      )}

      {/* Input line */}
      <Box flexDirection="row">
        <Text color={colors.blue} bold>
          ›{' '}
        </Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      </Box>
    </Box>
  );
}
