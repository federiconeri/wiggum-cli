import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { HeaderContent } from './HeaderContent.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';
import type { SessionState } from '../../repl/session-state.js';
import type { BackgroundRun } from '../hooks/useBackgroundRuns.js';

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    projectRoot: '/test',
    config: null,
    provider: 'anthropic',
    model: 'sonnet',
    conversationMode: false,
    initialized: true,
    ...overrides,
  };
}

function makeBackgroundRun(overrides: Partial<BackgroundRun> = {}): BackgroundRun {
  return {
    featureName: 'auth-system',
    backgroundedAt: Date.now(),
    logPath: '/tmp/ralph-loop-auth-system.log',
    lastStatus: {
      running: true,
      phase: 'Implementation',
      iteration: 3,
      maxIterations: 10,
      tokensInput: 0,
      tokensOutput: 0,
    },
    completed: false,
    ...overrides,
  };
}

describe('HeaderContent', () => {
  it('renders version', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent version="1.2.3" sessionState={makeSessionState()} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('v1.2.3');
    unmount();
  });

  it('renders provider and model', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState({ provider: 'openai', model: 'gpt-4o' })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('openai/gpt-4o');
    unmount();
  });

  it('shows "not configured" when no provider', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState({ provider: null })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('not configured');
    unmount();
  });

  it('shows "Ready" when initialized', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState({ initialized: true })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Ready');
    unmount();
  });

  it('shows "Not initialized" when not initialized', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState({ initialized: false })}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Not initialized');
    unmount();
  });

  it('shows banner text (compact or full)', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState()}
        compact={true}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('WIGGUM CLI');
    unmount();
  });

  it('shows active background run indicator', () => {
    const runs: BackgroundRun[] = [makeBackgroundRun()];

    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState()}
        backgroundRuns={runs}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('auth-system');
    expect(frame).toContain('3/10');
    unmount();
  });

  it('does not show completed background runs', () => {
    const runs: BackgroundRun[] = [makeBackgroundRun({ completed: true })];

    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState()}
        backgroundRuns={runs}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain('auth-system');
    unmount();
  });

  it('shows "+N more" for multiple active background runs', () => {
    const runs: BackgroundRun[] = [
      makeBackgroundRun({ featureName: 'feature-a' }),
      makeBackgroundRun({ featureName: 'feature-b' }),
      makeBackgroundRun({ featureName: 'feature-c' }),
    ];

    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState()}
        backgroundRuns={runs}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('feature-a');
    expect(frame).toContain('+2 more');
    unmount();
  });

  it('handles empty background runs array', () => {
    const { lastFrame, unmount } = render(
      <HeaderContent
        version="0.8.0"
        sessionState={makeSessionState()}
        backgroundRuns={[]}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Ready');
    expect(frame).not.toContain('+');
    unmount();
  });
});
