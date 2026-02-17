import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { CommandDropdown } from './CommandDropdown.js';
import { stripAnsi, renderAndWait, wait } from '../../__test-utils__/ink-helpers.js';

const DOWN_ARROW = '\u001b[B';
const UP_ARROW = '\u001b[A';

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
    // 'in' fuzzy-matches 'init' (i→i, n→n) but not 'sync' (no 'i')
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

  describe('keyboard navigation', () => {
    const SPEC_SUGGESTIONS = [
      { name: 'auth-system', description: '' },
      { name: 'user-profile', description: '' },
      { name: 'payment-flow', description: '' },
    ];

    it('Enter selects the first item by default', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <CommandDropdown
            commands={SPEC_SUGGESTIONS}
            filter=""
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        ),
      );

      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith('auth-system');
      instance.unmount();
    });

    it('Down arrow moves selection to next item, Enter selects it', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <CommandDropdown
            commands={SPEC_SUGGESTIONS}
            filter=""
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        ),
      );

      instance.stdin.write(DOWN_ARROW);
      await wait(30);
      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith('user-profile');
      instance.unmount();
    });

    it('Down then Up returns selection to first item', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <CommandDropdown
            commands={SPEC_SUGGESTIONS}
            filter=""
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        ),
      );

      instance.stdin.write(DOWN_ARROW);
      await wait(30);
      instance.stdin.write(UP_ARROW);
      await wait(30);
      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith('auth-system');
      instance.unmount();
    });

    it('Up arrow does not go below index 0', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <CommandDropdown
            commands={SPEC_SUGGESTIONS}
            filter=""
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        ),
      );

      // Press up when already at top — should stay on first item
      instance.stdin.write(UP_ARROW);
      await wait(30);
      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith('auth-system');
      instance.unmount();
    });

    it('Escape calls onCancel', async () => {
      const onCancel = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <CommandDropdown
            commands={SPEC_SUGGESTIONS}
            filter=""
            onSelect={vi.fn()}
            onCancel={onCancel}
          />
        ),
      );

      instance.stdin.write('\u001b');
      await wait(30);

      expect(onCancel).toHaveBeenCalled();
      instance.unmount();
    });
  });
});
