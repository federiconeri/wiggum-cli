import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  RunCompletionSummary,
  truncatePath,
  formatChangesFiles,
} from './RunCompletionSummary.js';
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

describe('truncatePath', () => {
  it('returns path unchanged when it fits within maxWidth', () => {
    expect(truncatePath('src/index.ts', 20)).toBe('src/index.ts');
  });

  it('returns path unchanged when exactly at maxWidth', () => {
    const path = 'src/index.ts'; // 12 chars
    expect(truncatePath(path, 12)).toBe('src/index.ts');
  });

  it('truncates long path with prefix ellipsis preserving filename', () => {
    const path = 'src/tui/components/RunCompletionSummary.tsx'; // 43 chars
    const result = truncatePath(path, 20);
    expect(result).toHaveLength(20);
    expect(result.startsWith('…')).toBe(true);
    expect(result.endsWith('Summary.tsx')).toBe(true);
  });

  it('truncates deeply nested path preserving tail', () => {
    const path = 'src/very/deep/nested/dir/component/file.tsx';
    const result = truncatePath(path, 25);
    expect(result).toHaveLength(25);
    expect(result.startsWith('…')).toBe(true);
    expect(result).toContain('file.tsx');
  });

  it('returns ellipsis only when maxWidth is 1', () => {
    expect(truncatePath('any/path/here.ts', 1)).toBe('…');
  });

  it('handles single filename with no directory', () => {
    const result = truncatePath('MyComponent.tsx', 10);
    expect(result).toHaveLength(10);
    expect(result.startsWith('…')).toBe(true);
  });
});

