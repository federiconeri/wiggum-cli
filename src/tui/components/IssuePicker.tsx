/**
 * IssuePicker - GitHub issue selection dropdown
 *
 * Displays a bordered list of GitHub issues for the user to navigate
 * and select from. Follows the visual style of CommandDropdown.
 * Supports arrow keys and j/k for navigation, Enter to select, Esc to cancel.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { colors, box } from '../theme.js';
import type { GitHubIssueListItem } from '../../utils/github.js';

/**
 * Props for the IssuePicker component
 */
export interface IssuePickerProps {
  /** List of issues to display */
  issues: GitHubIssueListItem[];
  /** Repository slug (e.g. "owner/repo") shown in header */
  repoSlug: string;
  /** Called when an issue is selected */
  onSelect: (issue: GitHubIssueListItem) => void;
  /** Called when the picker is dismissed (Escape) */
  onCancel: () => void;
  /** Whether issues are currently loading */
  isLoading: boolean;
  /** Optional error message to display */
  error?: string;
}

/**
 * IssuePicker component
 *
 * Renders a bordered dropdown list of GitHub issues.
 * Loading, empty, and error states are handled inline.
 *
 * @example
 * ```tsx
 * <IssuePicker
 *   issues={issues}
 *   repoSlug="acme/api"
 *   onSelect={(issue) => console.log('Selected:', issue.number)}
 *   onCancel={() => setShowPicker(false)}
 *   isLoading={false}
 * />
 * ```
 */
export function IssuePicker({
  issues,
  repoSlug,
  onSelect,
  onCancel,
  isLoading,
  error,
}: IssuePickerProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && issues.length > 0) {
      onSelect(issues[selectedIndex]);
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(issues.length - 1, prev + 1));
      return;
    }
  });

  // Build border strings
  const headerLabel = ` GitHub Issues ${box.horizontal} ${repoSlug} `;
  const contentWidth = Math.max(60, headerLabel.length + 10);
  const topBorderFill = contentWidth - headerLabel.length - 1;
  const topBorder = box.topLeft + box.horizontal + headerLabel + box.horizontal.repeat(Math.max(0, topBorderFill)) + box.topRight;
  const bottomBorder = box.bottomLeft + box.horizontal.repeat(contentWidth) + box.bottomRight;

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      {/* Top border with header */}
      <Text dimColor>{topBorder}</Text>

      {/* Loading state */}
      {isLoading && (
        <Box flexDirection="row">
          <Text dimColor>{box.vertical}</Text>
          <Text> </Text>
          <Spinner type="dots" />
          <Text color={colors.yellow}> Searching...</Text>
          <Text>{' '.repeat(Math.max(0, contentWidth - 16))}</Text>
          <Text dimColor>{box.vertical}</Text>
        </Box>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <Box flexDirection="row">
          <Text dimColor>{box.vertical}</Text>
          <Text color={colors.pink}> {error}</Text>
          <Text>{' '.repeat(Math.max(0, contentWidth - error.length - 1))}</Text>
          <Text dimColor>{box.vertical}</Text>
        </Box>
      )}

      {/* Empty state */}
      {!isLoading && !error && issues.length === 0 && (
        <Box flexDirection="row">
          <Text dimColor>{box.vertical}</Text>
          <Text dimColor> No issues found</Text>
          <Text>{' '.repeat(Math.max(0, contentWidth - 16))}</Text>
          <Text dimColor>{box.vertical}</Text>
        </Box>
      )}

      {/* Issue list */}
      {!isLoading && !error && issues.map((issue, index) => {
        const isSelected = index === selectedIndex;
        const numberText = `#${issue.number}`;
        const stateText = issue.state;
        const labelText = issue.labels.length > 0 ? issue.labels[0] : '';

        return (
          <Box key={issue.number} flexDirection="row">
            <Text dimColor>{box.vertical}</Text>
            <Text
              backgroundColor={isSelected ? colors.yellow : undefined}
              color={isSelected ? colors.brown : colors.yellow}
            >
              {' '}{numberText}
            </Text>
            <Text
              backgroundColor={isSelected ? colors.yellow : undefined}
              color={isSelected ? colors.brown : undefined}
            >
              {'  '}{issue.title}
            </Text>
            <Text
              backgroundColor={isSelected ? colors.yellow : undefined}
              color={isSelected ? colors.brown : (issue.state === 'open' ? colors.green : colors.gray)}
            >
              {'  '}{stateText}
            </Text>
            {labelText && (
              <Text
                backgroundColor={isSelected ? colors.yellow : undefined}
                color={isSelected ? colors.brown : colors.gray}
              >
                {'  '}{labelText}
              </Text>
            )}
            <Text dimColor>{' '.repeat(1)}{box.vertical}</Text>
          </Box>
        );
      })}

      {/* Bottom border */}
      <Text dimColor>{bottomBorder}</Text>

      {/* Hint bar */}
      <Box marginLeft={1}>
        <Text color={colors.gray}>
          {'('}
          {'\u2191\u2193 navigate, Enter select, type to search, Esc cancel'}
          {')'}
        </Text>
      </Box>
    </Box>
  );
}
