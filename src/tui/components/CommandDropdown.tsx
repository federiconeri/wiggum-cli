/**
 * CommandDropdown - Slash command autocomplete dropdown
 *
 * Shows available commands when user types "/" in the input.
 * Displays below the input with a box border, Claude Code style.
 * Supports arrow key navigation and Enter to select.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, theme, box } from '../theme.js';

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
 * Calculate the max width needed for command names
 */
function getMaxCommandWidth(commands: Command[]): number {
  return Math.max(...commands.map((cmd) => cmd.name.length + 1)); // +1 for the /
}

/**
 * CommandDropdown component
 *
 * Displays a filtered list of available slash commands in a bordered box.
 * Appears below the input line, Claude Code style.
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

  // Calculate column widths for alignment
  const maxCmdWidth = getMaxCommandWidth(filteredCommands);

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
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>No matching commands</Text>
      </Box>
    );
  }

  // Build border strings
  const contentWidth = Math.max(50, maxCmdWidth + 30);
  const topBorder = box.topLeft + box.horizontal.repeat(contentWidth) + box.topRight;
  const bottomBorder = box.bottomLeft + box.horizontal.repeat(contentWidth) + box.bottomRight;

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      {/* Top border */}
      <Text dimColor>{topBorder}</Text>

      {/* Command list */}
      {filteredCommands.map((cmd, index) => {
        const isSelected = index === selectedIndex;
        const cmdText = `/${cmd.name}`;
        const padding = ' '.repeat(Math.max(0, maxCmdWidth - cmdText.length + 2));

        return (
          <Box key={cmd.name} flexDirection="row">
            <Text dimColor>{box.vertical}</Text>
            <Text
              backgroundColor={isSelected ? colors.yellow : undefined}
              color={isSelected ? colors.brown : colors.yellow}
            >
              {' '}{cmdText}
            </Text>
            <Text>{padding}</Text>
            <Text
              backgroundColor={isSelected ? colors.yellow : undefined}
              color={isSelected ? colors.brown : undefined}
              dimColor={!isSelected}
            >
              {cmd.description}
            </Text>
            {/* Pad to fill the box */}
            <Text>{' '.repeat(Math.max(0, contentWidth - cmdText.length - padding.length - cmd.description.length - 1))}</Text>
            <Text dimColor>{box.vertical}</Text>
          </Box>
        );
      })}

      {/* Bottom border */}
      <Text dimColor>{bottomBorder}</Text>
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
