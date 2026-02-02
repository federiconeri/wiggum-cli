/**
 * ChatInput - Multi-line input with slash command support and history
 *
 * Displays a `›` prompt character followed by a text input.
 * Shows command dropdown when typing `/`.
 * Supports ↑/↓ arrow keys for command history navigation.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';
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
  const [cursorOffset, setCursorOffset] = useState(0);
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

  const clampCursor = useCallback((nextValue: string, nextCursor: number): number => {
    if (nextCursor < 0) return 0;
    if (nextCursor > nextValue.length) return nextValue.length;
    return nextCursor;
  }, []);

  const updateValue = useCallback(
    (nextValue: string, nextCursor: number, fromHistory: boolean = false): void => {
      const clampedCursor = clampCursor(nextValue, nextCursor);
      setValue(nextValue);
      setCursorOffset(clampedCursor);

      if (!fromHistory) {
        resetNavigation();
      }

      if (nextValue.startsWith('/') && !nextValue.includes(' ')) {
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
    },
    [clampCursor, resetNavigation]
  );

  const moveCursorByWordLeft = useCallback((currentValue: string, currentCursor: number): number => {
    let idx = currentCursor;
    while (idx > 0 && /\s/.test(currentValue[idx - 1]!)) {
      idx -= 1;
    }
    while (idx > 0 && /[A-Za-z0-9_]/.test(currentValue[idx - 1]!)) {
      idx -= 1;
    }
    return idx;
  }, []);

  const moveCursorByWordRight = useCallback((currentValue: string, currentCursor: number): number => {
    let idx = currentCursor;
    while (idx < currentValue.length && /\s/.test(currentValue[idx]!)) {
      idx += 1;
    }
    while (idx < currentValue.length && /[A-Za-z0-9_]/.test(currentValue[idx]!)) {
      idx += 1;
    }
    return idx;
  }, []);

  const handleEscapeSequence = useCallback(
    (input: string): boolean => {
      const seq = input;
      if (seq === '\u001bb' || seq === '\u001b[1;3D') {
        updateValue(value, moveCursorByWordLeft(value, cursorOffset), true);
        return true;
      }
      if (seq === '\u001bf' || seq === '\u001b[1;3C') {
        updateValue(value, moveCursorByWordRight(value, cursorOffset), true);
        return true;
      }
      if (seq === '\u001b[H' || seq === '\u001bOH') {
        updateValue(value, 0, true);
        return true;
      }
      if (seq === '\u001b[F' || seq === '\u001bOF') {
        updateValue(value, value.length, true);
        return true;
      }
      return false;
    },
    [cursorOffset, moveCursorByWordLeft, moveCursorByWordRight, updateValue, value]
  );

  const normalizePaste = useCallback((input: string): string => {
    let cleaned = input.replace(/\u001b\[200~|\u001b\[201~/g, '');
    cleaned = cleaned.replace(/[\r\n]+/g, ' ');
    cleaned = cleaned.replace(/\t/g, ' ');
    cleaned = cleaned.replace(/\u001b/g, '');
    return cleaned;
  }, []);

  // Handle keyboard input for history navigation + editing
  useInput((input, key) => {
    if (disabled) return;

    if (key.ctrl) {
      return;
    }

    // Submit on Enter
    if (key.return) {
      handleSubmit(value);
      return;
    }

    // Backspace
    if (key.backspace) {
      if (cursorOffset > 0) {
        const nextValue = value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
        updateValue(nextValue, cursorOffset - 1);
      }
      return;
    }

    // Delete
    if (key.delete) {
      if (cursorOffset < value.length) {
        const nextValue = value.slice(0, cursorOffset) + value.slice(cursorOffset + 1);
        updateValue(nextValue, cursorOffset);
      }
      return;
    }

    // Left/right arrows
    if (key.leftArrow) {
      updateValue(value, cursorOffset - 1, true);
      return;
    }
    if (key.rightArrow) {
      updateValue(value, cursorOffset + 1, true);
      return;
    }

    // Home/End
    if (key.home) {
      updateValue(value, 0, true);
      return;
    }
    if (key.end) {
      updateValue(value, value.length, true);
      return;
    }

    // Up arrow - navigate to previous command
    if (key.upArrow && !showDropdown) {
      // Save draft when starting navigation
      if (getCurrentItem() === null) {
        draftRef.current = value;
      }
      const prev = navigateUp();
      if (prev !== null) {
        isNavigatingRef.current = true;
        updateValue(prev, prev.length, true);
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
        const nextValue = next !== null ? next : draftRef.current;
        updateValue(nextValue, nextValue.length, true);
        isNavigatingRef.current = false;
      }
      return;
    }

    if (!input) return;

    if (key.meta && input.length === 1) {
      if (input === 'b') {
        updateValue(value, moveCursorByWordLeft(value, cursorOffset), true);
        return;
      }
      if (input === 'f') {
        updateValue(value, moveCursorByWordRight(value, cursorOffset), true);
        return;
      }
      return;
    }

    if (input.includes('\u001b')) {
      if (handleEscapeSequence(input)) {
        return;
      }
      // Ignore unknown escape sequences to avoid garbage insertion
      if (input.startsWith('\u001b')) {
        return;
      }
    }

    const textToInsert = input.length > 1 ? normalizePaste(input) : input;
    if (!textToInsert) return;
    const nextValue = value.slice(0, cursorOffset) + textToInsert + value.slice(cursorOffset);
    updateValue(nextValue, cursorOffset + textToInsert.length);
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
      updateValue('', 0, true);
      setShowDropdown(false);
    },
    [disabled, allowEmpty, onSubmit, addToHistory, updateValue]
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
      updateValue('', 0, true);
      setShowDropdown(false);
    },
    [onCommand, onSubmit, addToHistory, updateValue]
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

  const leftText = value.slice(0, cursorOffset);
  const rightText = value.slice(cursorOffset);
  const cursorChar = rightText ? rightText[0] : ' ';
  const remainder = rightText ? rightText.slice(1) : '';

  return (
    <Box flexDirection="column">
      {/* Input line first */}
      <Box flexDirection="row">
        <Text color={theme.colors.prompt} bold>
          {theme.chars.prompt}{' '}
        </Text>
        {value.length === 0 ? (
          <Box flexDirection="row">
            <Text inverse>{' '}</Text>
            <Text dimColor>{placeholder}</Text>
          </Box>
        ) : (
          <Box flexDirection="row">
            <Text>{leftText}</Text>
            <Text inverse>{cursorChar}</Text>
            <Text>{remainder}</Text>
          </Box>
        )}
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
