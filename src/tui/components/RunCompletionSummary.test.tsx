import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunCompletionSummary } from './RunCompletionSummary.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';
import type { RunSummary } from '../screens/RunScreen.js';

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    feature: 'my-feature',
    iterations: 3,
    maxIterations: 5,
    tasksDone: 4,
    tasksTotal: 6,
    tokensInput: 10000,
    tokensOutput: 5000,
    exitCode: 0,
    branch: 'feat/my-feature',
    logPath: '/tmp/ralph-loop-my-feature.log',
    ...overrides,
  };
}

describe('RunCompletionSummary', () => {
  it('renders success state for exitCode 0', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ exitCode: 0 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Complete');
    expect(frame).toContain('my-feature');
    unmount();
  });

  it('renders stopped state for exitCode 130 (SIGINT)', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ exitCode: 130 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Stopped');
    unmount();
  });

  it('renders stopped state for exitCode 143 (SIGTERM)', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ exitCode: 143 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Stopped');
    unmount();
  });

  it('renders failed state for other exit codes', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ exitCode: 1 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Failed');
    unmount();
  });

  it('displays iteration count with legacy data', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ iterations: 3, maxIterations: 5 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Iterations: 3');
    unmount();
  });

  it('displays task count with legacy data', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ tasksDone: 4, tasksTotal: 6 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Tasks: 4/6 completed');
    unmount();
  });

  it('displays enhanced iteration breakdown when available', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          iterationBreakdown: { total: 11, implementation: 10, resumes: 1 },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Iterations: 11 (10 impl + 1 resume)');
    unmount();
  });

  it('displays duration when available', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          totalDurationMs: 754000, // 12m 34s
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Duration: 12m 34s');
    unmount();
  });

  it('displays phases section when available', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          phases: [
            { id: 'planning', label: 'Planning', status: 'success', durationMs: 135000 },
            { id: 'implementation', label: 'Implementation', status: 'success', durationMs: 522000, iterations: 10 },
            { id: 'e2e', label: 'E2E Testing', status: 'skipped' },
          ],
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Phases');
    expect(frame).toContain('Planning 2m 15s');
    expect(frame).toContain('Implementation 8m 42s (10 iterations)');
    expect(frame).toContain('E2E Testing');
    expect(frame).toContain('skipped');
    unmount();
  });

  it('displays changes section when available', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          changes: {
            available: true,
            totalFilesChanged: 2,
            files: [
              { path: 'src/index.ts', added: 10, removed: 5 },
              { path: 'README.md', added: 3, removed: 1 },
            ],
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Changes');
    expect(frame).toContain('2 files changed');
    expect(frame).toContain('src/index.ts');
    expect(frame).toContain('+10');
    expect(frame).toContain('-5');
    unmount();
  });

  it('displays "No changes" when available but empty', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          changes: {
            available: true,
            totalFilesChanged: 0,
            files: [],
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('No changes');
    unmount();
  });

  it('displays "Not available" when changes unavailable', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          changes: {
            available: false,
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Changes: Not available');
    unmount();
  });

  it('displays commit information when available', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          changes: {
            available: true,
            totalFilesChanged: 1,
            files: [{ path: 'src/index.ts', added: 10, removed: 5 }],
          },
          commits: {
            available: true,
            fromHash: 'abc1234',
            toHash: 'def5678',
            mergeType: 'squash',
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Commit: abc1234 → def5678');
    expect(frame).toContain('squash-merged');
    unmount();
  });

  it('displays PR information when created', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          pr: {
            available: true,
            created: true,
            number: 24,
            url: 'https://github.com/user/repo/pull/24',
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('PR #24');
    expect(frame).toContain('github.com/user/repo/pull/24');
    unmount();
  });

  it('displays "Not created" when PR not created', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          pr: {
            available: true,
            created: false,
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('PR: Not created');
    unmount();
  });

  it('displays issue information when linked', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          issue: {
            available: true,
            linked: true,
            number: 22,
            status: 'Closed',
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Issue #22: Closed');
    unmount();
  });

  it('displays "Not linked" when issue not linked', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          issue: {
            available: true,
            linked: false,
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Issue: Not linked');
    unmount();
  });
});
