import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

import { createReportingTools } from './reporting.js';

describe('createReportingTools', () => {
  const tools = createReportingTools('testowner', 'testrepo');
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('commentOnIssue', () => {
    it('posts a comment via gh CLI', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, '', '');
        return {} as any;
      });

      const result = await tools.commentOnIssue.execute(
        { issueNumber: 42, body: 'Loop completed successfully' },
        execCtx,
      );
      expect(result).toEqual({ success: true });
      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['issue', 'comment', '42', '--repo', 'testowner/testrepo']),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('returns error on failure', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error('gh auth required'), '', '');
        return {} as any;
      });

      const result = await tools.commentOnIssue.execute(
        { issueNumber: 42, body: 'test' },
        execCtx,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('gh auth required');
    });
  });

  describe('createIssue', () => {
    it('creates an issue and parses the URL', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, 'https://github.com/testowner/testrepo/issues/99\n', '');
        return {} as any;
      });

      const result = await tools.createIssue.execute(
        { title: 'Fix flaky tests', body: 'Selectors need data-testid', labels: ['tech-debt'] },
        execCtx,
      );
      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(99);
    });
  });

  describe('closeIssue', () => {
    it('closes an issue via gh CLI', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, '', '');
        return {} as any;
      });

      const result = await tools.closeIssue.execute(
        { issueNumber: 7 },
        execCtx,
      );
      expect(result).toEqual({ success: true });
      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['issue', 'close', '7', '--repo', 'testowner/testrepo'],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('passes --comment when provided', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, '', '');
        return {} as any;
      });

      const result = await tools.closeIssue.execute(
        { issueNumber: 7, comment: 'Shipped via PR #14' },
        execCtx,
      );
      expect(result).toEqual({ success: true });
      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['issue', 'close', '7', '--repo', 'testowner/testrepo', '--comment', 'Shipped via PR #14'],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('returns error on failure', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error('not found'), '', '');
        return {} as any;
      });

      const result = await tools.closeIssue.execute(
        { issueNumber: 999 },
        execCtx,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
