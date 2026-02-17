import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from './fuzzy-match.js';

describe('fuzzyMatch', () => {
  it('returns true for empty query', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true);
  });

  it('returns true for exact match', () => {
    expect(fuzzyMatch('hello', 'hello')).toBe(true);
  });

  it('returns true for partial match with chars in order', () => {
    expect(fuzzyMatch('authsys', 'auth-system')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('AUTH', 'auth-system')).toBe(true);
    expect(fuzzyMatch('auth', 'AUTH-SYSTEM')).toBe(true);
  });

  it('returns false when chars are not in order', () => {
    expect(fuzzyMatch('zyx', 'xyz')).toBe(false);
  });

  it('returns false when query has chars not in target', () => {
    expect(fuzzyMatch('abc', 'ab')).toBe(false);
  });

  it('returns false for unrelated strings', () => {
    expect(fuzzyMatch('xyz', 'auth-system')).toBe(false);
  });

  it('matches single character query', () => {
    expect(fuzzyMatch('a', 'auth-system')).toBe(true);
    expect(fuzzyMatch('z', 'auth-system')).toBe(false);
  });

  it('handles hyphenated spec names', () => {
    expect(fuzzyMatch('us', 'user-signup')).toBe(true);
    expect(fuzzyMatch('usig', 'user-signup')).toBe(true);
  });

  it('returns false when query chars cannot all be found in order', () => {
    expect(fuzzyMatch('xxxxxxxxxxx', 'auth-system')).toBe(false);
    expect(fuzzyMatch('zzz', 'auth-system')).toBe(false);
  });
});
