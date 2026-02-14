/**
 * PR and Issue utilities for enhanced run summary.
 */

import { execFileSync } from 'node:child_process';
import { logger } from '../../utils/logger.js';

export interface PrInfo {
  number: number;
  url: string;
  state: string;
  title: string;
}

export interface IssueInfo {
  number: number;
  url: string;
  state: string;
  title: string;
}

/**
 * Get PR information for a branch.
 *
 * @param projectRoot - Root directory of the git repository
 * @param branchName - Branch name to look up
 * @returns PR info object, or null if not found or gh not available
 */
export function getPrForBranch(
  projectRoot: string,
  branchName: string
): PrInfo | null {
  try {
    // Use gh pr list to find PR for this branch
    const output = execFileSync(
      'gh',
      ['pr', 'list', '--head', branchName, '--json', 'number,url,state,title', '--limit', '1'],
      {
        cwd: projectRoot,
        encoding: 'utf-8',
      }
    ).trim();

    if (!output) {
      return null;
    }

    const prs = JSON.parse(output);
    if (!Array.isArray(prs) || prs.length === 0) {
      return null;
    }

    const pr = prs[0];
    return {
      number: pr.number,
      url: pr.url,
      state: pr.state,
      title: pr.title,
    };
  } catch (err) {
    logger.debug(`getPrForBranch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Get linked issue for a branch.
 *
 * This searches for issues that mention the branch name or are linked via PR.
 *
 * @param projectRoot - Root directory of the git repository
 * @param branchName - Branch name to look up
 * @returns Issue info object, or null if not found or gh not available
 */
export function getLinkedIssue(
  projectRoot: string,
  branchName: string
): IssueInfo | null {
  try {
    // First try to get PR for this branch
    const pr = getPrForBranch(projectRoot, branchName);
    if (!pr) {
      return null;
    }

    // Get the PR body to look for issue references
    const prBody = execFileSync(
      'gh',
      ['pr', 'view', String(pr.number), '--json', 'body'],
      {
        cwd: projectRoot,
        encoding: 'utf-8',
      }
    ).trim();

    const prData = JSON.parse(prBody);
    const body = prData.body || '';

    // Look for issue references in PR body (e.g., "Closes #123", "Fixes #456")
    const issueMatch = body.match(/(?:closes|fixes|resolves)\s+#(\d+)/i);
    if (!issueMatch) {
      return null;
    }

    const issueNumber = parseInt(issueMatch[1], 10);

    // Fetch the issue details
    const issueOutput = execFileSync(
      'gh',
      ['issue', 'view', String(issueNumber), '--json', 'number,url,state,title'],
      {
        cwd: projectRoot,
        encoding: 'utf-8',
      }
    ).trim();

    const issue = JSON.parse(issueOutput);
    return {
      number: issue.number,
      url: issue.url,
      state: issue.state,
      title: issue.title,
    };
  } catch (err) {
    logger.debug(`getLinkedIssue failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
