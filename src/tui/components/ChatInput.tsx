/**
 * ChatInput - Multi-line input with slash command support and history
 *
 * Displays a `›` prompt character followed by a text input.
 * Shows command dropdown when typing `/`.
 * Supports ↑/↓ arrow keys for command history navigation.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors, theme } from '../theme.js';
import { CommandDropdown, DEFAULT_COMMANDS, type Command } from './CommandDropdown.js';
import { useCommandHistory } from '../hooks/useCommandHistory.js';

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
 * Use ↑/↓ arrows to navigate command history.
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
  const { addToHistory, navigateUp, navigateDown, getCurrentItem, resetNavigation } = useCommandHistory();

  // Track if we're navigating history (to prevent resetting on our own changes)
  const isNavigatingRef = useRef(false);

  // Check if input is a slash command (only show dropdown before space is typed)
  const isSlashCommand = value.startsWith('/');
  const hasSpace = value.includes(' ');
  // Only filter on the command name part (before the first space)
  const commandFilter = isSlashCommand ? value.slice(1).split(' ')[0] : '';

  // Store draft input when starting history navigation
  const draftRef = useRef<string>('');

  // Handle keyboard input for history navigation
  useInput((input, key) => {
    if (disabled) return;

    // Up arrow - navigate to previous command
    if (key.upArrow && !showDropdown) {
      // Save draft when starting navigation
      if (getCurrentItem() === null) {
        draftRef.current = value;
      }
      const prev = navigateUp();
      if (prev !== null) {
        isNavigatingRef.current = true;
        setValue(prev);
        isNavigatingRef.current = false;
      }
      return;
    }

    // Down arrow - navigate to next command (only when in history)
    if (key.downArrow && !showDropdown) {
      const current = getCurrentItem();
      // Only navigate if we're currently viewing history
      if (current !== null) {
        const next = navigateDown();
        isNavigatingRef.current = true;
        // Restore draft when exiting history, otherwise show next command
        setValue(next !== null ? next : draftRef.current);
        isNavigatingRef.current = false;
      }
      return;
    }
  });

  /**
   * Handle input submission
   */
  const handleSubmit = useCallback(
    (submittedValue: string): void => {
      if (disabled) return;

      // Don't submit empty values unless allowEmpty is true
      if (!submittedValue.trim() && !allowEmpty) {
        return;
      }

      // Add to history before submitting
      addToHistory(submittedValue);

      // Always pass the full value to onSubmit (including slash commands with args)
      onSubmit(submittedValue);
      setValue('');
      setShowDropdown(false);
    },
    [disabled, allowEmpty, onSubmit, addToHistory]
  );

  /**
   * Handle value changes
   */
  const handleChange = useCallback(
    (newValue: string): void => {
      if (disabled) return;
      setValue(newValue);

      // Reset history navigation when user types (unless we triggered this change)
      if (!isNavigatingRef.current) {
        resetNavigation();
      }

      // Show dropdown when typing / but hide once a space is typed (entering arguments)
      if (newValue.startsWith('/') && !newValue.includes(' ')) {
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
    },
    [disabled, resetNavigation]
  );

  /**
   * Handle command selection from dropdown
   */
  const handleCommandSelect = useCallback(
    (cmdName: string) => {
      // Always add to history for consistent recall
      addToHistory(`/${cmdName}`);

      if (onCommand) {
        onCommand(cmdName);
      } else {
        // If no onCommand handler, just submit the command
        onSubmit(`/${cmdName}`);
      }
      setValue('');
      setShowDropdown(false);
    },
    [onCommand, onSubmit, addToHistory]
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
        <Text dimColor color={theme.colors.aiDim}>
          {theme.chars.prompt} [waiting for Wiggum...]
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Input line first */}
      <Box flexDirection="row">
        <Text color={theme.colors.prompt} bold>
          {theme.chars.prompt}{' '}
        </Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      </Box>

      {/* Command dropdown below input - only show while typing command name, not arguments */}
      {showDropdown && isSlashCommand && !hasSpace && (
        <CommandDropdown
          commands={commands}
          filter={commandFilter}
          onSelect={handleCommandSelect}
          onCancel={handleDropdownCancel}
        />
      )}
    </Box>
  );
}
