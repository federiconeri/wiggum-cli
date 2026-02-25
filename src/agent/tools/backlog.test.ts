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
          { number: 1, title: 'Bug fix', state: 'open', labels: ['bug'] },
          { number: 2, title: 'Feature', state: 'open', labels: ['feature'] },
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
        issues: [{ number: 1, title: 'Bug', state: 'open', labels: ['bug'] }],
      });

      await tools.listIssues.execute({ labels: ['bug'], limit: 10 }, execCtx);
      expect(mockListRepoIssues).toHaveBeenCalledWith(
        'testowner', 'testrepo',
        expect.stringContaining('label:bug'),
        10,
      );
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
      });
      expect(mockFetchGitHubIssue).toHaveBeenCalledWith('testowner', 'testrepo', 42);
    });

    it('returns error when issue not found', async () => {
      mockFetchGitHubIssue.mockResolvedValue(null);

      const result = await tools.readIssue.execute({ issueNumber: 999 }, execCtx);
      expect(result).toHaveProperty('error');
    });
  });
});
