import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { WelcomeScreen } from './WelcomeScreen.js';
import { stripAnsi, wait } from '../../__test-utils__/ink-helpers.js';

describe('WelcomeScreen', () => {
  it('renders version', () => {
    const onContinue = vi.fn();
    const { lastFrame, unmount } = render(
      <WelcomeScreen
        provider="anthropic"
        model="sonnet"
        version="1.2.3"
        isInitialized={true}
        onContinue={onContinue}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('v1.2.3');
    unmount();
  });

  it('renders provider and model', () => {
    const onContinue = vi.fn();
    const { lastFrame, unmount } = render(
      <WelcomeScreen
        provider="anthropic"
        model="sonnet"
        version="1.0.0"
        isInitialized={true}
        onContinue={onContinue}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('anthropic/sonnet');
    unmount();
  });

  it('shows "Ready" when initialized', () => {
    const onContinue = vi.fn();
    const { lastFrame, unmount } = render(
      <WelcomeScreen
        provider="anthropic"
        model="sonnet"
        version="1.0.0"
        isInitialized={true}
        onContinue={onContinue}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Ready');
    unmount();
  });

  it('shows "Not initialized" when not initialized', () => {
    const onContinue = vi.fn();
    const { lastFrame, unmount } = render(
      <WelcomeScreen
        provider={null}
        model="sonnet"
        version="1.0.0"
        isInitialized={false}
        onContinue={onContinue}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Not initialized');
    unmount();
  });

  it('shows "not configured" when provider is null', () => {
    const onContinue = vi.fn();
    const { lastFrame, unmount } = render(
      <WelcomeScreen
        provider={null}
        model="sonnet"
        version="1.0.0"
        isInitialized={false}
        onContinue={onContinue}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('not configured');
    unmount();
  });

  it('calls onContinue after mount', async () => {
    const onContinue = vi.fn();
    const { unmount } = render(
      <WelcomeScreen
        provider="anthropic"
        model="sonnet"
        version="1.0.0"
        isInitialized={true}
        onContinue={onContinue}
      />,
    );

    // setImmediate fires after render
    await wait(50);
    expect(onContinue).toHaveBeenCalled();
    unmount();
  });
});
