/**
 * App component tests — runProps plumbing
 *
 * Verifies that runProps are correctly wired through AppProps → App →
 * screenProps → RunScreen when starting directly on the 'run' screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { createTestSessionState } from '../__test-utils__/fixtures.js';
import { wait } from '../__test-utils__/ink-helpers.js';
import type { RunSummary } from './screens/RunScreen.js';

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { capturedRunScreenProps, capturedAgentScreenProps, capturedHeaderProps } = vi.hoisted(() => ({
  capturedRunScreenProps: { current: null as Record<string, unknown> | null },
  capturedAgentScreenProps: { current: null as Record<string, unknown> | null },
  capturedHeaderProps: { current: null as Record<string, unknown> | null },
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock RunScreen — captures props for assertion
vi.mock('./screens/RunScreen.js', () => ({
  RunScreen: (props: Record<string, unknown>) => {
    capturedRunScreenProps.current = props;
    return React.createElement(Box, null, React.createElement(Text, null, 'RunScreen'));
  },
  type: {} as RunSummary, // satisfy re-export
}));

vi.mock('./screens/AgentScreen.js', () => ({
  AgentScreen: (props: Record<string, unknown>) => {
    capturedAgentScreenProps.current = props;
    return React.createElement(Box, null, React.createElement(Text, null, 'AgentScreen'));
  },
}));

// Mock MainShell — renders a stable marker
vi.mock('./screens/MainShell.js', () => ({
  MainShell: () => React.createElement(Box, null, React.createElement(Text, null, 'MainShell')),
}));

// Mock InterviewScreen
vi.mock('./screens/InterviewScreen.js', () => ({
  InterviewScreen: () => React.createElement(Box, null, React.createElement(Text, null, 'InterviewScreen')),
}));

// Mock InitScreen
vi.mock('./screens/InitScreen.js', () => ({
  InitScreen: () => React.createElement(Box, null, React.createElement(Text, null, 'InitScreen')),
}));

// Mock HeaderContent
vi.mock('./components/HeaderContent.js', () => ({
  HeaderContent: (props: Record<string, unknown>) => {
    capturedHeaderProps.current = props;
    return React.createElement(Text, null, 'HEADER');
  },
}));

// Mock useBackgroundRuns
vi.mock('./hooks/useBackgroundRuns.js', () => ({
  useBackgroundRuns: () => ({ runs: [], background: vi.fn(), dismiss: vi.fn() }),
}));

// Mock config and spec utilities
vi.mock('../utils/config.js', () => ({
  loadConfigWithDefaults: vi.fn().mockResolvedValue(null),
}));

vi.mock('../utils/spec-names.js', () => ({
  listSpecNames: vi.fn().mockResolvedValue([]),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { App } from './app.js';

describe('App — runProps plumbing', () => {
  beforeEach(() => {
    capturedRunScreenProps.current = null;
    capturedAgentScreenProps.current = null;
    capturedHeaderProps.current = null;
  });

  it('screen=run with runProps passes featureName and monitorOnly=true to RunScreen', async () => {
    const sessionState = createTestSessionState();

    const { unmount } = render(
      <App
        screen="run"
        initialSessionState={sessionState}
        runProps={{ featureName: 'my-feature', monitorOnly: true }}
        onExit={vi.fn()}
      />,
    );

    await wait(200);

    expect(capturedRunScreenProps.current).not.toBeNull();
    expect(capturedRunScreenProps.current?.featureName).toBe('my-feature');
    expect(capturedRunScreenProps.current?.monitorOnly).toBe(true);

    unmount();
  });

  it('screen=run with runProps and no monitorOnly passes monitorOnly=false to RunScreen', async () => {
    const sessionState = createTestSessionState();

    const { unmount } = render(
      <App
        screen="run"
        initialSessionState={sessionState}
        runProps={{ featureName: 'other-feature' }}
        onExit={vi.fn()}
      />,
    );

    await wait(200);

    expect(capturedRunScreenProps.current).not.toBeNull();
    expect(capturedRunScreenProps.current?.featureName).toBe('other-feature');
    expect(capturedRunScreenProps.current?.monitorOnly).toBe(false);

    unmount();
  });

  it('screen=run passes reviewMode, cli and reviewCli through runProps', async () => {
    const sessionState = createTestSessionState();

    const { unmount } = render(
      <App
        screen="run"
        initialSessionState={sessionState}
        runProps={{
          featureName: 'cli-routed-feature',
          reviewMode: 'merge',
          cli: 'codex',
          reviewCli: 'claude',
        }}
        onExit={vi.fn()}
      />,
    );

    await wait(200);

    expect(capturedRunScreenProps.current).not.toBeNull();
    expect(capturedRunScreenProps.current?.featureName).toBe('cli-routed-feature');
    expect(capturedRunScreenProps.current?.reviewMode).toBe('merge');
    expect(capturedRunScreenProps.current?.cli).toBe('codex');
    expect(capturedRunScreenProps.current?.reviewCli).toBe('claude');

    unmount();
  });

  it('screen=shell without runProps renders MainShell (not RunScreen)', async () => {
    const sessionState = createTestSessionState();

    const { lastFrame, unmount } = render(
      <App
        screen="shell"
        initialSessionState={sessionState}
        onExit={vi.fn()}
      />,
    );

    await wait(200);

    expect(capturedRunScreenProps.current).toBeNull();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('MainShell');

    unmount();
  });

  it('keeps the agent header provider aligned with the configured/session provider', async () => {
    const sessionState = createTestSessionState({ provider: 'anthropic', model: 'claude-sonnet-4-6' });

    const { unmount } = render(
      <App
        screen="agent"
        initialSessionState={sessionState}
        agentProps={{ modelOverride: 'gpt-5.3-codex' }}
        onExit={vi.fn()}
      />,
    );

    await wait(200);

    expect(capturedAgentScreenProps.current).not.toBeNull();
    const header = capturedAgentScreenProps.current?.header as React.ReactElement<{ providerOverride?: string; modelOverride?: string }> | undefined;
    expect(header?.props.providerOverride).toBe('anthropic');
    expect(header?.props.modelOverride).toBe('gpt-5.3-codex');

    unmount();
  });
});
