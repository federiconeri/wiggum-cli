/**
 * Build enhanced run summary from loop state and external data sources.
 */

import { existsSync, readFileSync } from 'node:fs';
import { logger } from '../../utils/logger.js';
import type {
  RunSummary,
  PhaseInfo,
  IterationBreakdown,
  ChangesSummary,
  CommitsSummary,
  PrSummary,
  IssueSummary,
} from '../screens/RunScreen.js';
import { execFileSync } from 'node:child_process';
import { getCurrentCommitHash, getDiffStats, getCommitList } from './git-summary.js';
import { getPrForBranch, getLinkedIssue, type PrInfo } from './pr-summary.js';
import { parsePhases } from './loop-status.js';

/**
 * Read baseline commit hash from the baseline file.
 *
 * @param baselineFilePath - Path to the baseline file
 * @returns Short commit hash, or null if not available
 */
function readBaselineCommit(baselineFilePath: string): string | null {
  if (!existsSync(baselineFilePath)) {
    logger.debug(`Baseline file not found: ${baselineFilePath}`);
    return null;
  }

  try {
    const content = readFileSync(baselineFilePath, 'utf-8').trim();
    // Validate content looks like a hex commit hash
    if (!/^[0-9a-f]{7,40}$/i.test(content)) {
      logger.warn(`Baseline file ${baselineFilePath} contains invalid content: "${content.substring(0, 20)}"`);
      return null;
    }
    return content.substring(0, 7) || null;
  } catch (err) {
    logger.warn(`Failed to read baseline file: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Build enhanced run summary from loop completion state.
 *
 * This function aggregates data from:
 * - Basic loop state (iterations, tasks, tokens, exit code)
 * - Phase timing file (/tmp/ralph-loop-<feature>.phases)
 * - Baseline commit file (/tmp/ralph-loop-<feature>.baseline)
 * - Git diff stats (via git-summary utilities)
 * - PR/issue metadata (via pr-summary utilities)
 *
 * @param basicSummary - The minimal RunSummary constructed by RunScreen
 * @param projectRoot - Root directory of the project
 * @param feature - Feature name
 * @returns Enhanced RunSummary with all available metadata
 *
 * Note: This function performs synchronous I/O and subprocess execution,
 * which blocks the event loop. Callers should wrap in try-catch to handle
 * failures gracefully.
 */
export function buildEnhancedRunSummary(
  basicSummary: RunSummary,
  projectRoot: string,
  feature: string,
  baselineOverride?: string | null,
): RunSummary {
  const phasesFilePath = `/tmp/ralph-loop-${feature}.phases`;
  const baselineFilePath = `/tmp/ralph-loop-${feature}.baseline`;

  // Parse phases and set implementation iterations from actual loop count
  const phases = parsePhases(phasesFilePath);
  const implPhase = phases.find((p) => p.id === 'implementation');
  if (implPhase) {
    implPhase.iterations = basicSummary.iterations;
  }

  // Calculate total duration from phases
  let totalDurationMs: number | undefined;
  if (phases.length > 0) {
    const totalMs = phases.reduce((sum, phase) => sum + (phase.durationMs || 0), 0);
    totalDurationMs = totalMs > 0 ? totalMs : undefined;
  }

  // Build iteration breakdown
  const iterationBreakdown: IterationBreakdown = {
    total: basicSummary.iterations,
    implementation: phases.find((p) => p.id === 'implementation')?.iterations,
    // TODO: Detect resumes from multiple phase entries (future enhancement)
  };

  // Build task summary
  const tasks = {
    completed: basicSummary.tasksDone,
    total: basicSummary.tasksTotal,
  };

  // Git changes and commits — use override if provided (avoids re-reading a cleaned-up file)
  const baselineCommit = baselineOverride !== undefined
    ? (baselineOverride ? baselineOverride.substring(0, 7) : null)
    : readBaselineCommit(baselineFilePath);
  const currentCommit = getCurrentCommitHash(projectRoot);

  let changes: ChangesSummary = { available: false };
  let commits: CommitsSummary = { available: false };

  if (baselineCommit && currentCommit) {
    // Get commit log between baseline and current
    const commitLog = getCommitList(projectRoot, baselineCommit, currentCommit);

    commits = {
      fromHash: baselineCommit,
      toHash: currentCommit,
      commitList: commitLog?.map((c) => ({ hash: c.hash, title: c.title })),
      mergeType: 'none', // TODO: Detect merge type from git history
      available: true,
    };

    // Get diff stats
    const diffStats = getDiffStats(projectRoot, baselineCommit, currentCommit);
    if (diffStats !== null) {
      changes = {
        totalFilesChanged: diffStats.length,
        files: diffStats.map((stat) => ({
          path: stat.path,
          added: stat.added,
          removed: stat.removed,
        })),
        available: true,
      };
    } else {
      changes = { available: true }; // Git is available but diff failed
    }
  } else if (currentCommit) {
    // Only current commit available (no baseline)
    commits = {
      toHash: currentCommit,
      available: true,
    };
  }

  // PR and issue metadata
  let pr: PrSummary = { available: false, created: false };
  let issue: IssueSummary = { available: false, linked: false };

  if (basicSummary.branch) {
    try {
      const prInfo = getPrForBranch(projectRoot, basicSummary.branch);
      if (prInfo) {
        pr = {
          number: prInfo.number,
          url: prInfo.url,
          available: true,
          created: true,
        };

        // Try to get linked issue, passing prInfo and feature name for fallback detection
        const issueInfo = getLinkedIssue(projectRoot, basicSummary.branch, prInfo, feature);
        if (issueInfo) {
          // When PR is merged with "Closes #N", GitHub auto-closes the issue.
          // The summary may be built before GitHub processes the webhook, so
          // infer closure from PR state to avoid showing stale "OPEN" status.
          const inferredState =
            prInfo.state === 'MERGED' && issueInfo.state === 'OPEN'
              ? 'CLOSED'
              : issueInfo.state;
          issue = {
            number: issueInfo.number,
            url: issueInfo.url,
            status: inferredState,
            available: true,
            linked: true,
          };
        } else {
          issue = { available: true, linked: false };
        }
        // Enrich commits from PR when squash-merge detected (1 local commit + merged PR)
        if (
          prInfo.state === 'MERGED' &&
          commits.available &&
          commits.commitList &&
          commits.commitList.length <= 1
        ) {
          try {
            const prCommitsOutput = execFileSync(
              'gh',
              ['pr', 'view', String(prInfo.number), '--json', 'commits'],
              { cwd: projectRoot, encoding: 'utf-8', timeout: 10_000 },
            ).trim();
            const prCommitsData = JSON.parse(prCommitsOutput);
            const prCommits = prCommitsData.commits;
            if (Array.isArray(prCommits) && prCommits.length > 1) {
              commits = {
                ...commits,
                commitList: prCommits.map((c: { oid: string; messageHeadline: string }) => ({
                  hash: c.oid?.substring(0, 7) ?? '',
                  title: c.messageHeadline ?? '',
                })),
                mergeType: 'squash',
              };
            }
          } catch (err) {
            logger.debug(`Failed to fetch PR commits: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else {
        pr = { available: true, created: false };
        issue = { available: true, linked: false };
      }
    } catch (err) {
      logger.warn(`gh CLI query failed: ${err instanceof Error ? err.message : String(err)}`);
      // pr and issue remain { available: false } from defaults above
    }
  }

  return {
    ...basicSummary,
    totalDurationMs,
    iterationBreakdown,
    tasks,
    phases,
    changes,
    commits,
    pr,
    issue,
  };
}
