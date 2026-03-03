import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FEATURE_NAME_SCHEMA } from './schemas.js';

const execFileAsync = promisify(execFile);

export type Recommendation =
  | 'start_fresh'
  | 'generate_plan'
  | 'resume_implementation'
  | 'resume_pr_phase'
  | 'pr_exists_open'
  | 'pr_merged'
  | 'pr_closed'
  | 'linked_pr_merged'
  | 'linked_pr_open';

export interface FeatureState {
  featureName: string;
  branch: {
    exists: boolean;
    commitsAhead: number;
  };
  spec: {
    exists: boolean;
    path?: string;
  };
  plan: {
    exists: boolean;
    path?: string;
    totalTasks: number;
    completedTasks: number;
    completionPercent: number;
  };
  pr: {
    exists: boolean;
    state?: 'OPEN' | 'MERGED' | 'CLOSED';
    number?: number;
    url?: string;
  };
  linkedPr: {
    exists: boolean;
    state?: 'OPEN' | 'MERGED' | 'CLOSED';
    number?: number;
    url?: string;
    headRefName?: string;
  };
  loopStatus: {
    hasStatusFiles: boolean;
  };
  recommendation: Recommendation;
}

function computeRecommendation(state: Omit<FeatureState, 'recommendation'>): Recommendation {
  // PR state takes priority
  if (state.pr.exists) {
    if (state.pr.state === 'MERGED') return 'pr_merged';
    if (state.pr.state === 'CLOSED') return 'pr_closed';
    if (state.pr.state === 'OPEN') return 'pr_exists_open';
  }

  // Linked PR (found via issue search, different branch name)
  if (state.linkedPr.exists) {
    if (state.linkedPr.state === 'MERGED') return 'linked_pr_merged';
    if (state.linkedPr.state === 'OPEN') return 'linked_pr_open';
  }

  // Plan with all tasks done but no PR → resume to PR phase
  if (state.plan.exists && state.plan.totalTasks > 0 && state.plan.completedTasks === state.plan.totalTasks) {
    return 'resume_pr_phase';
  }

  // Plan with pending tasks → resume implementation
  if (state.plan.exists && state.plan.totalTasks > 0 && state.plan.completedTasks < state.plan.totalTasks) {
    return 'resume_implementation';
  }

  // Spec exists but no plan → generate plan (fresh loop)
  if (state.spec.exists) {
    return 'generate_plan';
  }

  // Branch has commits but no spec/plan found locally — the files likely
  // exist on the feature branch while we're checking from main.
  // Recommend resume so the loop switches to the branch and picks up the work.
  if (state.branch.exists && state.branch.commitsAhead > 0) {
    return 'resume_implementation';
  }

  return 'start_fresh';
}

