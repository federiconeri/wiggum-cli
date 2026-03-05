import { execFile as execFileCb } from 'node:child_process';

/**
 * Safe command execution using execFile (no shell, array-based args).
 */
function safeExec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, { cwd, timeout: 10000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

let ghInstalledCache: boolean | null = null;

export async function isGhInstalled(): Promise<boolean> {
  if (ghInstalledCache !== null) return ghInstalledCache;
  try {
    await safeExec('gh', ['--version']);
    ghInstalledCache = true;
  } catch {
    ghInstalledCache = false;
  }
  return ghInstalledCache;
}

export function _resetGhCache(): void {
  ghInstalledCache = null;
}

export interface GitHubIssueDetail {
  title: string;
  body: string;
  labels: string[];
}

export async function fetchGitHubIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubIssueDetail | null> {
  try {
    const stdout = await safeExec('gh', [
      'issue', 'view', String(number),
      '--repo', `${owner}/${repo}`,
      '--json', 'title,body,labels',
    ]);
    const data = JSON.parse(stdout);
    return {
      title: data.title ?? '',
      body: data.body ?? '',
      labels: (data.labels ?? []).map((l: { name: string }) => l.name),
    };
  } catch {
    return null;
  }
}

export interface GitHubIssueListItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
}

export interface ListIssuesResult {
  issues: GitHubIssueListItem[];
  error?: string;
}

export async function listRepoIssues(
  owner: string,
  repo: string,
  search?: string,
  limit = 20,
): Promise<ListIssuesResult> {
  try {
    const args = [
      'issue', 'list',
      '--repo', `${owner}/${repo}`,
      '--limit', String(limit),
      '--json', 'number,title,state,labels,createdAt',
      '--state', 'open',
    ];
    if (search) {
      args.push('--search', search);
    }
    const stdout = await safeExec('gh', args);
    const data = JSON.parse(stdout);
    const issues = (data as any[]).map((item) => ({
      number: item.number,
      title: item.title,
      state: (item.state as string).toLowerCase() as 'open' | 'closed',
      labels: (item.labels ?? []).map((l: { name: string }) => l.name),
      createdAt: item.createdAt ?? '',
    }));
    return { issues };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('auth') || msg.includes('login') || msg.includes('not logged')) {
      return { issues: [], error: 'Run "gh auth login" to enable issue browsing' };
    }
    return { issues: [] };
  }
}

export async function detectGitHubRemote(
  projectRoot: string,
): Promise<GitHubRepo | null> {
  try {
    const stdout = await safeExec('git', ['remote', 'get-url', 'origin'], projectRoot);
    return parseGitHubRemote(stdout.trim());
  } catch {
    return null;
  }
}

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
