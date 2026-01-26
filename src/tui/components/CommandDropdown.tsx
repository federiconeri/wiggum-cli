/**
 * CommandDropdown - Slash command autocomplete dropdown
 *
 * Shows available commands when user types "/" in the input.
 * Supports arrow key navigation and Enter to select.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

/**
 * Command definition
 */
export interface Command {
  /** Command name (without /) */
  name: string;
  /** Description shown next to command */
  description: string;
}

/**
 * Props for the CommandDropdown component
 */
export interface CommandDropdownProps {
  /** Available commands */
  commands: Command[];
  /** Filter string (what user typed after /) */
  filter: string;
  /** Called when a command is selected */
  onSelect: (command: string) => void;
  /** Called when dropdown is dismissed (Escape) */
  onCancel: () => void;
}

/**
 * CommandDropdown component
 *
 * Displays a filtered list of available slash commands.
 *
 * @example
 * ```tsx
 * <CommandDropdown
 *   commands={[
 *     { name: 'init', description: 'Initialize a new CLAUDE.md file' },
 *     { name: 'new', description: 'Create a new feature spec' },
 *   ]}
 *   filter="in"
 *   onSelect={(cmd) => console.log('Selected:', cmd)}
 *   onCancel={() => setShowDropdown(false)}
 * />
 * ```
 */
export function CommandDropdown({
  commands,
  filter,
  onSelect,
  onCancel,
}: CommandDropdownProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on input
  const filteredCommands = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(filter.toLowerCase())
  );

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && filteredCommands.length > 0) {
      onSelect(filteredCommands[selectedIndex].name);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filteredCommands.length - 1, prev + 1));
      return;
    }
  });

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  if (filteredCommands.length === 0) {
    return (
      <Box paddingLeft={2}>
        <Text dimColor>No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {filteredCommands.map((cmd, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={cmd.name} flexDirection="row" gap={2}>
            <Text color={isSelected ? colors.blue : colors.yellow}>
              /{cmd.name}
            </Text>
            <Text color={isSelected ? colors.white : undefined} dimColor={!isSelected}>
              {cmd.description}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Default commands available in wiggum
 */
export const DEFAULT_COMMANDS: Command[] = [
  { name: 'init', description: 'Initialize project with CLAUDE.md' },
  { name: 'new', description: 'Create a new feature specification' },
  { name: 'run', description: 'Run a spec file with AI' },
  { name: 'help', description: 'Show available commands' },
  { name: 'clear', description: 'Clear conversation history' },
  { name: 'exit', description: 'Exit wiggum' },
];
