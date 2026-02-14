import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunCompletionSummary } from './RunCompletionSummary.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';
import type { RunSummary } from '../screens/RunScreen.js';

// Mock useStdout to control terminal width in tests
vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    useStdout: () => ({
      stdout: {
        columns: (process.stdout as any).columns || 100,
      },
      write: () => {},
    }),
  };
});

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

  it('renders correctly at 80 columns with full enhanced data', () => {
    // Set terminal width to standard 80 columns
    (process.stdout as any).columns = 80;

    const fullSummary = makeSummary({
      feature: 'bracketed-paste-fix',
      exitCode: 0,
      totalDurationMs: 754000, // 12m 34s
      iterationBreakdown: { total: 11, implementation: 10, resumes: 1 },
      tasks: { completed: 8, total: 8 },
      phases: [
        { id: 'planning', label: 'Planning', status: 'success', durationMs: 135000 },
        { id: 'implementation', label: 'Implementation', status: 'success', durationMs: 522000, iterations: 10 },
        { id: 'e2e', label: 'E2E Testing', status: 'skipped' },
        { id: 'verification', label: 'Verification', status: 'success', durationMs: 62000 },
        { id: 'pr', label: 'PR & Review', status: 'success', durationMs: 35000 },
      ],
      changes: {
        available: true,
        totalFilesChanged: 1,
        files: [
          { path: 'src/tui/components/ChatInput.tsx', added: 15, removed: 6 },
        ],
      },
      commits: {
        available: true,
        fromHash: 'ee387b9',
        toHash: 'fc9b18a',
        mergeType: 'squash',
      },
      pr: {
        available: true,
        created: true,
        number: 24,
        url: 'https://github.com/user/repo/pull/24',
      },
      issue: {
        available: true,
        linked: true,
        number: 22,
        status: 'Closed',
      },
    });

    const { lastFrame, unmount } = render(<RunCompletionSummary summary={fullSummary} />);

    const output = lastFrame() ?? '';
    const frame = stripAnsi(output);

    // Verify box structure is intact
    expect(output).toContain('┌');
    expect(output).toContain('└');
    expect(output).toContain('┐');
    expect(output).toContain('┘');
    expect(output).toContain('├');
    expect(output).toContain('┤');

    // Check that no line exceeds 80 columns
    const lines = output.split('\n');
    for (const line of lines) {
      const cleanLine = stripAnsi(line);
      expect(cleanLine.length).toBeLessThanOrEqual(80);
    }

    // Verify all major sections are present
    expect(frame).toContain('bracketed-paste-fix');
    expect(frame).toContain('Complete');
    expect(frame).toContain('Duration: 12m 34s');
    expect(frame).toContain('Iterations: 11 (10 impl + 1 resume)');
    expect(frame).toContain('Tasks: 8/8 completed');
    expect(frame).toContain('Phases');
    expect(frame).toContain('Planning');
    expect(frame).toContain('Implementation');
    expect(frame).toContain('Changes');
    expect(frame).toContain('1 file changed');
    expect(frame).toContain('Commit: ee387b9 → fc9b18a');
    expect(frame).toContain('PR #24');
    expect(frame).toContain('Issue #22');

    unmount();
  });
});
