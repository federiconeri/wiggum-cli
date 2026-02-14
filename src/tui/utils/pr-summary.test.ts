/**
 * Tests for pr-summary utilities.
 */

import { execFileSync } from 'node:child_process';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPrForBranch, getLinkedIssue } from './pr-summary.js';
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

describe('getPrForBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns PR info when PR exists for branch', () => {
    const mockOutput = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Add new feature',
      },
    ]);

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getPrForBranch('/project/root', 'feat/new-feature');

    expect(result).toEqual({
      number: 42,
      url: 'https://github.com/owner/repo/pull/42',
      state: 'OPEN',
      title: 'Add new feature',
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      ['pr', 'list', '--head', 'feat/new-feature', '--json', 'number,url,state,title', '--limit', '1'],
      {
        cwd: '/project/root',
        encoding: 'utf-8',
      }
    );
  });

  it('returns null when no PR exists for branch', () => {
    vi.mocked(execFileSync).mockReturnValue('[]');

    const result = getPrForBranch('/project/root', 'feat/non-existent');

    expect(result).toBeNull();
  });

  it('returns null when gh command fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('gh not installed');
    });

    const result = getPrForBranch('/project/root', 'feat/new-feature');

    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('getPrForBranch failed')
    );
  });

  it('returns null when output is empty', () => {
    vi.mocked(execFileSync).mockReturnValue('');

    const result = getPrForBranch('/project/root', 'feat/new-feature');

    expect(result).toBeNull();
  });

  it('returns null when output is not valid JSON', () => {
    vi.mocked(execFileSync).mockReturnValue('invalid json');

    const result = getPrForBranch('/project/root', 'feat/new-feature');

    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('getPrForBranch failed')
    );
  });

  it('handles merged PR state', () => {
    const mockOutput = JSON.stringify([
      {
        number: 24,
        url: 'https://github.com/owner/repo/pull/24',
        state: 'MERGED',
        title: 'Fix bug',
      },
    ]);

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getPrForBranch('/project/root', 'fix/bug');

    expect(result).toEqual({
      number: 24,
      url: 'https://github.com/owner/repo/pull/24',
      state: 'MERGED',
      title: 'Fix bug',
    });
  });

  it('handles closed PR state', () => {
    const mockOutput = JSON.stringify([
      {
        number: 15,
        url: 'https://github.com/owner/repo/pull/15',
        state: 'CLOSED',
        title: 'Old PR',
      },
    ]);

    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const result = getPrForBranch('/project/root', 'old-branch');

    expect(result).toEqual({
      number: 15,
      url: 'https://github.com/owner/repo/pull/15',
      state: 'CLOSED',
      title: 'Old PR',
    });
  });
});

describe('getLinkedIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns issue info when PR references "Closes #N"', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Add new feature',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: 'This PR implements a new feature.\n\nCloses #123',
    });

    const mockIssue = JSON.stringify({
      number: 123,
      url: 'https://github.com/owner/repo/issues/123',
      state: 'OPEN',
      title: 'Feature request',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList) // getPrForBranch call
      .mockReturnValueOnce(mockPrBody) // pr view call
      .mockReturnValueOnce(mockIssue); // issue view call

    const result = getLinkedIssue('/project/root', 'feat/new-feature');

    expect(result).toEqual({
      number: 123,
      url: 'https://github.com/owner/repo/issues/123',
      state: 'OPEN',
      title: 'Feature request',
    });
  });

  it('returns issue info when PR references "Fixes #N"', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Bug fix',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: 'Fixes #456',
    });

    const mockIssue = JSON.stringify({
      number: 456,
      url: 'https://github.com/owner/repo/issues/456',
      state: 'CLOSED',
      title: 'Bug report',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList)
      .mockReturnValueOnce(mockPrBody)
      .mockReturnValueOnce(mockIssue);

    const result = getLinkedIssue('/project/root', 'fix/bug');

    expect(result).toEqual({
      number: 456,
      url: 'https://github.com/owner/repo/issues/456',
      state: 'CLOSED',
      title: 'Bug report',
    });
  });

  it('returns issue info when PR references "Resolves #N"', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Resolution',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: 'Resolves #789',
    });

    const mockIssue = JSON.stringify({
      number: 789,
      url: 'https://github.com/owner/repo/issues/789',
      state: 'OPEN',
      title: 'Issue',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList)
      .mockReturnValueOnce(mockPrBody)
      .mockReturnValueOnce(mockIssue);

    const result = getLinkedIssue('/project/root', 'branch');

    expect(result).toEqual({
      number: 789,
      url: 'https://github.com/owner/repo/issues/789',
      state: 'OPEN',
      title: 'Issue',
    });
  });

  it('returns null when no PR exists for branch', () => {
    vi.mocked(execFileSync).mockReturnValue('[]');

    const result = getLinkedIssue('/project/root', 'feat/non-existent');

    expect(result).toBeNull();
  });

  it('returns null when PR body has no issue reference', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'PR without issue',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: 'This PR has no issue reference',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList)
      .mockReturnValueOnce(mockPrBody);

    const result = getLinkedIssue('/project/root', 'feat/new-feature');

    expect(result).toBeNull();
  });

  it('returns null when PR body is empty', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Empty PR',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: '',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList)
      .mockReturnValueOnce(mockPrBody);

    const result = getLinkedIssue('/project/root', 'feat/new-feature');

    expect(result).toBeNull();
  });

  it('returns null when gh command fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('gh not installed');
    });

    const result = getLinkedIssue('/project/root', 'feat/new-feature');

    expect(result).toBeNull();
    // Error happens in getPrForBranch (called internally), not in getLinkedIssue
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('getPrForBranch failed')
    );
  });

  it('handles case-insensitive issue keywords', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Fix',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: 'FIXES #999',
    });

    const mockIssue = JSON.stringify({
      number: 999,
      url: 'https://github.com/owner/repo/issues/999',
      state: 'CLOSED',
      title: 'Bug',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList)
      .mockReturnValueOnce(mockPrBody)
      .mockReturnValueOnce(mockIssue);

    const result = getLinkedIssue('/project/root', 'fix/bug');

    expect(result).toEqual({
      number: 999,
      url: 'https://github.com/owner/repo/issues/999',
      state: 'CLOSED',
      title: 'Bug',
    });
  });

  it('finds first issue reference when multiple exist', () => {
    const mockPrList = JSON.stringify([
      {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        title: 'Multi-issue PR',
      },
    ]);

    const mockPrBody = JSON.stringify({
      body: 'Closes #111 and also fixes #222',
    });

    const mockIssue = JSON.stringify({
      number: 111,
      url: 'https://github.com/owner/repo/issues/111',
      state: 'OPEN',
      title: 'First issue',
    });

    vi.mocked(execFileSync)
      .mockReturnValueOnce(mockPrList)
      .mockReturnValueOnce(mockPrBody)
      .mockReturnValueOnce(mockIssue);

    const result = getLinkedIssue('/project/root', 'feat/multi');

    expect(result).toEqual({
      number: 111,
      url: 'https://github.com/owner/repo/issues/111',
      state: 'OPEN',
      title: 'First issue',
    });
  });
});
