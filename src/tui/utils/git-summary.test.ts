/**
 * Tests for git-summary utilities.
 */

import { execFileSync } from 'node:child_process';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentCommitHash, getDiffStats } from './git-summary.js';
import { logger } from '../../utils/logger.js';

vi.mock('node:child_process');
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('getCurrentCommitHash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns short commit hash on success', () => {
    vi.mocked(execFileSync).mockReturnValue('abc1234\n');

    const result = getCurrentCommitHash('/project/root');

    expect(result).toBe('abc1234');
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--short', 'HEAD'],
      {
        cwd: '/project/root',
        encoding: 'utf-8',
      }
    );
  });

  it('trims whitespace from hash', () => {
    vi.mocked(execFileSync).mockReturnValue('  abc1234  \n');

    const result = getCurrentCommitHash('/project/root');

    expect(result).toBe('abc1234');
  });

  it('returns null when git command fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const result = getCurrentCommitHash('/project/root');

    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('getCurrentCommitHash failed')
    );
  });

  it('returns null when output is empty', () => {
    vi.mocked(execFileSync).mockReturnValue('');

    const result = getCurrentCommitHash('/project/root');

    expect(result).toBeNull();
  });
});

describe('getDiffStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns diff stats for multiple files', () => {
    const mockOutput = [
      '15\t6\tsrc/file1.ts',
      '42\t12\tsrc/file2.ts',
      '3\t0\tREADME.md',
    ].join('\n');

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getDiffStats('/project/root', 'abc1234', 'def5678');

    expect(result).toEqual([
      { path: 'src/file1.ts', added: 15, removed: 6 },
      { path: 'src/file2.ts', added: 42, removed: 12 },
      { path: 'README.md', added: 3, removed: 0 },
    ]);
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--numstat', 'abc1234..def5678'],
      {
        cwd: '/project/root',
        encoding: 'utf-8',
      }
    );
  });

  it('returns empty array when no changes', () => {
    vi.mocked(execFileSync).mockReturnValue('');

    const result = getDiffStats('/project/root', 'abc1234', 'def5678');

    expect(result).toEqual([]);
  });

  it('handles binary files (shown as "-")', () => {
    const mockOutput = [
      '10\t5\tsrc/code.ts',
      '-\t-\timage.png',
    ].join('\n');

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getDiffStats('/project/root', 'abc1234', 'def5678');

    expect(result).toEqual([
      { path: 'src/code.ts', added: 10, removed: 5 },
      { path: 'image.png', added: 0, removed: 0 },
    ]);
  });

  it('skips malformed lines', () => {
    const mockOutput = [
      '10\t5\tsrc/code.ts',
      'invalid line',
      '3\t1\tsrc/other.ts',
    ].join('\n');

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getDiffStats('/project/root', 'abc1234', 'def5678');

    expect(result).toEqual([
      { path: 'src/code.ts', added: 10, removed: 5 },
      { path: 'src/other.ts', added: 3, removed: 1 },
    ]);
  });

  it('returns null when git command fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('fatal: ambiguous argument');
    });

    const result = getDiffStats('/project/root', 'invalid', 'hashes');

    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('getDiffStats failed')
    );
  });

  it('handles files with spaces in paths', () => {
    const mockOutput = '10\t5\tsrc/file with spaces.ts';

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getDiffStats('/project/root', 'abc1234', 'def5678');

    expect(result).toEqual([
      { path: 'src/file with spaces.ts', added: 10, removed: 5 },
    ]);
  });

  it('handles invalid numeric values gracefully', () => {
    const mockOutput = [
      'abc\tdef\tsrc/code.ts',
      '10\t5\tsrc/valid.ts',
    ].join('\n');

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getDiffStats('/project/root', 'abc1234', 'def5678');

    expect(result).toEqual([
      { path: 'src/code.ts', added: 0, removed: 0 },
      { path: 'src/valid.ts', added: 10, removed: 5 },
    ]);
  });
});
