import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FooterStatusBar } from './FooterStatusBar.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';

describe('FooterStatusBar', () => {
  it('renders a separator line', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FooterStatusBar, {
        action: 'Test Action',
      }),
    );

    const frame = stripAnsi(lastFrame() ?? '');
    // Separator is box-drawing horizontal character
    expect(frame).toContain('\u2500');
    unmount();
  });

  it('renders action text', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FooterStatusBar, {
        action: 'New Spec',
      }),
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('New Spec');
    unmount();
  });

  it('renders phase text when provided', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FooterStatusBar, {
        action: 'New Spec',
        phase: 'Context (1/4)',
      }),
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Context (1/4)');
    unmount();
  });

  it('renders path text when provided', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FooterStatusBar, {
        action: 'New Spec',
        phase: 'Context (1/4)',
        path: 'my-feature',
      }),
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('my-feature');
    unmount();
  });
});
