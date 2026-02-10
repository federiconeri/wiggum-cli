import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { TipsBar } from './TipsBar.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';

describe('TipsBar', () => {
  it('renders plain text', () => {
    const { lastFrame, unmount } = render(
      <TipsBar text="Press Esc to cancel" />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Press Esc to cancel');
    unmount();
  });

  it('renders slash commands highlighted separately from surrounding text', () => {
    const { lastFrame, unmount } = render(
      <TipsBar text="Tip: /new <feature> to create spec, /help for commands" />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('/new');
    expect(frame).toContain('/help');
    expect(frame).toContain('to create spec');
    unmount();
  });

  it('handles text with no slash commands', () => {
    const { lastFrame, unmount } = render(
      <TipsBar text="No commands here" />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('No commands here');
    unmount();
  });

  it('handles multiple slash commands', () => {
    const { lastFrame, unmount } = render(
      <TipsBar text="/init to start, /new to create, /run to execute, /help for info" />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('/init');
    expect(frame).toContain('/new');
    expect(frame).toContain('/run');
    expect(frame).toContain('/help');
    unmount();
  });
});