export async function assessFeatureStateImpl(
  projectRoot: string,
  featureName: string,
  issueNumber?: number,
): Promise<FeatureState> {
  const opts = { cwd: projectRoot };
  const branchName = `feat/${featureName}`;

  // 1. Check branch
  let branchExists = false;
  let commitsAhead = 0;
  try {
    await execFileAsync('git', ['rev-parse', '--verify', branchName], opts);
    branchExists = true;

    // Count commits ahead of default branch
    let defaultBranch = 'main';
    try {
      const { stdout } = await execFileAsync(
        'git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], opts,
      );
      defaultBranch = stdout.trim().replace(/^origin\//, '');
    } catch {
      // fall back to main
    }

    try {
      const { stdout } = await execFileAsync(
        'git', ['rev-list', '--count', `${defaultBranch}..${branchName}`], opts,
      );
      commitsAhead = parseInt(stdout.trim(), 10) || 0;
    } catch {
      // count failure is non-fatal
    }
  } catch {
    // branch doesn't exist
  }

  // 2. Check spec
  const specPath = join(projectRoot, '.ralph', 'specs', `${featureName}.md`);
  const specExists = existsSync(specPath);

  // 3. Check implementation plan
  const planPath = join(projectRoot, '.ralph', 'specs', `${featureName}-implementation-plan.md`);
  const planExists = existsSync(planPath);
  let totalTasks = 0;
  let completedTasks = 0;

  if (planExists) {
    try {
      const content = readFileSync(planPath, 'utf-8');
      const checked = content.match(/- \[x\]/gi);
      const unchecked = content.match(/- \[ \]/g);
      completedTasks = checked?.length ?? 0;
      totalTasks = completedTasks + (unchecked?.length ?? 0);

      // Fallback: if no checkboxes found, count "#### Task N:" headers
      if (totalTasks === 0) {
        const headerMatches = content.match(/^#{1,4}\s+Task\s+\d+/gim);
        if (headerMatches && headerMatches.length > 0) {
          totalTasks = headerMatches.length;
          // All header tasks are pending (no checkbox = no completion signal)
          completedTasks = 0;
        }
      }
    } catch {
      // read failure is non-fatal
    }
  }

  // 4. Check PR via gh CLI
  let prExists = false;
  let prState: 'OPEN' | 'MERGED' | 'CLOSED' | undefined;
  let prNumber: number | undefined;
  let prUrl: string | undefined;

  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'list',
      '--head', branchName,
      '--state', 'all',
      '--json', 'number,state,url',
      '--limit', '1',
    ], { ...opts, timeout: 15000 });

    const prs = JSON.parse(stdout.trim() || '[]');
    if (prs.length > 0) {
      prExists = true;
      prState = prs[0].state as 'OPEN' | 'MERGED' | 'CLOSED';
      prNumber = prs[0].number;
      prUrl = prs[0].url;
    }
  } catch {
    // gh failure is non-fatal — tool works without GitHub CLI
  }

  // 5. Linked PR search (only when issueNumber provided and no branch-name PR found)
  let linkedPrExists = false;
  let linkedPrState: 'OPEN' | 'MERGED' | 'CLOSED' | undefined;
  let linkedPrNumber: number | undefined;
  let linkedPrUrl: string | undefined;
  let linkedPrHeadRefName: string | undefined;

  if (issueNumber != null && !prExists) {
    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'list',
        '--search', `in:body "closes #${issueNumber}" OR in:body "fixes #${issueNumber}" OR in:body "resolves #${issueNumber}"`,
        '--state', 'all',
        '--json', 'number,state,url,headRefName',
        '--limit', '1',
      ], { ...opts, timeout: 15000 });

      const prs = JSON.parse(stdout.trim() || '[]');
      if (prs.length > 0) {
        linkedPrExists = true;
        linkedPrState = prs[0].state as 'OPEN' | 'MERGED' | 'CLOSED';
        linkedPrNumber = prs[0].number;
        linkedPrUrl = prs[0].url;
        linkedPrHeadRefName = prs[0].headRefName;
      }
    } catch {
      // gh failure is non-fatal
    }
  }

  // 6. Check loop status files
  const prefix = join('/tmp', `ralph-loop-${featureName}`);
  const hasStatusFiles = existsSync(`${prefix}.final`) || existsSync(`${prefix}.phases`) || existsSync(`${prefix}.log`);

  const partial: Omit<FeatureState, 'recommendation'> = {
    featureName,
    branch: { exists: branchExists, commitsAhead },
    spec: { exists: specExists, path: specExists ? specPath : undefined },
    plan: { exists: planExists, path: planExists ? planPath : undefined, totalTasks, completedTasks, completionPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0 },
    pr: { exists: prExists, state: prState, number: prNumber, url: prUrl },
    linkedPr: { exists: linkedPrExists, state: linkedPrState, number: linkedPrNumber, url: linkedPrUrl, headRefName: linkedPrHeadRefName },
    loopStatus: { hasStatusFiles },
  };

  return { ...partial, recommendation: computeRecommendation(partial) };
}

export function createFeatureStateTools(projectRoot: string) {
  const assessFeatureState = tool({
    description: 'Assess the current state of a feature: branch, spec, plan, PR, loop status. Returns a recommendation for what action to take next. MUST be called before generateSpec or runLoop.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      issueNumber: z.number().int().optional().describe('GitHub issue number — enables linked PR detection when the feature was shipped under a different branch name'),
    })),
    execute: async ({ featureName, issueNumber }) => {
      return assessFeatureStateImpl(projectRoot, featureName, issueNumber);
    },
  });

  return { assessFeatureState };
}
