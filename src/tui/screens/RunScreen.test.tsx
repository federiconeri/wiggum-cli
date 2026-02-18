/**
 * RunScreen tests — action prompt integration
 *
 * Tests focus on the action inbox integration: rendering the action prompt,
 * handling selection/cancel, and not rendering when conditions aren't met.
 *
 * The component is complex (spawns processes, polls files), so we mock all I/O
 * and use monitorOnly=true to avoid spawning child processes in tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { stripAnsi, wait } from '../../__test-utils__/ink-helpers.js';
import { createTestSessionState } from '../../__test-utils__/fixtures.js';
import type { ActionRequest } from '../utils/action-inbox.js';
import type { ActivityEvent, LoopStatus } from '../utils/loop-status.js';
import type { RunSummary } from './RunScreen.js';

// ── Hoisted mock state ────────────────────────────────────────────────────────

const {
  mockReadActionRequest,
  mockWriteActionReply,
  mockCleanupActionFiles,
  mockReadLoopStatus,
  mockParseImplementationPlan,
  mockGetGitBranch,
  mockBuildEnhancedRunSummary,
  mockWriteRunSummaryFile,
  mockLoadConfigWithDefaults,
  mockParseLoopLog,
  mockParsePhaseChanges,
} = vi.hoisted(() => ({
  mockReadActionRequest: vi.fn<(feature: string) => ActionRequest | null>(),
  mockWriteActionReply: vi.fn<() => Promise<void>>(),
  mockCleanupActionFiles: vi.fn<() => Promise<void>>(),
  mockReadLoopStatus: vi.fn<(feature: string) => LoopStatus>(),
  mockParseImplementationPlan: vi.fn<() => Promise<{ tasksDone: number; tasksPending: number; e2eDone: number; e2ePending: number }>>(),
  mockGetGitBranch: vi.fn<(root: string) => string>(),
  mockBuildEnhancedRunSummary: vi.fn<(summary: RunSummary) => RunSummary>(),
  mockWriteRunSummaryFile: vi.fn<() => Promise<void>>(),
  mockLoadConfigWithDefaults: vi.fn<() => Promise<unknown>>(),
  mockParseLoopLog: vi.fn(),
  mockParsePhaseChanges: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../utils/action-inbox.js', () => ({
  readActionRequest: mockReadActionRequest,
  writeActionReply: mockWriteActionReply,
  cleanupActionFiles: mockCleanupActionFiles,
}));

vi.mock('../utils/loop-status.js', () => ({
  readLoopStatus: mockReadLoopStatus,
  parseImplementationPlan: mockParseImplementationPlan,
  getGitBranch: mockGetGitBranch,
  getLoopLogPath: (feature: string) => `/tmp/ralph-loop-${feature}.log`,
  formatNumber: (n: number) => String(n),
  parseLoopLog: mockParseLoopLog,
  parsePhaseChanges: mockParsePhaseChanges,
  formatRelativeTime: (ts: number) => `${Math.floor((Date.now() - ts) / 1000)}s ago`,
}));

vi.mock('../utils/build-run-summary.js', () => ({
  buildEnhancedRunSummary: mockBuildEnhancedRunSummary,
}));

vi.mock('../../utils/summary-file.js', () => ({
  writeRunSummaryFile: mockWriteRunSummaryFile,
}));

vi.mock('../../utils/config.js', () => ({
  loadConfigWithDefaults: mockLoadConfigWithDefaults,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { RunScreen } from './RunScreen.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultStatus: LoopStatus = {
  running: true,
  phase: 'Implementation',
  iteration: 1,
  maxIterations: 10,
  tokensInput: 100,
  tokensOutput: 50,
};

const stoppedStatus: LoopStatus = {
  ...defaultStatus,
  running: false,
};

const defaultTasks = { tasksDone: 2, tasksPending: 1, e2eDone: 0, e2ePending: 0 };

const sampleActionRequest: ActionRequest = {
  id: 'post_pr_choice',
  prompt: 'Implementation complete. What would you like to do?',
  choices: [
    { id: 'merge_local', label: 'Merge back to main locally' },
    { id: 'push_pr', label: 'Push and create PR' },
    { id: 'keep_branch', label: 'Keep branch as-is' },
    { id: 'discard', label: 'Discard this work' },
  ],
  default: 'keep_branch',
};

const testConfig = {
  paths: { specs: '.ralph/specs', scripts: '.ralph/scripts', root: '.ralph' },
  loop: { maxIterations: 10, maxE2eAttempts: 3, reviewMode: 'manual' as const },
};

function makeProps(overrides: Partial<React.ComponentProps<typeof RunScreen>> = {}): React.ComponentProps<typeof RunScreen> {
  return {
    header: React.createElement(Text, null, 'HEADER'),
    featureName: 'my-feature',
    projectRoot: '/tmp/test-project',
    sessionState: createTestSessionState(),
    monitorOnly: true,
    onComplete: vi.fn(),
    onBackground: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RunScreen — action prompt', () => {
  beforeEach(() => {
    mockReadLoopStatus.mockReturnValue(defaultStatus);
    mockParseImplementationPlan.mockResolvedValue(defaultTasks);
    mockGetGitBranch.mockReturnValue('feat/my-feature');
    mockReadActionRequest.mockReturnValue(null);
    mockWriteActionReply.mockResolvedValue(undefined);
    mockCleanupActionFiles.mockResolvedValue(undefined);
    mockBuildEnhancedRunSummary.mockImplementation((s) => s);
    mockWriteRunSummaryFile.mockResolvedValue(undefined);
    mockLoadConfigWithDefaults.mockResolvedValue(testConfig);
    mockParseLoopLog.mockReturnValue([]);
    mockParsePhaseChanges.mockReturnValue({ events: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not render action prompt when readActionRequest returns null', async () => {
    mockReadActionRequest.mockReturnValue(null);

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    // Wait for async config load and first status refresh
    await wait(200);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain('Implementation complete');
    expect(frame).not.toContain('Merge back to main locally');
    unmount();
  });

  it('renders action prompt when readActionRequest returns a valid request', async () => {
    mockReadActionRequest.mockReturnValue(sampleActionRequest);

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    // Wait for async config load and first status refresh
    await wait(200);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Implementation complete. What would you like to do?');
    expect(frame).toContain('Merge back to main locally');
    expect(frame).toContain('Keep branch as-is');
    unmount();
  });

  it('shows "Select an option, Esc for default" tip when action request is active', async () => {
    mockReadActionRequest.mockReturnValue(sampleActionRequest);

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    await wait(200);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Select an option, Esc for default');
    unmount();
  });

  it('calls writeActionReply when Enter is pressed on the action prompt', async () => {
    mockReadActionRequest.mockReturnValue(sampleActionRequest);

    const { stdin, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    // Wait for action request to be read and rendered
    await wait(200);

    // Press Enter to select the currently highlighted option
    stdin.write('\r');
    await wait(100);

    expect(mockWriteActionReply).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ id: 'post_pr_choice' }),
    );
    unmount();
  });

  it('uses the default choice when Esc is pressed on the action prompt', async () => {
    mockReadActionRequest.mockReturnValue(sampleActionRequest);

    const { stdin, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    await wait(200);

    // Press Escape — should trigger handleActionCancel which uses the default choice
    stdin.write('\u001b');
    await wait(100);

    expect(mockWriteActionReply).toHaveBeenCalledWith(
      'my-feature',
      { id: 'post_pr_choice', choice: 'keep_branch' },
    );
    unmount();
  });

  it('does not render action prompt when completionSummary is showing', async () => {
    // Loop has stopped — in monitor mode this triggers completion summary detection
    mockReadLoopStatus.mockReturnValue(stoppedStatus);
    mockReadActionRequest.mockReturnValue(sampleActionRequest);

    const basicSummary: RunSummary = {
      feature: 'my-feature',
      iterations: 1,
      maxIterations: 10,
      tasksDone: 3,
      tasksTotal: 3,
      tokensInput: 100,
      tokensOutput: 50,
      exitCode: 0,
    };
    mockBuildEnhancedRunSummary.mockReturnValue(basicSummary);

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    // Wait for completion summary to be set (stops the loop, builds summary)
    await wait(300);

    const frame = stripAnsi(lastFrame() ?? '');
    // Completion summary takes priority — action prompt should not appear
    expect(frame).not.toContain('Implementation complete. What would you like to do?');
    unmount();
  });
});

describe('RunScreen — activity feed', () => {
  const testEvents: ActivityEvent[] = [
    { timestamp: Date.now() - 60_000, message: 'Planning phase started', status: 'in-progress' },
    { timestamp: Date.now() - 30_000, message: 'Implementation completed', status: 'success' },
    { timestamp: Date.now() - 5_000, message: 'Tests failed', status: 'error' },
  ];

  beforeEach(() => {
    mockReadLoopStatus.mockReturnValue(defaultStatus);
    mockParseImplementationPlan.mockResolvedValue(defaultTasks);
    mockGetGitBranch.mockReturnValue('feat/my-feature');
    mockReadActionRequest.mockReturnValue(null);
    mockWriteActionReply.mockResolvedValue(undefined);
    mockCleanupActionFiles.mockResolvedValue(undefined);
    mockBuildEnhancedRunSummary.mockImplementation((s) => s);
    mockWriteRunSummaryFile.mockResolvedValue(undefined);
    mockLoadConfigWithDefaults.mockResolvedValue(testConfig);
    mockParseLoopLog.mockReturnValue([]);
    mockParsePhaseChanges.mockReturnValue({ events: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows Activity section and events during an active run', async () => {
    mockParseLoopLog.mockReturnValue(testEvents);

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    await wait(200);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Activity');
    expect(frame).toContain('Planning phase started');
    expect(frame).toContain('Implementation completed');
    expect(frame).toContain('Tests failed');
    unmount();
  });

  it('shows "No activity yet" when no events are available', async () => {
    mockParseLoopLog.mockReturnValue([]);
    mockParsePhaseChanges.mockReturnValue({ events: [] });

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    await wait(200);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Activity');
    expect(frame).toContain('No activity yet');
    unmount();
  });

  it('does not show Activity section when completionSummary is showing', async () => {
    mockReadLoopStatus.mockReturnValue(stoppedStatus);
    mockParseLoopLog.mockReturnValue(testEvents);

    const basicSummary: RunSummary = {
      feature: 'my-feature',
      iterations: 1,
      maxIterations: 10,
      tasksDone: 3,
      tasksTotal: 3,
      tokensInput: 100,
      tokensOutput: 50,
      exitCode: 0,
    };
    mockBuildEnhancedRunSummary.mockReturnValue(basicSummary);

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    await wait(300);

    const frame = stripAnsi(lastFrame() ?? '');
    // Completion summary replaces the main run layout (including Activity)
    expect(frame).not.toContain('Activity');
    unmount();
  });

  it('merges events from parseLoopLog and parsePhaseChanges', async () => {
    const logEvents: ActivityEvent[] = [
      { timestamp: Date.now() - 60_000, message: 'Iteration 1 started', status: 'in-progress' },
    ];
    const phaseEvents: ActivityEvent[] = [
      { timestamp: Date.now() - 30_000, message: 'Planning phase completed', status: 'success' },
    ];
    mockParseLoopLog.mockReturnValue(logEvents);
    mockParsePhaseChanges.mockReturnValue({ events: phaseEvents });

    const { lastFrame, unmount } = render(
      React.createElement(RunScreen, makeProps()),
    );
    await wait(200);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Iteration 1 started');
    expect(frame).toContain('Planning phase completed');
    unmount();
  });
});
