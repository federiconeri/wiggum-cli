import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { CommandDropdown } from './CommandDropdown.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';

const COMMANDS = [
  { name: 'init', description: 'Initialize project' },
  { name: 'sync', description: 'Sync context' },
  { name: 'new', description: 'Create spec' },
  { name: 'run', description: 'Run a spec' },
];

describe('CommandDropdown', () => {
  it('shows all commands when filter is empty', () => {
    const { lastFrame, unmount } = render(
      <CommandDropdown
        commands={COMMANDS}
        filter=""
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('init');
    expect(frame).toContain('sync');
    expect(frame).toContain('new');
    expect(frame).toContain('run');
    unmount();
  });

  it('fuzzy-filters commands by name', () => {
    const { lastFrame, unmount } = render(
      <CommandDropdown
        commands={COMMANDS}
        filter="sy"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('sync');
    expect(frame).not.toContain('init');
    unmount();
  });

  it('fuzzy match allows non-contiguous chars (e.g. in for init)', () => {
    const { lastFrame, unmount } = render(
      <CommandDropdown
        commands={COMMANDS}
        filter="in"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const frame = stripAnsi(lastFrame() ?? '');
    // 'in' matches 'init' and 'sync' (s-y-n-c: i not present)...
    // Actually 'in' fuzzy in 'init': i→i, n→n ✓; in 'sync': i not in sync → false
    expect(frame).toContain('init');
    unmount();
  });

  it('shows "No matching commands" when nothing matches', () => {
    const { lastFrame, unmount } = render(
      <CommandDropdown
        commands={COMMANDS}
        filter="zzz"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('No matching commands');
    unmount();
  });

  it('works with spec suggestions (name only, empty description)', () => {
    const specs = [
      { name: 'auth-system', description: '' },
      { name: 'user-profile', description: '' },
    ];

    const { lastFrame, unmount } = render(
      <CommandDropdown
        commands={specs}
        filter="auth"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('auth-system');
    expect(frame).not.toContain('user-profile');
    unmount();
  });

  it('fuzzy matches spec names with abbreviated query', () => {
    const specs = [
      { name: 'auth-system', description: '' },
      { name: 'user-profile', description: '' },
    ];

    const { lastFrame, unmount } = render(
      <CommandDropdown
        commands={specs}
        filter="authsys"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('auth-system');
    unmount();
  });
});
