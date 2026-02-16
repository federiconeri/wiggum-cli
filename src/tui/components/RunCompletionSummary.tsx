/**
 * RunCompletionSummary - Displays enhanced run loop completion recap
 *
 * Shows a bordered summary box with timing, phases, iterations, tasks, code changes,
 * commits, and PR/issue links after a feature loop completes.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { SummaryBox, SummaryBoxSection } from './SummaryBox.js';
import { colors, phase } from '../theme.js';
import type { RunSummary } from '../screens/RunScreen.js';

/**
 * Props for RunCompletionSummary component
 */
export interface RunCompletionSummaryProps {
  /** Run summary data */
  summary: RunSummary;
}

/**
 * Format milliseconds to human-readable duration (e.g., "12m 34s", "1h 15m")
 */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'Unknown';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * RunCompletionSummary component
 *
 * Renders the enhanced run loop completion summary using SummaryBox.
 * Displays header, timing/iterations/tasks, phases, changes/commits, and PR/issue links.
 */
const stoppedCodes = new Set([130, 143]);

export function RunCompletionSummary({
  summary,
}: RunCompletionSummaryProps): React.ReactElement {

  // Determine final status and color
  const exitStatus = summary.exitCode === 0
    ? { label: 'Complete', color: colors.green }
    : stoppedCodes.has(summary.exitCode)
      ? { label: 'Stopped', color: colors.orange }
      : summary.exitCodeInferred
        ? { label: 'Unknown', color: colors.orange }
        : { label: 'Failed', color: colors.pink };

  // Use enhanced iteration data if available, fallback to legacy
  const iterationsTotal = summary.iterationBreakdown?.total ?? summary.iterations;
  const iterationsImpl = summary.iterationBreakdown?.implementation;
  const iterationsResumes = summary.iterationBreakdown?.resumes;

  // Format iterations with breakdown if available
  const iterationsDisplay =
    iterationsImpl !== undefined && iterationsResumes !== undefined
      ? `${iterationsTotal} (${iterationsImpl} impl + ${iterationsResumes} resume)`
      : String(iterationsTotal);

  // Tasks: use enhanced field if available, fallback to legacy
  const tasksCompleted = summary.tasks?.completed ?? summary.tasksDone;
  const tasksTotal = summary.tasks?.total ?? summary.tasksTotal;
  const tasksDisplay =
    tasksCompleted !== null && tasksTotal !== null
      ? `${tasksCompleted}/${tasksTotal} completed`
      : 'Not available';

  return (
    <SummaryBox minWidth={60}>
      {/* Header: feature name + status */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>{summary.feature}</Text>
        <Text bold color={exitStatus.color}>{exitStatus.label}</Text>
      </Box>

      <SummaryBoxSection>
        {/* Timing, iterations, tasks */}
        {summary.totalDurationMs !== undefined ? (
          <Text>Duration: {formatDurationMs(summary.totalDurationMs)}</Text>
        ) : (
          <Text>Duration: Not available</Text>
        )}
        <Text>Iterations: {iterationsDisplay}</Text>
        <Text>Tasks: {tasksDisplay}</Text>
      </SummaryBoxSection>

      <SummaryBoxSection>
        {/* Phases section - always shown */}
        <Text bold>Phases</Text>
        {summary.phases && summary.phases.length > 0 ? (
          summary.phases.map((phaseInfo) => {
            const statusIcon =
              phaseInfo.status === 'success' ? phase.complete :
              phaseInfo.status === 'failed' ? phase.error :
              phase.pending;

            const statusColor =
              phaseInfo.status === 'success' ? colors.green :
              phaseInfo.status === 'failed' ? colors.pink :
              colors.gray;

            const durationText = phaseInfo.durationMs !== undefined
              ? formatDurationMs(phaseInfo.durationMs)
              : 'Not available';

            const iterationsText = phaseInfo.iterations !== undefined && phaseInfo.iterations > 0
              ? ` (${phaseInfo.iterations} iterations)`
              : '';

            const statusText = phaseInfo.status === 'skipped' ? ' skipped' :
                               phaseInfo.status === 'failed' ? ' failed' : '';

            return (
              <Box key={phaseInfo.id} flexDirection="row">
                <Text color={statusColor}>{statusIcon} </Text>
                <Text>{phaseInfo.label} {durationText}{iterationsText}{statusText}</Text>
              </Box>
            );
          })
        ) : (
          <Text>No phase information available</Text>
        )}
      </SummaryBoxSection>

      <SummaryBoxSection>
        {/* Changes section - always shown */}
        <Text bold>Changes</Text>
        {summary.changes ? (
          !summary.changes.available ? (
            <Text>Changes: Not available</Text>
          ) : summary.changes.totalFilesChanged === 0 || (summary.changes.files && summary.changes.files.length === 0) ? (
            <Text>No changes</Text>
          ) : (
            <>
              {summary.changes.totalFilesChanged !== undefined && (
                <Text>{summary.changes.totalFilesChanged} file{summary.changes.totalFilesChanged !== 1 ? 's' : ''} changed</Text>
              )}
              {summary.changes.files && summary.changes.files.map((file) => (
                <Box key={file.path} flexDirection="row">
                  <Text>{file.path}  </Text>
                  <Text color={colors.green}>+{file.added} </Text>
                  <Text color={colors.pink}>-{file.removed}</Text>
                  <Text> lines</Text>
                </Box>
              ))}
            </>
          )
        ) : (
          <Text>Changes: Not available</Text>
        )}

        {summary.commits ? (
          !summary.commits.available ? (
            <Text>Commit: Not available</Text>
          ) : summary.commits.fromHash && summary.commits.toHash ? (
            <Text>
              Commit: {summary.commits.fromHash} → {summary.commits.toHash}
              {summary.commits.mergeType === 'squash' && ' (squash-merged)'}
              {summary.commits.mergeType === 'normal' && ' (merged)'}
            </Text>
          ) : summary.commits.toHash ? (
            <Text>Commit: {summary.commits.toHash}</Text>
          ) : (
            <Text>Commit: Not available</Text>
          )
        ) : (
          <Text>Commit: Not available</Text>
        )}
      </SummaryBoxSection>

      <SummaryBoxSection>
        {/* PR and Issue section - always shown */}
        {summary.pr ? (
          <>
            {!summary.pr.available ? (
              <Text>PR: Not available</Text>
            ) : summary.pr.created && summary.pr.number && summary.pr.url ? (
              <Text>PR #{summary.pr.number}: {summary.pr.url}</Text>
            ) : (
              <Text>PR: Not created</Text>
            )}
          </>
        ) : (
          <Text>PR: Not available</Text>
        )}

        {summary.issue ? (
          <>
            {!summary.issue.available ? (
              <Text>Issue: Not available</Text>
            ) : summary.issue.linked && summary.issue.number ? (
              <Text>
                Issue #{summary.issue.number}: {summary.issue.status || 'Linked'}
                {summary.issue.url && ` (${summary.issue.url})`}
              </Text>
            ) : (
              <Text>Issue: Not linked</Text>
            )}
          </>
        ) : (
          <Text>Issue: Not available</Text>
        )}
      </SummaryBoxSection>
    </SummaryBox>
  );
}
