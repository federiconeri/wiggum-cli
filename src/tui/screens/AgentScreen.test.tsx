import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { AgentScreen } from './AgentScreen.js';
import { stripAnsi, renderAndWait } from '../../__test-utils__/ink-helpers.js';

const { mockUseAgentOrchestrator } = vi.hoisted(() => ({
  mockUseAgentOrchestrator: vi.fn(),
}));

vi.mock('../hooks/useAgentOrchestrator.js', () => ({
  useAgentOrchestrator: mockUseAgentOrchestrator,
}));

const testHeader = <Text>HEADER</Text>;

describe('AgentScreen', () => {
  beforeEach(() => {
    mockUseAgentOrchestrator.mockReturnValue({
      status: 'idle',
      activeIssue: null,
      queue: [],
      completed: [],
      logEntries: [],
      loopMonitor: null,
      error: null,
      abort: vi.fn(),
    });
  });

  it('renders with header and default idle state', () => {
    const { lastFrame, unmount } = render(
      <AgentScreen header={testHeader} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Active Issue');
    expect(frame).toContain('No active issue');
    expect(frame).toContain('Queue');
    expect(frame).toContain('Agent Log');
    unmount();
  });

  it('renders empty queue and completed sections', () => {
    const { lastFrame, unmount } = render(
      <AgentScreen header={testHeader} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Empty');
    expect(frame).toContain('None yet');
    expect(frame).toContain('Waiting for agent activity');
    unmount();
  });

  it('calls onExit when q is pressed', async () => {
    const onExit = vi.fn();
    const instance = await renderAndWait(
      () => render(<AgentScreen header={testHeader} onExit={onExit} />),
    );

    instance.stdin.write('q');
    expect(onExit).toHaveBeenCalled();
    instance.unmount();
  });

  it('calls onExit when Escape is pressed', async () => {
    const onExit = vi.fn();
    const instance = await renderAndWait(
      () => render(<AgentScreen header={testHeader} onExit={onExit} />),
    );

    instance.stdin.write('\x1B');
    expect(onExit).toHaveBeenCalled();
    instance.unmount();
  });

  it('shows tips bar with keyboard hints', () => {
    const { lastFrame, unmount } = render(
      <AgentScreen header={testHeader} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('q exit');
    unmount();
  });

  it('does not render dependency origin text when requestedBy is missing', () => {
    mockUseAgentOrchestrator.mockReturnValue({
      status: 'running',
      activeIssue: null,
      queue: [
        {
          issueNumber: 69,
          title: 'Build LoopOrchestrator runtime',
          labels: ['loop'],
          phase: 'idle',
          scopeOrigin: 'dependency',
          requestedBy: undefined,
          actionability: 'ready',
          recommendation: 'generate_plan',
          inferredDependsOn: [{ issueNumber: 17, confidence: 'medium' }],
        },
      ],
      completed: [],
      logEntries: [],
      loopMonitor: null,
      error: null,
      abort: vi.fn(),
    });

    const { lastFrame, unmount } = render(
      <AgentScreen header={testHeader} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain('dependency for undefined');
    expect(frame).toContain('ready');
    expect(frame).toContain('generate_plan');
    unmount();
  });
});
