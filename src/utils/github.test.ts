import { describe, it, expect } from 'vitest';
import { isGitHubIssueUrl, parseGitHubRemote } from './github.js';

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
