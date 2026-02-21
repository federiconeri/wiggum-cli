/**
 * Tests for ActivityFeed component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';

// Mock loop-status to control formatRelativeTime output
vi.mock('../utils/loop-status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/loop-status.js')>();
  return {
    ...actual,
    formatRelativeTime: vi.fn().mockReturnValue('30s ago'),
  };
});

import { ActivityFeed } from './ActivityFeed.js';
import type { ActivityEvent } from '../utils/loop-status.js';

const SUCCESS_EVENT: ActivityEvent = {
  timestamp: Date.now() - 30_000,
  message: 'Build completed',
  status: 'success',
};

const ERROR_EVENT: ActivityEvent = {
  timestamp: Date.now() - 20_000,
  message: 'Tests failed',
  status: 'error',
};

const IN_PROGRESS_EVENT: ActivityEvent = {
  timestamp: Date.now() - 10_000,
  message: 'Running tests',
  status: 'in-progress',
};

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no events', () => {
    const { lastFrame, unmount } = render(<ActivityFeed events={[]} />);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('No activity yet');
    unmount();
  });

  it('renders event messages', () => {
    const { lastFrame, unmount } = render(
      <ActivityFeed events={[SUCCESS_EVENT, ERROR_EVENT, IN_PROGRESS_EVENT]} />
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Build completed');
    expect(frame).toContain('Tests failed');
    expect(frame).toContain('Running tests');
    unmount();
  });

  it('renders relative timestamps', () => {
    const { lastFrame, unmount } = render(
      <ActivityFeed events={[SUCCESS_EVENT]} />
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('30s ago');
    unmount();
  });

  it('renders status icons', () => {
    const { lastFrame, unmount } = render(
      <ActivityFeed events={[SUCCESS_EVENT, ERROR_EVENT, IN_PROGRESS_EVENT]} />
    );
    const frame = lastFrame() ?? '';
    // ✓ success icon
    expect(frame).toContain('\u2713');
    // ✗ error icon
    expect(frame).toContain('\u2717');
    // ◐ in-progress icon
    expect(frame).toContain('\u25d0');
    unmount();
  });

  it('shows only the last 10 events when more than 10 are provided', () => {
    const manyEvents: ActivityEvent[] = Array.from({ length: 15 }, (_, i) => ({
      timestamp: Date.now() - (15 - i) * 1000,
      message: `Event ${i + 1}`,
      status: 'in-progress' as const,
    }));

    const { lastFrame, unmount } = render(<ActivityFeed events={manyEvents} />);
    const frame = stripAnsi(lastFrame() ?? '');

    // First 5 events should not be visible (trimmed)
    // Use regex to avoid "Event 1" matching inside "Event 10", "Event 11", etc.
    for (let i = 1; i <= 5; i++) {
      expect(frame).not.toMatch(new RegExp(`Event ${i}(?!\\d)`));
    }
    // Last 10 events should be visible
    for (let i = 6; i <= 15; i++) {
      expect(frame).toContain(`Event ${i}`);
    }
    unmount();
  });

  it('respects custom maxEvents prop', () => {
    const events: ActivityEvent[] = Array.from({ length: 5 }, (_, i) => ({
      timestamp: Date.now() - (5 - i) * 1000,
      message: `Event ${i + 1}`,
      status: 'in-progress' as const,
    }));

    const { lastFrame, unmount } = render(<ActivityFeed events={events} maxEvents={3} />);
    const frame = stripAnsi(lastFrame() ?? '');

    // Only last 3 events visible
    expect(frame).not.toContain('Event 1');
    expect(frame).not.toContain('Event 2');
    expect(frame).toContain('Event 3');
    expect(frame).toContain('Event 4');
    expect(frame).toContain('Event 5');
    unmount();
  });

  it('truncates long messages with ellipsis', () => {
    const longMessage = 'A'.repeat(120);
    const event: ActivityEvent = {
      timestamp: Date.now(),
      message: longMessage,
      status: 'in-progress',
    };

    const { lastFrame, unmount } = render(<ActivityFeed events={[event]} />);
    const frame = stripAnsi(lastFrame() ?? '');

    // Should NOT contain the full 120-char message
    expect(frame).not.toContain(longMessage);
    // Should contain the truncated version ending with ellipsis (…)
    expect(frame).toContain('\u2026');
    unmount();
  });

  it('does not truncate short messages', () => {
    const shortMessage = 'Build completed';
    const event: ActivityEvent = {
      timestamp: Date.now(),
      message: shortMessage,
      status: 'success',
    };

    const { lastFrame, unmount } = render(<ActivityFeed events={[event]} />);
    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toContain(shortMessage);
    expect(frame).not.toContain('\u2026');
    unmount();
  });

  it('renders commit footer when latestCommit is provided', () => {
    const { lastFrame, unmount } = render(
      <ActivityFeed events={[SUCCESS_EVENT]} latestCommit="b425c40 \u2192 6efaf80" />
    );
    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toContain('Commit:');
    expect(frame).toContain('b425c40');
    expect(frame).toContain('6efaf80');
    unmount();
  });

  it('renders commit footer in empty state', () => {
    const { lastFrame, unmount } = render(
      <ActivityFeed events={[]} latestCommit="abc1234" />
    );
    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toContain('No activity yet');
    expect(frame).toContain('Commit:');
    expect(frame).toContain('abc1234');
    unmount();
  });

  it('does not render commit footer when latestCommit is undefined', () => {
    const { lastFrame, unmount } = render(
      <ActivityFeed events={[SUCCESS_EVENT]} />
    );
    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).not.toContain('Commit:');
    unmount();
  });
});
