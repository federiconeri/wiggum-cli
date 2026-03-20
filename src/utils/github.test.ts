import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isGitHubIssueUrl, parseGitHubRemote, isGhInstalled, fetchGitHubIssue, listRepoIssues, detectGitHubRemote, _resetGhCache } from './github.js';

// Mock node:child_process execFile (safe, no shell)
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
const mockExecFile = vi.mocked(execFile);

// Helper to make execFile resolve with stdout
function mockExecFileResult(stdout: string) {
  mockExecFile.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1];
    cb(null, stdout, '');
    return {} as any;
  });
}

function mockExecFileError(message: string) {
  mockExecFile.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1];
    cb(new Error(message), '', '');
    return {} as any;
  });
}

describe('isGitHubIssueUrl', () => {
  it('parses a standard issue URL', () => {
    const result = isGitHubIssueUrl('https://github.com/acme/api/issues/42');
    expect(result).toEqual({ owner: 'acme', repo: 'api', number: 42 });
  });

  it('parses a pull request URL', () => {
    const result = isGitHubIssueUrl('https://github.com/acme/api/pull/7');
    expect(result).toEqual({ owner: 'acme', repo: 'api', number: 7 });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(isGitHubIssueUrl('https://gitlab.com/acme/api/issues/1')).toBeNull();
  });

  it('returns null for GitHub URLs without issue number', () => {
    expect(isGitHubIssueUrl('https://github.com/acme/api')).toBeNull();
  });

  it('returns null for non-URL strings', () => {
    expect(isGitHubIssueUrl('not a url')).toBeNull();
  });

  it('handles trailing slashes and fragments', () => {
    const result = isGitHubIssueUrl('https://github.com/acme/api/issues/42/');
    expect(result).toEqual({ owner: 'acme', repo: 'api', number: 42 });
  });
});

describe('parseGitHubRemote', () => {
  it('parses SSH remote', () => {
    expect(parseGitHubRemote('git@github.com:acme/api.git')).toEqual({ owner: 'acme', repo: 'api' });
  });

  it('parses HTTPS remote', () => {
    expect(parseGitHubRemote('https://github.com/acme/api.git')).toEqual({ owner: 'acme', repo: 'api' });
  });

  it('parses HTTPS remote without .git', () => {
    expect(parseGitHubRemote('https://github.com/acme/api')).toEqual({ owner: 'acme', repo: 'api' });
  });

  it('returns null for non-GitHub remotes', () => {
    expect(parseGitHubRemote('https://gitlab.com/acme/api.git')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGitHubRemote('')).toBeNull();
  });
});

describe('isGhInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetGhCache();
  });

  it('returns true when gh is available', async () => {
    mockExecFileResult('gh version 2.40.0');
    expect(await isGhInstalled()).toBe(true);
  });

  it('returns false when gh is not found', async () => {
    mockExecFileError('ENOENT');
    expect(await isGhInstalled()).toBe(false);
  });
});

describe('fetchGitHubIssue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns title and body from gh issue view', async () => {
    mockExecFileResult(JSON.stringify({
      number: 42,
      title: 'Fix login bug',
      body: 'The login form breaks on mobile.',
      labels: [{ name: 'bug' }],
      state: 'OPEN',
      createdAt: '2026-01-01T00:00:00Z',
    }));
    const result = await fetchGitHubIssue('acme', 'api', 42);
    expect(result).toEqual({
      number: 42,
      title: 'Fix login bug',
      body: 'The login form breaks on mobile.',
      labels: ['bug'],
      state: 'open',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns null on gh failure', async () => {
    mockExecFileError('not authenticated');
    expect(await fetchGitHubIssue('acme', 'api', 42)).toBeNull();
  });
});

describe('listRepoIssues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns issue list from gh issue list', async () => {
    mockExecFileResult(JSON.stringify([
      { number: 42, title: 'Fix bug', state: 'OPEN', labels: [{ name: 'bug' }], createdAt: '2026-01-01T00:00:00Z' },
      { number: 41, title: 'Add feature', state: 'OPEN', labels: [], createdAt: '2026-01-02T00:00:00Z' },
    ]));
    const result = await listRepoIssues('acme', 'api');
    expect(result.issues).toEqual([
      { number: 42, title: 'Fix bug', state: 'open', labels: ['bug'], createdAt: '2026-01-01T00:00:00Z' },
      { number: 41, title: 'Add feature', state: 'open', labels: [], createdAt: '2026-01-02T00:00:00Z' },
    ]);
  });

  it('passes --state open to gh', async () => {
    mockExecFileResult('[]');
    await listRepoIssues('acme', 'api');
    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('--state');
    expect(args).toContain('open');
  });

  it('passes search query to gh', async () => {
    mockExecFileResult('[]');
    await listRepoIssues('acme', 'api', 'auth');
    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('auth');
  });

  it('returns empty array on failure', async () => {
    mockExecFileError('network error');
    const result = await listRepoIssues('acme', 'api');
    expect(result.issues).toEqual([]);
  });

  it('returns auth error message when not authenticated', async () => {
    mockExecFileError('gh: not logged into any github.com account');
    const result = await listRepoIssues('acme', 'api');
    expect(result.issues).toEqual([]);
    expect(result.error).toContain('gh auth login');
  });
});

describe('detectGitHubRemote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses owner/repo from git remote output', async () => {
    mockExecFileResult('git@github.com:acme/api.git\n');
    const result = await detectGitHubRemote('/my/project');
    expect(result).toEqual({ owner: 'acme', repo: 'api' });
  });

  it('returns null when not a git repo', async () => {
    mockExecFileError('not a git repository');
    expect(await detectGitHubRemote('/my/project')).toBeNull();
  });
});
