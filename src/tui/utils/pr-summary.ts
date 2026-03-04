/**
 * PR and Issue utilities for enhanced run summary.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * @returns PR info object, or null if no PR exists for this branch
 * @throws When gh CLI is unavailable or the command fails
 */
export function getPrForBranch(
  projectRoot: string,
  branchName: string
): PrInfo | null {
  // Use gh pr list to find PR for this branch
  const output = execFileSync(
    'gh',
    ['pr', 'list', '--head', branchName, '--state', 'all', '--json', 'number,url,state,title', '--limit', '1'],
    {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10_000,
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
}

/**
 * Extract issue number from PR body closing keywords or fallback strategies.
 */
function findIssueNumber(body: string, featureName?: string, projectRoot?: string): number | null {
  // Strategy 1: Closing keywords in PR body (Closes/Fixes/Resolves #N)
  const issueMatch = body.match(/(?:closes|fixes|resolves)\s+#(\d+)/i);
  if (issueMatch) {
    return parseInt(issueMatch[1], 10);
  }

  // Strategy 2: Bare "#N" references in the body (e.g., "Closes #7" without keyword before it)
  // Look for "# N" patterns that are likely issue references (not markdown headers)
  const hashRefMatch = body.match(/(?:^|\s)#(\d+)\b/m);
  if (hashRefMatch) {
    return parseInt(hashRefMatch[1], 10);
  }

  // Strategy 3: Read spec file for issue reference
  if (featureName && projectRoot) {
    try {
      const specPath = join(projectRoot, '.ralph', 'specs', `${featureName}.md`);
      if (existsSync(specPath)) {
        const specContent = readFileSync(specPath, 'utf-8');
        // Look for "Issue: #N", "Source Issue: #N", "GitHub Issue: #N", or issue URLs
        const specIssueMatch = specContent.match(
          /(?:issue|source|github)[:\s]*#(\d+)/i
        ) || specContent.match(
          /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/i
        );
        if (specIssueMatch) {
          return parseInt(specIssueMatch[1], 10);
        }
      }
    } catch {
      // spec read failure is non-fatal
    }
  }

  return null;
}

/**
 * Get linked issue for a branch by parsing the PR body for closing keywords
 * (Closes/Fixes/Resolves #N), with fallbacks for spec file and feature name search.
 *
 * @param projectRoot - Root directory of the git repository
 * @param branchName - Branch name to look up
 * @param prInfo - Optional pre-fetched PR info to avoid redundant gh call
 * @param featureName - Optional feature name for fallback issue detection
 * @returns Issue info object, or null if not found or gh not available
 */
export function getLinkedIssue(
  projectRoot: string,
  branchName: string,
  prInfo?: PrInfo | null,
  featureName?: string,
): IssueInfo | null {
  try {
    // Use provided PR info or fetch it
    const pr = prInfo !== undefined ? prInfo : getPrForBranch(projectRoot, branchName);
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
        timeout: 10_000,
      }
    ).trim();

    const prData = JSON.parse(prBody);
    const body = prData.body || '';

    const issueNumber = findIssueNumber(body, featureName, projectRoot);
    if (!issueNumber) {
      return null;
    }

    // Fetch the issue details
    const issueOutput = execFileSync(
      'gh',
      ['issue', 'view', String(issueNumber), '--json', 'number,url,state,title'],
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 10_000,
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
    logger.warn(`getLinkedIssue failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
