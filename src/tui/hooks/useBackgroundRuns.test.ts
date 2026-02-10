import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect, useRef } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { stripAnsi, wait } from '../../__test-utils__/ink-helpers.js';
import type { LoopStatus } from '../utils/loop-status.js';
import type { UseBackgroundRunsReturn } from './useBackgroundRuns.js';

const defaultStatus: LoopStatus = {
  running: true,
  phase: 'Implementation',
  iteration: 2,
  maxIterations: 10,
  tokensInput: 5000,
  tokensOutput: 2000,
};

const { mockReadLoopStatus } = vi.hoisted(() => ({
  mockReadLoopStatus: vi.fn<(feature: string) => LoopStatus>(),
}));

vi.mock('../utils/loop-status.js', () => ({
  readLoopStatus: mockReadLoopStatus,
}));

import { useBackgroundRuns } from './useBackgroundRuns.js';

/**
 * Wrapper component that renders hook state as text for assertions.
 * Exposes the hook API via a ref so tests can call methods imperatively.
 */
function HookHarness({ apiRef }: {
  apiRef: React.MutableRefObject<UseBackgroundRunsReturn | null>;
}) {
  const api = useBackgroundRuns();
  apiRef.current = api;

  return React.createElement(Text, null,
    `runs=${api.runs.length}|` +
    api.runs.map((r) =>
      `${r.featureName}:iter=${r.lastStatus.iteration}:done=${r.completed}`
    ).join(',')
  );
}

/** Create a ref holder that works outside React. */
function createApiRef(): React.MutableRefObject<UseBackgroundRunsReturn | null> {
  return { current: null };
}

describe('useBackgroundRuns', () => {
  beforeEach(() => {
    mockReadLoopStatus.mockReturnValue(defaultStatus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty runs', () => {
    const apiRef = createApiRef();
    const { lastFrame, unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('runs=0');
    unmount();
  });

  it('adds a run via background()', async () => {
    const apiRef = createApiRef();
    const { lastFrame, unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await wait(10);

    apiRef.current!.background('my-feature');
    await wait(10);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('runs=1');
    expect(frame).toContain('my-feature');
    expect(frame).toContain('iter=2');
    expect(frame).toContain('done=false');
    expect(mockReadLoopStatus).toHaveBeenCalledWith('my-feature');
    unmount();
  });

  it('does not add duplicate runs', async () => {
    const apiRef = createApiRef();
    const { lastFrame, unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await wait(10);

    apiRef.current!.background('my-feature');
    await wait(10);
    apiRef.current!.background('my-feature');
    await wait(10);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('runs=1');
    unmount();
  });

  it('removes a run via dismiss()', async () => {
    const apiRef = createApiRef();
    const { lastFrame, unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await wait(10);

    apiRef.current!.background('feat-a');
    await wait(10);
    apiRef.current!.background('feat-b');
    await wait(10);
    apiRef.current!.dismiss('feat-a');
    await wait(10);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('runs=1');
    expect(frame).toContain('feat-b');
    expect(frame).not.toContain('feat-a');
    unmount();
  });

  it('getRun returns the matching run', async () => {
    const apiRef = createApiRef();
    const { unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await wait(10);

    apiRef.current!.background('my-feature');
    await wait(10);

    expect(apiRef.current!.getRun('my-feature')).toBeDefined();
    expect(apiRef.current!.getRun('my-feature')!.featureName).toBe('my-feature');
    expect(apiRef.current!.getRun('nonexistent')).toBeUndefined();
    unmount();
  });

  it('polls and updates status on interval', async () => {
    vi.useFakeTimers();

    const apiRef = createApiRef();
    const { lastFrame, unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );

    // Let useEffect run
    await vi.advanceTimersByTimeAsync(50);

    apiRef.current!.background('my-feature');
    await vi.advanceTimersByTimeAsync(50);

    expect(stripAnsi(lastFrame() ?? '')).toContain('iter=2');

    // Update mock for next poll
    mockReadLoopStatus.mockReturnValue({ ...defaultStatus, iteration: 7 });

    // Advance past the poll interval
    await vi.advanceTimersByTimeAsync(5000);

    expect(stripAnsi(lastFrame() ?? '')).toContain('iter=7');
    unmount();
    vi.useRealTimers();
  });

  it('marks run as completed when process stops', async () => {
    vi.useFakeTimers();

    const apiRef = createApiRef();
    const { lastFrame, unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await vi.advanceTimersByTimeAsync(50);

    apiRef.current!.background('my-feature');
    await vi.advanceTimersByTimeAsync(50);

    expect(stripAnsi(lastFrame() ?? '')).toContain('done=false');

    // Process stops
    mockReadLoopStatus.mockReturnValue({ ...defaultStatus, running: false });
    await vi.advanceTimersByTimeAsync(5000);

    expect(stripAnsi(lastFrame() ?? '')).toContain('done=true');
    unmount();
    vi.useRealTimers();
  });

  it('clears poll timers on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const apiRef = createApiRef();
    const { unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await wait(10);

    apiRef.current!.background('feat-a');
    await wait(10);
    apiRef.current!.background('feat-b');
    await wait(10);

    unmount();

    // Cleanup effect should clear poll timers
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('clears poll timer when dismissing', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const apiRef = createApiRef();
    const { unmount } = render(
      React.createElement(HookHarness, { apiRef })
    );
    await wait(10);

    apiRef.current!.background('my-feature');
    await wait(10);
    apiRef.current!.dismiss('my-feature');
    await wait(10);

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
    unmount();
  });
});
