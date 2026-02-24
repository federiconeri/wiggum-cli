export interface ParsedGitHubIssue {
  owner: string;
  repo: string;
  number: number;
}

const GITHUB_ISSUE_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?/;

export function isGitHubIssueUrl(input: string): ParsedGitHubIssue | null {
  const match = input.match(GITHUB_ISSUE_RE);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[4], 10) };
}

export interface GitHubRepo {
  owner: string;
  repo: string;
}

const SSH_REMOTE_RE = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/;
const HTTPS_REMOTE_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;

export function parseGitHubRemote(remoteUrl: string): GitHubRepo | null {
  const ssh = remoteUrl.match(SSH_REMOTE_RE);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  const https = remoteUrl.match(HTTPS_REMOTE_RE);
  if (https) return { owner: https[1], repo: https[2] };
  return null;
}
