import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { IssuePicker } from './IssuePicker.js';
import { stripAnsi, renderAndWait, wait } from '../../__test-utils__/ink-helpers.js';
import type { GitHubIssueListItem } from '../../utils/github.js';

const DOWN_ARROW = '\u001b[B';
const UP_ARROW = '\u001b[A';

const sampleIssues: GitHubIssueListItem[] = [
  { number: 42, title: 'Fix login bug', state: 'open', labels: ['bug', 'P0'] },
  { number: 41, title: 'Add dark mode', state: 'open', labels: ['enhancement'] },
  { number: 40, title: 'Update deps', state: 'open', labels: ['chore'] },
];

describe('IssuePicker', () => {
  it('renders issue list with repo name', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={sampleIssues}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('acme/api');
    expect(frame).toContain('#42');
    expect(frame).toContain('Fix login bug');
    expect(frame).toContain('#41');
    expect(frame).toContain('Add dark mode');
    unmount();
  });

  it('renders loading state', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={[]}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
      />
    );
    expect(lastFrame()!).toContain('Searching');
    unmount();
  });

  it('renders empty state', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={[]}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    expect(lastFrame()!).toContain('No open issues found');
    unmount();
  });

  it('renders error state', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={[]}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
        error="Not authenticated"
      />
    );
    expect(lastFrame()!).toContain('Not authenticated');
    unmount();
  });

  describe('keyboard navigation', () => {
    it('Enter selects the first issue by default', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <IssuePicker
            issues={sampleIssues}
            repoSlug="acme/api"
            onSelect={onSelect}
            onCancel={vi.fn()}
            isLoading={false}
          />
        ),
      );

      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith(sampleIssues[0]);
      instance.unmount();
    });

    it('Down arrow moves selection, Enter selects it', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <IssuePicker
            issues={sampleIssues}
            repoSlug="acme/api"
            onSelect={onSelect}
            onCancel={vi.fn()}
            isLoading={false}
          />
        ),
      );

      instance.stdin.write(DOWN_ARROW);
      await wait(30);
      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith(sampleIssues[1]);
      instance.unmount();
    });

    it('j/k keys navigate like arrow keys', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <IssuePicker
            issues={sampleIssues}
            repoSlug="acme/api"
            onSelect={onSelect}
            onCancel={vi.fn()}
            isLoading={false}
          />
        ),
      );

      // j = down
      instance.stdin.write('j');
      await wait(30);
      instance.stdin.write('j');
      await wait(30);
      // k = up
      instance.stdin.write('k');
      await wait(30);
      instance.stdin.write('\r');
      await wait(30);

      // j,j → index 2, k → index 1
      expect(onSelect).toHaveBeenCalledWith(sampleIssues[1]);
      instance.unmount();
    });

    it('Up arrow does not go below index 0', async () => {
      const onSelect = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <IssuePicker
            issues={sampleIssues}
            repoSlug="acme/api"
            onSelect={onSelect}
            onCancel={vi.fn()}
            isLoading={false}
          />
        ),
      );

      instance.stdin.write(UP_ARROW);
      await wait(30);
      instance.stdin.write('\r');
      await wait(30);

      expect(onSelect).toHaveBeenCalledWith(sampleIssues[0]);
      instance.unmount();
    });

    it('Escape calls onCancel', async () => {
      const onCancel = vi.fn();
      const instance = await renderAndWait(
        () => render(
          <IssuePicker
            issues={sampleIssues}
            repoSlug="acme/api"
            onSelect={vi.fn()}
            onCancel={onCancel}
            isLoading={false}
          />
        ),
      );

      instance.stdin.write('\u001b');
      await wait(30);

      expect(onCancel).toHaveBeenCalled();
      instance.unmount();
    });
  });

  it('shows labels instead of state', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={sampleIssues}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain('bug');
    expect(frame).toContain('P0');
    expect(frame).toContain('enhancement');
    unmount();
  });

  it('shows issue count in header', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={sampleIssues}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain('(3)');
    unmount();
  });

  it('truncates long titles', () => {
    const longIssue: GitHubIssueListItem[] = [
      { number: 1, title: 'A'.repeat(100), state: 'open', labels: [] },
    ];
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={longIssue}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain('\u2026');
    expect(frame).not.toContain('A'.repeat(100));
    unmount();
  });

  it('shows hint bar', () => {
    const { lastFrame, unmount } = render(
      <IssuePicker
        issues={sampleIssues}
        repoSlug="acme/api"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain('navigate');
    expect(frame).toContain('Enter');
    expect(frame).toContain('Esc');
    unmount();
  });
});
