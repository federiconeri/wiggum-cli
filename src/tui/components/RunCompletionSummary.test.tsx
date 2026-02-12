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
    expect(frame).toContain('completed successfully');
    unmount();
  });

  it('renders stopped state for exitCode 130 (SIGINT)', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ exitCode: 130 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Stopped');
    expect(frame).toContain('interrupted');
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
    expect(frame).toContain('exited with code 1');
    unmount();
  });

  it('displays token counts', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ tokensInput: 12345, tokensOutput: 6789 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Tokens:');
    // formatNumber abbreviates: 12345 → "12.3K", 6789 → "6.8K"
    expect(frame).toContain('in:12.3K');
    expect(frame).toContain('out:6.8K');
    unmount();
  });

  it('displays iteration count', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ iterations: 3, maxIterations: 5 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('3/5');
    unmount();
  });

  it('displays task count', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary({ tasksDone: 4, tasksTotal: 6 })} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('4/6');
    unmount();
  });

  it('renders error tail when provided', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({
          exitCode: 1,
          errorTail: 'Error: something broke\nat line 42',
        })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Last output:');
    expect(frame).toContain('something broke');
    unmount();
  });

  it('renders log path', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({ logPath: '/tmp/ralph-loop-test.log' })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('/tmp/ralph-loop-test.log');
    unmount();
  });

  it('renders branch info', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary
        summary={makeSummary({ branch: 'feat/cool-feature' })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('feat/cool-feature');
    unmount();
  });

  it('shows what\'s next section', () => {
    const { lastFrame, unmount } = render(
      <RunCompletionSummary summary={makeSummary()} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain("What's next:");
    expect(frame).toContain('Enter or Esc');
    unmount();
  });
});
