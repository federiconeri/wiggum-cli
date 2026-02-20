/**
 * ActivityFeed - Live activity feed for RunScreen
 *
 * Renders the last N activity events derived from the loop log and phase changes.
 * Each row shows a relative timestamp, a status icon, and the event message.
 * Color-coded by status: green (success), red/pink (error), yellow (in-progress).
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, phase } from '../theme.js';
import { formatRelativeTime, type ActivityEvent } from '../utils/loop-status.js';

const MAX_MESSAGE_LENGTH = 90;

export interface ActivityFeedProps {
  /** Activity events to display (newest last) */
  events: ActivityEvent[];
  /** Maximum number of events to show (default: 10) */
  maxEvents?: number;
  /** Commit range string to display as footer (e.g., "b425c40 → 6efaf80") */
  latestCommit?: string;
}

const STATUS_COLOR: Record<ActivityEvent['status'], string> = {
  success: colors.green,
  error: colors.pink,
  'in-progress': colors.yellow,
};

const STATUS_ICON: Record<ActivityEvent['status'], string> = {
  success: phase.complete,   // ✓
  error: phase.error,        // ✗
  'in-progress': phase.active, // ◐
};

function truncateMessage(message: string, maxLen: number): string {
  if (message.length <= maxLen) return message;
  return message.slice(0, maxLen - 1) + '\u2026';
}

export function ActivityFeed({ events, maxEvents = 10, latestCommit }: ActivityFeedProps): React.ReactElement {
  const visible = events.slice(-maxEvents);

  if (visible.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No activity yet</Text>
        {latestCommit && <Text dimColor>Commit: {latestCommit}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visible.map((event, idx) => {
        const color = STATUS_COLOR[event.status];
        const icon = STATUS_ICON[event.status];
        return (
          <Box key={idx} flexDirection="row" gap={1}>
            <Text dimColor>{formatRelativeTime(event.timestamp)}</Text>
            <Text color={color}>{icon}</Text>
            <Text color={color}>{truncateMessage(event.message, MAX_MESSAGE_LENGTH)}</Text>
          </Box>
        );
      })}
      {latestCommit && <Text dimColor>Commit: {latestCommit}</Text>}
    </Box>
  );
}
