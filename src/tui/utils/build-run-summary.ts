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
import { getCurrentCommitHash, getDiffStats } from './git-summary.js';
import { getPrForBranch, getLinkedIssue, type PrInfo } from './pr-summary.js';

/**
 * Phase ID to human-readable label mapping
 */
const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning',
  implementation: 'Implementation',
  e2e_testing: 'E2E Testing',
  verification: 'Verification',
  pr_review: 'PR & Review',
};

const VALID_PHASE_STATUSES = new Set(['success', 'skipped', 'failed']);

/**
 * Parse phase information from the phases file written by feature-loop.sh.
 *
 * Format: phase_id|status|start_timestamp|end_timestamp
 * The parser handles duplicate phase entries defensively (last status wins,
 * durations aggregate), though feature-loop.sh normally writes one final
 * line per phase.
 *
 * @param phasesFilePath - Path to the phases file
 * @returns Array of phase info objects
 */
function parsePhases(phasesFilePath: string): PhaseInfo[] {
  if (!existsSync(phasesFilePath)) {
    logger.debug(`Phases file not found: ${phasesFilePath}`);
    return [];
  }

  try {
    const content = readFileSync(phasesFilePath, 'utf-8').trim();
    if (!content) {
      return [];
    }

    const lines = content.split('\n');
    const phaseMap = new Map<string, PhaseInfo>();

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 4) {
        logger.warn(`Skipping malformed phase line: ${line}`);
        continue;
      }

      const [id, status, startStr, endStr] = parts;

      // Validate status
      if (!VALID_PHASE_STATUSES.has(status)) {
        logger.warn(`Unknown phase status "${status}" for phase "${id}", treating as failed`);
      }
      const validatedStatus: PhaseInfo['status'] = VALID_PHASE_STATUSES.has(status)
        ? (status as PhaseInfo['status'])
        : 'failed';

      // Parse timestamps
      const startTime = parseInt(startStr, 10) || 0;
      const endTime = parseInt(endStr, 10) || 0;

      // Calculate duration (end - start) in milliseconds
      const durationMs = endTime > 0 && startTime > 0 ? (endTime - startTime) * 1000 : undefined;

      // Get or create phase entry
      let phase = phaseMap.get(id);
      if (!phase) {
        phase = {
          id,
          label: PHASE_LABELS[id] || id,
          status: validatedStatus,
          durationMs: 0,
        };
        phaseMap.set(id, phase);
      }

      // Update status (last status wins)
      phase.status = validatedStatus;

      // Aggregate duration
      if (durationMs !== undefined) {
        phase.durationMs = (phase.durationMs || 0) + durationMs;
      }

    }

    return Array.from(phaseMap.values());
  } catch (err) {
    logger.warn(`Failed to parse phases file: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

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
  feature: string
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

  // Git changes and commits
  const baselineCommit = readBaselineCommit(baselineFilePath);
  const currentCommit = getCurrentCommitHash(projectRoot);

  let changes: ChangesSummary = { available: false };
  let commits: CommitsSummary = { available: false };

  if (baselineCommit && currentCommit) {
    commits = {
      fromHash: baselineCommit,
      toHash: currentCommit,
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

        // Try to get linked issue, passing prInfo to avoid redundant gh call
        const issueInfo = getLinkedIssue(projectRoot, basicSummary.branch, prInfo);
        if (issueInfo) {
          issue = {
            number: issueInfo.number,
            url: issueInfo.url,
            status: issueInfo.state,
            available: true,
            linked: true,
          };
        } else {
          issue = { available: true, linked: false };
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
