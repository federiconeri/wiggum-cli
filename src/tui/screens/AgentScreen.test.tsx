import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { AgentScreen } from './AgentScreen.js';
import { stripAnsi, renderAndWait } from '../../__test-utils__/ink-helpers.js';

const testHeader = <Text>HEADER</Text>;

describe('AgentScreen', () => {
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
});
