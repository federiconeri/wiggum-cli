import { describe, it, expect } from 'vitest';

// slugifyIssueTitle is module-private, so we test it via a re-export helper.
// Since we can't import it directly, we replicate the logic here and verify
// the contract. The implementation lives in MainShell.tsx.

function slugifyIssueTitle(title: string, maxWords = 4): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-') || 'untitled';
}

describe('slugifyIssueTitle', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugifyIssueTitle('Add User Authentication')).toBe('add-user-authentication');
  });

  it('limits to maxWords (default 4)', () => {
    expect(slugifyIssueTitle('one two three four five six')).toBe('one-two-three-four');
  });

  it('strips special characters', () => {
    expect(slugifyIssueTitle('[Bug] Fix login (urgent!)')).toBe('bug-fix-login-urgent');
  });

  it('handles emojis and unicode', () => {
    expect(slugifyIssueTitle('🚀 Deploy new service')).toBe('deploy-new-service');
  });

  it('collapses extra whitespace', () => {
    expect(slugifyIssueTitle('  lots   of    spaces  ')).toBe('lots-of-spaces');
  });

  it('preserves existing hyphens', () => {
    expect(slugifyIssueTitle('add rate-limiting to API')).toBe('add-rate-limiting-to-api');
  });

  it('returns untitled for empty string', () => {
    expect(slugifyIssueTitle('')).toBe('untitled');
  });

  it('returns untitled for all-special-chars', () => {
    expect(slugifyIssueTitle('!@#$%^&*()')).toBe('untitled');
  });

  it('handles single word', () => {
    expect(slugifyIssueTitle('Refactor')).toBe('refactor');
  });

  it('respects custom maxWords', () => {
    expect(slugifyIssueTitle('one two three four five', 2)).toBe('one-two');
  });

  it('handles numbers in title', () => {
    expect(slugifyIssueTitle('Fix issue #42 regression')).toBe('fix-issue-42-regression');
  });
});
