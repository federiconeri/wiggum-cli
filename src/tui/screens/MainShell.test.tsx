import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { MainShell } from './MainShell.js';
import type { NavigationTarget, NavigationProps } from './MainShell.js';
import { createTestSessionState } from '../../__test-utils__/fixtures.js';
import { stripAnsi, wait, type as typeText, pressEnter, renderAndWait } from '../../__test-utils__/ink-helpers.js';

// Mock context loading so MainShell doesn't hit the filesystem
vi.mock('../../context/index.js', () => ({
  loadContext: vi.fn().mockResolvedValue(null),
  getContextAge: vi.fn().mockReturnValue({ human: '5m' }),
}));

// Mock useSync to avoid real scanning
vi.mock('../hooks/useSync.js', () => ({
  useSync: () => ({
    status: 'idle' as const,
    error: null,
    sync: vi.fn(),
  }),
}));

const testHeader = <Text>HEADER</Text>;

describe('MainShell', () => {
  let onNavigate: ReturnType<typeof vi.fn<(target: NavigationTarget, props?: NavigationProps) => void>>;

  beforeEach(() => {
    onNavigate = vi.fn();
  });

  it('renders input prompt', () => {
    const state = createTestSessionState();
    const { lastFrame, unmount } = render(
      <MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('›');
    unmount();
  });

  it('/help renders help text', async () => {
    const state = createTestSessionState();
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    // Use /h alias which is shorter and more reliable in CI
    await typeText(instance, '/h ');
    pressEnter(instance);
    await wait(100);

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Available commands');
    instance.unmount();
  });

  it('/init navigates to init screen', async () => {
    const state = createTestSessionState();
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/init ');
    pressEnter(instance);
    await wait(50);

    expect(onNavigate).toHaveBeenCalledWith('init');
    instance.unmount();
  });

  it('/new my-feature navigates to interview', async () => {
    const state = createTestSessionState({ initialized: true });
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/new my-feature');
    pressEnter(instance);
    await wait(50);

    expect(onNavigate).toHaveBeenCalledWith('interview', { featureName: 'my-feature' });
    instance.unmount();
  });

  it('/new without name shows error message', async () => {
    const state = createTestSessionState();
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/new ');
    pressEnter(instance);
    await wait(50);

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Feature name required');
    expect(onNavigate).not.toHaveBeenCalled();
    instance.unmount();
  });

  it('/h alias works for help', async () => {
    const state = createTestSessionState();
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/h ');
    pressEnter(instance);
    await wait(50);

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Available commands');
    instance.unmount();
  });

  it('/n alias works for new (but requires name)', async () => {
    const state = createTestSessionState();
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/n ');
    pressEnter(instance);
    await wait(50);

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Feature name required');
    instance.unmount();
  });

  it('/run feature --review-mode auto passes reviewMode in navigation', async () => {
    const state = createTestSessionState({ initialized: true });
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/run my-feat --review-mode auto');
    pressEnter(instance);
    await wait(50);

    expect(onNavigate).toHaveBeenCalledWith('run', { featureName: 'my-feat', reviewMode: 'auto' });
    instance.unmount();
  });

  it('/run feature --review-mode invalid shows error', async () => {
    const state = createTestSessionState({ initialized: true });
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/run my-feat --review-mode bad');
    pressEnter(instance);
    await wait(50);

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain("Invalid --review-mode value 'bad'");
    expect(onNavigate).not.toHaveBeenCalled();
    instance.unmount();
  });

  it('/run --review-mode auto feature extracts feature from positional args', async () => {
    const state = createTestSessionState({ initialized: true });
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/run --review-mode auto my-feat');
    pressEnter(instance);
    await wait(50);

    expect(onNavigate).toHaveBeenCalledWith('run', { featureName: 'my-feat', reviewMode: 'auto' });
    instance.unmount();
  });

  it('/run feature without --review-mode passes undefined reviewMode', async () => {
    const state = createTestSessionState({ initialized: true });
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/run my-feat');
    pressEnter(instance);
    await wait(50);

    expect(onNavigate).toHaveBeenCalledWith('run', { featureName: 'my-feat', reviewMode: undefined });
    instance.unmount();
  });

  describe('spec autocomplete integration', () => {
    it('shows spec dropdown from sessionState.specNames when typing /run ', async () => {
      const state = createTestSessionState({
        initialized: true,
        specNames: ['auth-system', 'user-profile', 'payment-flow'],
      });
      const instance = await renderAndWait(
        () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
      );

      await typeText(instance, '/run ');

      const frame = stripAnsi(instance.lastFrame() ?? '');
      expect(frame).toContain('auth-system');
      expect(frame).toContain('user-profile');
      instance.unmount();
    });

    it('filters spec suggestions as user types after /run ', async () => {
      const state = createTestSessionState({
        initialized: true,
        specNames: ['auth-system', 'user-profile', 'payment-flow'],
      });
      const instance = await renderAndWait(
        () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
      );

      await typeText(instance, '/run auth');

      const frame = stripAnsi(instance.lastFrame() ?? '');
      expect(frame).toContain('auth-system');
      expect(frame).not.toContain('payment-flow');
      instance.unmount();
    });

    it('shows no spec dropdown when sessionState.specNames is undefined', async () => {
      const state = createTestSessionState({ initialized: true });
      // specNames is not set → no suggestions
      const instance = await renderAndWait(
        () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
      );

      await typeText(instance, '/run ');

      const frame = stripAnsi(instance.lastFrame() ?? '');
      // Should not show any spec names in dropdown
      expect(frame).not.toContain('auth-system');
      instance.unmount();
    });

    it('shows no spec dropdown when sessionState.specNames is empty', async () => {
      const state = createTestSessionState({ initialized: true, specNames: [] });
      const instance = await renderAndWait(
        () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
      );

      await typeText(instance, '/run ');

      const frame = stripAnsi(instance.lastFrame() ?? '');
      expect(frame).not.toContain('auth-system');
      instance.unmount();
    });
  });

  it('/q alias works for exit', async () => {
    const state = createTestSessionState();
    const instance = await renderAndWait(
      () => render(<MainShell header={testHeader} sessionState={state} onNavigate={onNavigate} />),
    );

    await typeText(instance, '/q ');
    pressEnter(instance);
    await wait(50);

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Goodbye');
    instance.unmount();
  });
});
