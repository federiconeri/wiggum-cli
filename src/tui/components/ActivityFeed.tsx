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

export interface ActivityFeedProps {
  /** Activity events to display (newest last) */
  events: ActivityEvent[];
  /** Maximum number of events to show (default: 10) */
  maxEvents?: number;
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

export function ActivityFeed({ events, maxEvents = 10 }: ActivityFeedProps): React.ReactElement {
  const visible = events.slice(-maxEvents);

  if (visible.length === 0) {
    return (
      <Box>
        <Text dimColor>No activity yet</Text>
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
            <Text color={color}>{event.message}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
