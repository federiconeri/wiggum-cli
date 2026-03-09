/**
 * IssuePicker - GitHub issue selection dropdown
 *
 * Displays a bordered list of GitHub issues for the user to navigate
 * and select from. Follows the visual style of CommandDropdown.
 * Supports arrow keys and j/k for navigation, Enter to select, Esc to cancel.
 */

import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { colors, box } from '../theme.js';
import type { GitHubIssueListItem } from '../../utils/github.js';

const MAX_LABELS = 2;

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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

// Fixed column widths
const COL_NUMBER = 6;   // " #104 "
const COL_STATE = 8;    // " closed " or "  open  "
const COL_LABELS = 14;  // " enhancement "
const COL_CHROME = 2;   // left + right border

export function IssuePicker({
  issues,
  repoSlug,
  onSelect,
  onCancel,
  isLoading,
  error,
}: IssuePickerProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { stdout } = useStdout();
  const termColumns = stdout?.columns ?? 80;

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [issues]);

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

  const countSuffix = !isLoading && !error ? ` (${issues.length})` : '';
  const headerLabel = ` GitHub Issues ${box.horizontal} ${repoSlug}${countSuffix} `;
  const contentWidth = Math.min(Math.max(60, headerLabel.length + 10), termColumns - 6);
  const topBorderFill = contentWidth - headerLabel.length - 1;
  const topBorder = box.topLeft + box.horizontal + headerLabel + box.horizontal.repeat(Math.max(0, topBorderFill)) + box.topRight;
  const bottomBorder = box.bottomLeft + box.horizontal.repeat(contentWidth) + box.bottomRight;

  // Title column gets all remaining space
  const colTitle = Math.max(20, contentWidth - COL_NUMBER - COL_STATE - COL_LABELS - COL_CHROME);

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      <Text dimColor>{topBorder}</Text>

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

      {!isLoading && error && (
        <Box flexDirection="row">
          <Text dimColor>{box.vertical}</Text>
          <Text color={colors.pink}>{pad(` ${error}`, contentWidth)}</Text>
          <Text dimColor>{box.vertical}</Text>
        </Box>
      )}

      {!isLoading && !error && issues.length === 0 && (
        <Box flexDirection="row">
          <Text dimColor>{box.vertical}</Text>
          <Text dimColor>{pad(' No open issues found', contentWidth)}</Text>
          <Text dimColor>{box.vertical}</Text>
        </Box>
      )}

      {!isLoading && !error && issues.map((issue, index) => {
        const isSelected = index === selectedIndex;
        const bg = isSelected ? colors.yellow : undefined;
        const fg = isSelected ? colors.brown : undefined;

        const numberCell = pad(` #${issue.number}`, COL_NUMBER);
        const titleCell = pad(` ${truncate(issue.title, colTitle - 1)}`, colTitle);
        const stateCell = pad(` ${issue.state}`, COL_STATE);
        const labelText = issue.labels.slice(0, MAX_LABELS).join(' ');
        const labelCell = pad(` ${truncate(labelText, COL_LABELS - 1)}`, COL_LABELS);

        return (
          <Box key={issue.number} flexDirection="row">
            <Text dimColor>{box.vertical}</Text>
            <Text backgroundColor={bg} color={isSelected ? colors.brown : colors.yellow}>
              {numberCell}
            </Text>
            <Text backgroundColor={bg} color={fg}>
              {titleCell}
            </Text>
            <Text backgroundColor={bg} color={isSelected ? colors.brown : issue.state === 'open' ? colors.green : colors.gray}>
              {stateCell}
            </Text>
            <Text backgroundColor={bg} color={isSelected ? colors.brown : colors.gray}>
              {labelCell}
            </Text>
            <Text dimColor>{box.vertical}</Text>
          </Box>
        );
      })}

      <Text dimColor>{bottomBorder}</Text>

      <Box marginLeft={1}>
        <Text color={colors.gray}>
          ({'\u2191\u2193 navigate, Enter select, Esc cancel'})
        </Text>
      </Box>
    </Box>
  );
}
