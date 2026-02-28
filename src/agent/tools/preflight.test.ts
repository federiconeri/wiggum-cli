import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFile, mockExistsSync } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockExistsSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

import { runPreflightChecks } from './preflight.js';

// Helper: make mockExecFile resolve/reject based on arguments
function setupExecFile(responses: Record<string, { stdout?: string; error?: Error }>) {
  mockExecFile.mockImplementation(
    (cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      // promisify calls with (cmd, args, opts) and returns a promise — node:util wraps it
      // But since we mock execFile directly, promisify will call it with a callback as the last arg
      const key = `${cmd} ${args.join(' ')}`;
      const match = Object.entries(responses).find(([pattern]) => key.includes(pattern));

      if (cb) {
        if (match && match[1].error) {
          cb(match[1].error, { stdout: '', stderr: '' });
        } else if (match) {
          cb(null, { stdout: match[1].stdout ?? '', stderr: '' });
        } else {
          cb(new Error(`Unexpected command: ${key}`), { stdout: '', stderr: '' });
        }
      }
    },
  );
}

describe('runPreflightChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('detects default branch via symbolic-ref', async () => {
    setupExecFile({
      'symbolic-ref': { stdout: 'origin/main\n' },
      'worktree prune': { stdout: '' },
      'worktree list': { stdout: '' },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result).toEqual({ ok: true, defaultBranch: 'main' });
  });

  it('falls back to main when symbolic-ref fails', async () => {
    setupExecFile({
      'symbolic-ref': { error: new Error('not set') },
      'rev-parse --verify main': { stdout: 'abc123\n' },
      'worktree prune': { stdout: '' },
      'worktree list': { stdout: '' },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result).toEqual({ ok: true, defaultBranch: 'main' });
  });

  it('falls back to master when main does not exist', async () => {
    setupExecFile({
      'symbolic-ref': { error: new Error('not set') },
      'rev-parse --verify main': { error: new Error('not found') },
      'rev-parse --verify master': { stdout: 'abc123\n' },
      'worktree prune': { stdout: '' },
      'worktree list': { stdout: '' },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result).toEqual({ ok: true, defaultBranch: 'master' });
  });

  it('returns error when no default branch exists', async () => {
    setupExecFile({
      'symbolic-ref': { error: new Error('not set') },
      'rev-parse --verify main': { error: new Error('not found') },
      'rev-parse --verify master': { error: new Error('not found') },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot determine default branch');
  });

  it('auto-removes stale worktree when directory is missing', async () => {
    mockExistsSync.mockReturnValue(false); // directory doesn't exist

    setupExecFile({
      'symbolic-ref': { stdout: 'origin/main\n' },
      'worktree prune': { stdout: '' },
      'worktree list': {
        stdout: [
          'worktree /fake/root',
          'HEAD abc123',
          'branch refs/heads/main',
          '',
          'worktree /tmp/stale-wt',
          'HEAD def456',
          'branch refs/heads/feat/my-feature',
          '',
        ].join('\n'),
      },
      'worktree remove': { stdout: '' },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result.ok).toBe(true);
    expect(result.defaultBranch).toBe('main');

    // Verify worktree remove was called
    const removeCall = mockExecFile.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('remove'),
    );
    expect(removeCall).toBeDefined();
  });

  it('returns error when branch is locked by active worktree', async () => {
    mockExistsSync.mockReturnValue(true); // directory exists → active worktree

    setupExecFile({
      'symbolic-ref': { stdout: 'origin/main\n' },
      'worktree prune': { stdout: '' },
      'worktree list': {
        stdout: [
          'worktree /fake/root',
          'HEAD abc123',
          'branch refs/heads/main',
          '',
          'worktree /tmp/active-wt',
          'HEAD def456',
          'branch refs/heads/feat/my-feature',
          '',
        ].join('\n'),
      },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Branch locked by active worktree');
    expect(result.error).toContain('/tmp/active-wt');
  });

  it('worktree prune failure is non-fatal', async () => {
    setupExecFile({
      'symbolic-ref': { stdout: 'origin/main\n' },
      'worktree prune': { error: new Error('prune failed') },
      'worktree list': { stdout: '' },
    });

    const result = await runPreflightChecks('/fake/root', 'my-feature');
    expect(result.ok).toBe(true);
  });

  it('emits progress during preflight', async () => {
    const emitProgress = vi.fn();

    setupExecFile({
      'symbolic-ref': { stdout: 'origin/develop\n' },
      'worktree prune': { stdout: '' },
      'worktree list': { stdout: '' },
    });

    await runPreflightChecks('/fake/root', 'my-feature', emitProgress);
    expect(emitProgress).toHaveBeenCalledWith('preflight', 'Default branch: develop');
  });
});
