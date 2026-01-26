/**
 * Select - Arrow-key navigable selection component
 *
 * Displays a list of options that can be navigated with arrow keys.
 * Press Enter to select, Escape to cancel.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

/**
 * Option for the Select component
 */
export interface SelectOption<T> {
  /** The value returned when this option is selected */
  value: T;
  /** Display label for the option */
  label: string;
  /** Optional hint text shown dimmed after the label */
  hint?: string;
}

/**
 * Props for the Select component
 */
export interface SelectProps<T> {
  /** The message/question to display */
  message: string;
  /** Available options */
  options: SelectOption<T>[];
  /** Called when an option is selected */
  onSelect: (value: T) => void;
  /** Called when user cancels (Escape) */
  onCancel?: () => void;
  /** Initial selected index (default: 0) */
  initialIndex?: number;
}

/**
 * Select component
 *
 * Arrow-key navigable selection list. Use up/down arrows or j/k to navigate,
 * Enter to select, Escape to cancel.
 *
 * @example
 * ```tsx
 * <Select
 *   message="Select your AI provider:"
 *   options={[
 *     { value: 'anthropic', label: 'Anthropic', hint: 'recommended' },
 *     { value: 'openai', label: 'OpenAI' },
 *     { value: 'openrouter', label: 'OpenRouter', hint: 'multiple providers' },
 *   ]}
 *   onSelect={(value) => setProvider(value)}
 *   onCancel={() => navigate('back')}
 * />
 * ```
 */
export function Select<T>({
  message,
  options,
  onSelect,
  onCancel,
  initialIndex = 0,
}: SelectProps<T>): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useInput((input, key) => {
    // Navigate up
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
      return;
    }

    // Navigate down
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev + 1) % options.length);
      return;
    }

    // Select current option
    if (key.return) {
      const selected = options[selectedIndex];
      if (selected) {
        onSelect(selected.value);
      }
      return;
    }

    // Cancel
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
      <Box flexDirection="column">
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={String(option.value)} paddingLeft={2}>
              <Text color={isSelected ? colors.blue : undefined}>
                {isSelected ? '❯ ' : '  '}
              </Text>
              <Text color={isSelected ? colors.blue : undefined}>
                {option.label}
              </Text>
              {option.hint && (
                <Text dimColor> ({option.hint})</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Hint */}
      <Box marginTop={1} paddingLeft={2}>
        <Text dimColor>(↑↓ to move, Enter to select, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}
