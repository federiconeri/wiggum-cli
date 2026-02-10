import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { WorkingIndicator } from './WorkingIndicator.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';

describe('WorkingIndicator', () => {
  it('renders status text when isWorking is true', () => {
    const { lastFrame, unmount } = render(
      <WorkingIndicator
        state={{ isWorking: true, status: 'Thinking...' }}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Thinking...');
    unmount();
  });

  it('renders nothing when isWorking is false', () => {
    const { lastFrame, unmount } = render(
      <WorkingIndicator
        state={{ isWorking: false, status: 'Thinking...' }}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toBe('');
    unmount();
  });

  it('renders hint text when provided', () => {
    const { lastFrame, unmount } = render(
      <WorkingIndicator
        state={{ isWorking: true, status: 'Working...', hint: 'esc to cancel' }}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('esc to cancel');
    unmount();
  });
});
