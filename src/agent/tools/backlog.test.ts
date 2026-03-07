import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockListRepoIssues, mockFetchGitHubIssue } = vi.hoisted(() => ({
  mockListRepoIssues: vi.fn(),
  mockFetchGitHubIssue: vi.fn(),
}));

vi.mock('../../utils/github.js', () => ({
  listRepoIssues: mockListRepoIssues,
  fetchGitHubIssue: mockFetchGitHubIssue,
}));

import { createBacklogTools } from './backlog.js';

describe('createBacklogTools', () => {
  const tools = createBacklogTools('testowner', 'testrepo');
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listIssues', () => {
    it('calls listRepoIssues and returns issues', async () => {
      mockListRepoIssues.mockResolvedValue({
        issues: [
          { number: 1, title: 'Bug fix', state: 'open', labels: ['bug'], createdAt: '2026-01-01T00:00:00Z' },
          { number: 2, title: 'Feature', state: 'open', labels: ['feature'], createdAt: '2026-01-02T00:00:00Z' },
        ],
      });

      const result = await tools.listIssues.execute(
        { limit: 20 },
        execCtx,
      );
      expect(result).toHaveProperty('issues');
      expect(result.issues).toHaveLength(2);
      expect(mockListRepoIssues).toHaveBeenCalledWith('testowner', 'testrepo', undefined, 20);
    });

    it('filters by labels when provided', async () => {
      mockListRepoIssues.mockResolvedValue({
        issues: [{ number: 1, title: 'Bug', state: 'open', labels: ['bug'], createdAt: '2026-01-01T00:00:00Z' }],
      });

      await tools.listIssues.execute({ labels: ['bug'], limit: 10 }, execCtx);
      expect(mockListRepoIssues).toHaveBeenCalledWith(
        'testowner', 'testrepo',
        expect.stringContaining('label:bug'),
        10,
      );
    });

    it('merges default labels with agent-provided labels', async () => {
      const scopedTools = createBacklogTools('testowner', 'testrepo', { defaultLabels: ['P0'] });
      mockListRepoIssues.mockResolvedValue({ issues: [] });

      await scopedTools.listIssues.execute({ labels: ['bug'], limit: 10 }, execCtx);
      const search = mockListRepoIssues.mock.calls[0][2] as string;
      expect(search).toContain('label:P0');
      expect(search).toContain('label:bug');
    });

    it('deduplicates labels when default and agent overlap', async () => {
      const scopedTools = createBacklogTools('testowner', 'testrepo', { defaultLabels: ['bug'] });
      mockListRepoIssues.mockResolvedValue({ issues: [] });

      await scopedTools.listIssues.execute({ labels: ['bug'], limit: 10 }, execCtx);
      const search = mockListRepoIssues.mock.calls[0][2] as string;
      // Should appear only once
      expect(search.match(/label:bug/g)).toHaveLength(1);
    });

    it('returns issues sorted by number ascending', async () => {
      mockListRepoIssues.mockResolvedValue({
        issues: [
          { number: 5, title: 'Feature C', state: 'open', labels: [], createdAt: '2026-01-05T00:00:00Z' },
          { number: 1, title: 'Scaffolding', state: 'open', labels: [], createdAt: '2026-01-01T00:00:00Z' },
          { number: 3, title: 'Feature A', state: 'open', labels: [], createdAt: '2026-01-03T00:00:00Z' },
        ],
      });

      const result = await tools.listIssues.execute({ limit: 20 }, execCtx);
      expect(result.issues.map((i: any) => i.number)).toEqual([1, 3, 5]);
    });

    it('applies default labels when agent provides none', async () => {
      const scopedTools = createBacklogTools('testowner', 'testrepo', { defaultLabels: ['P0', 'P1'] });
      mockListRepoIssues.mockResolvedValue({ issues: [] });

      await scopedTools.listIssues.execute({ limit: 10 }, execCtx);
      const search = mockListRepoIssues.mock.calls[0][2] as string;
      expect(search).toContain('label:P0');
      expect(search).toContain('label:P1');
    });
  });

  describe('readIssue', () => {
    it('fetches full issue details', async () => {
      mockFetchGitHubIssue.mockResolvedValue({
        title: 'Fix login',
        body: 'Login is broken',
        labels: ['bug'],
      });

      const result = await tools.readIssue.execute({ issueNumber: 42 }, execCtx);
      expect(result).toEqual({
        title: 'Fix login',
        body: 'Login is broken',
        labels: ['bug'],
        dependsOn: [],
      });
      expect(mockFetchGitHubIssue).toHaveBeenCalledWith('testowner', 'testrepo', 42);
    });

    it('extracts dependency hints from issue body', async () => {
      mockFetchGitHubIssue.mockResolvedValue({
        title: 'Add config module',
        body: 'Implement config handling.\n\nDepends on #1\nBlocked by #3',
        labels: ['feature'],
      });

      const result = await tools.readIssue.execute({ issueNumber: 2 }, execCtx);
      expect(result.dependsOn).toEqual([1, 3]);
    });

    it('returns empty dependsOn when no dependency hints in body', async () => {
      mockFetchGitHubIssue.mockResolvedValue({
        title: 'Simple fix',
        body: 'Just a fix',
        labels: ['bug'],
      });

      const result = await tools.readIssue.execute({ issueNumber: 5 }, execCtx);
      expect(result.dependsOn).toEqual([]);
    });

    it('returns error when issue not found', async () => {
      mockFetchGitHubIssue.mockResolvedValue(null);

      const result = await tools.readIssue.execute({ issueNumber: 999 }, execCtx);
      expect(result).toHaveProperty('error');
    });
  });
});