describe('formatChangesFiles', () => {
  it('returns empty array for empty input', () => {
    expect(formatChangesFiles([], 76)).toEqual([]);
  });

  it('single file produces aligned stat columns', () => {
    const files = [{ path: 'src/index.ts', added: 10, removed: 5 }];
    const result = formatChangesFiles(files, 76);
    expect(result).toHaveLength(1);
    expect(result[0].addedStr).toBe('+10');
    expect(result[0].removedStr).toBe('-5');
    expect(result[0].displayPath).toContain('src/index.ts');
  });

  it('multiple files have consistent stat column widths', () => {
    const files = [
      { path: 'src/index.ts', added: 10, removed: 5 },
      { path: 'README.md', added: 3, removed: 1 },
    ];
    const result = formatChangesFiles(files, 76);
    // maxAddedDigits = 2 (from "10"), so both addedStr should be 3 chars (+NN)
    expect(result[0].addedStr).toBe('+10');
    expect(result[1].addedStr).toBe('+ 3');
    // maxRemovedDigits = 1, so both removedStr should be 2 chars (-N)
    expect(result[0].removedStr).toBe('-5');
    expect(result[1].removedStr).toBe('-1');
    // All displayPath values have the same length (path column width)
    expect(result[0].displayPath.length).toBe(result[1].displayPath.length);
  });

  it('truncates very long paths while stats remain visible', () => {
    const files = [
      { path: 'src/deeply/nested/component/with/very/long/path/file.tsx', added: 5, removed: 2 },
    ];
    const result = formatChangesFiles(files, 30);
    expect(result[0].displayPath.length).toBeLessThanOrEqual(30);
    // Stats should still be present
    expect(result[0].addedStr).toBe('+5');
    expect(result[0].removedStr).toBe('-2');
    // Path should be truncated with ellipsis
    expect(result[0].displayPath.trimEnd().startsWith('…')).toBe(true);
  });

  it('handles narrow content width by shrinking path column', () => {
    const files = [
      { path: 'src/index.ts', added: 100, removed: 50 },
    ];
    // Very narrow: 10 chars total
    // statsBlockWidth = (1+3) + 1 + (1+2) = 8, GAP = 2 → pathColWidth = max(1, 10-2-8) = 1
    const result = formatChangesFiles(files, 10);
    expect(result[0].displayPath).toHaveLength(1);
    expect(result[0].addedStr).toBe('+100');
    expect(result[0].removedStr).toBe('-50');
  });

  it('preserves stable ordering from input', () => {
    const files = [
      { path: 'z-last.ts', added: 1, removed: 1 },
      { path: 'a-first.ts', added: 2, removed: 2 },
    ];
    const result = formatChangesFiles(files, 76);
    expect(result[0].displayPath.trimEnd()).toContain('z-last.ts');
    expect(result[1].displayPath.trimEnd()).toContain('a-first.ts');
  });
});

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

  it('displays changes section with aligned stats columns', () => {
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
    // Stats are right-aligned: maxAdded=2 digits → "+10" and "+ 3"
    expect(frame).toContain('+10');
    expect(frame).toContain('+ 3');
    expect(frame).toContain('-5');
    expect(frame).not.toContain(' lines');
    unmount();
  });

  it('truncates long file paths with prefix ellipsis in changes section', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          changes: {
            available: true,
            totalFilesChanged: 1,
            // path is 43 chars - will be truncated in narrower path columns
            files: [
              { path: 'src/tui/components/RunCompletionSummary.tsx', added: 42, removed: 18 },
            ],
          },
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Changes');
    // Stats should always be visible
    expect(frame).toContain('+42');
    expect(frame).toContain('-18');
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

  it('renders all sections even when data is missing', () => {
    const minimalSummary = makeSummary({
      exitCode: 0,
      // No enhanced fields at all - only legacy fields
    });

    const { lastFrame, unmount } = render(<RunCompletionSummary summary={minimalSummary} />);

    const frame = stripAnsi(lastFrame() ?? '');

    // All sections should still appear with "Not available" or similar labels
    expect(frame).toContain('Duration: Not available');
    expect(frame).toContain('Iterations:');
    expect(frame).toContain('Tasks:');
    expect(frame).toContain('Phases');
    expect(frame).toContain('No phase information available');
    expect(frame).toContain('Changes');
    expect(frame).toContain('Changes: Not available');
    expect(frame).toContain('Commit: Not available');
    expect(frame).toContain('PR: Not available');
    expect(frame).toContain('Issue: Not available');

    unmount();
  });

  it('renders sections in stable order: header → timing → phases → changes → PR/issue', () => {
    const summary = makeSummary({
      exitCode: 0,
      totalDurationMs: 754000,
      phases: [
        { id: 'planning', label: 'Planning', status: 'success', durationMs: 135000 },
      ],
      changes: {
        available: true,
        totalFilesChanged: 1,
        files: [{ path: 'src/index.ts', added: 10, removed: 5 }],
      },
      pr: {
        available: true,
        created: true,
        number: 24,
        url: 'https://github.com/user/repo/pull/24',
      },
    });

    const { lastFrame, unmount } = render(<RunCompletionSummary summary={summary} />);

    const output = lastFrame() ?? '';
    const frame = stripAnsi(output);

    // Find the positions of each section to verify order
    const headerPos = frame.indexOf('my-feature');
    const durationPos = frame.indexOf('Duration:');
    const phasesPos = frame.indexOf('Phases');
    const changesPos = frame.indexOf('Changes');
    const prPos = frame.indexOf('PR #24');

    // Verify they appear in the correct order
    expect(headerPos).toBeGreaterThan(-1);
    expect(durationPos).toBeGreaterThan(headerPos);
    expect(phasesPos).toBeGreaterThan(durationPos);
    expect(changesPos).toBeGreaterThan(phasesPos);
    expect(prPos).toBeGreaterThan(changesPos);

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
    // Stats should be rendered in fixed-width right-aligned columns
    expect(frame).toContain('+15');
    expect(frame).toContain('-6');
    expect(frame).toContain('Commit: ee387b9 → fc9b18a');
    expect(frame).toContain('PR #24');
    expect(frame).toContain('Issue #22');

    unmount();
  });

  it('renders correctly at 100 columns - stats remain visible and aligned', () => {
    (process.stdout as any).columns = 100;

    const summary = makeSummary({
      changes: {
        available: true,
        totalFilesChanged: 2,
        files: [
          { path: 'src/tui/components/RunCompletionSummary.tsx', added: 42, removed: 18 },
          { path: 'README.md', added: 3, removed: 1 },
        ],
      },
    });

    const { lastFrame, unmount } = render(<RunCompletionSummary summary={summary} />);
    const output = lastFrame() ?? '';
    const frame = stripAnsi(output);

    // Stats must always be visible
    expect(frame).toContain('+42');
    expect(frame).toContain('-18');
    // Alignment: maxAdded=2 digits → README's "+3" becomes "+ 3"
    expect(frame).toContain('+ 3');

    unmount();
    (process.stdout as any).columns = undefined;
  });

  it('renders correctly at 120 columns - stats remain visible and aligned', () => {
    (process.stdout as any).columns = 120;

    const summary = makeSummary({
      changes: {
        available: true,
        totalFilesChanged: 1,
        files: [
          { path: 'src/tui/screens/RunScreen.tsx', added: 8, removed: 3 },
        ],
      },
    });

    const { lastFrame, unmount } = render(<RunCompletionSummary summary={summary} />);
    const output = lastFrame() ?? '';
    const frame = stripAnsi(output);

    expect(frame).toContain('+8');
    expect(frame).toContain('-3');
    // Box is capped at 80 columns even at 120 terminal width
    const lines = output.split('\n');
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(80);
    }

    unmount();
    (process.stdout as any).columns = undefined;
  });
});
