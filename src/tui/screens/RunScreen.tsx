/**
 * RunScreen - TUI screen for running feature loop
 *
 * Spawns feature-loop.sh and polls status files for progress.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StatusLine } from '../components/StatusLine.js';
import { Confirm } from '../components/Confirm.js';
import { colors, theme } from '../theme.js';
import {
  readLoopStatus,
  parseImplementationPlan,
  getGitBranch,
  formatNumber,
  type LoopStatus,
  type TaskCounts,
} from '../utils/loop-status.js';
import { loadConfigWithDefaults } from '../../utils/config.js';
import type { SessionState } from '../../repl/session-state.js';

export interface RunSummary {
  feature: string;
  iterations: number;
  maxIterations: number;
  tasksDone: number;
  tasksTotal: number;
  tokensInput: number;
  tokensOutput: number;
  exitCode: number;
  branch?: string;
  logPath?: string;
  errorTail?: string;
}

export interface RunScreenProps {
  featureName: string;
  projectRoot: string;
  sessionState: SessionState;
  onComplete: (summary: RunSummary) => void;
  onCancel: () => void;
}

const POLL_INTERVAL_MS = 2500;
const ERROR_TAIL_LINES = 12;

/**
 * Find the feature-loop.sh script.
 */
function findFeatureLoopScript(projectRoot: string, scriptsDir: string): string | null {
  const localScript = join(projectRoot, scriptsDir, 'feature-loop.sh');
  if (existsSync(localScript)) {
    return localScript;
  }

  const siblingRalph = join(projectRoot, '..', 'ralph', 'feature-loop.sh');
  if (existsSync(siblingRalph)) {
    return siblingRalph;
  }

  const parentRalph = join(projectRoot, 'feature-loop.sh');
  if (existsSync(parentRalph)) {
    return parentRalph;
  }

  return null;
}

/**
 * Validate that the spec file exists.
 */
function findSpecFile(projectRoot: string, feature: string, specsDir: string): string | null {
  const possiblePaths = [
    join(projectRoot, specsDir, `${feature}.md`),
    join(projectRoot, '.ralph', 'specs', `${feature}.md`),
    join(projectRoot, 'specs', `${feature}.md`),
  ];

  for (const specPath of possiblePaths) {
    if (existsSync(specPath)) {
      return specPath;
    }
  }

  return null;
}

/**
 * Render a simple progress bar.
 */
function ProgressBar({ percent, width = 18 }: { percent: number; width?: number }): React.ReactElement {
  const safePercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((safePercent / 100) * width);
  const empty = Math.max(0, width - filled);

  return (
    <Box flexDirection="row">
      <Text color={colors.green}>{'\u2588'.repeat(filled)}</Text>
      <Text dimColor>{'\u2591'.repeat(empty)}</Text>
    </Box>
  );
}

function formatDuration(start: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function readLogTail(logPath: string, maxLines: number): string | null {
  if (!existsSync(logPath)) return null;
  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trimEnd().split('\n');
    if (lines.length === 0) return null;
    return lines.slice(-maxLines).join('\n');
  } catch {
    return null;
  }
}

export function RunScreen({
  featureName,
  projectRoot,
  sessionState,
  onComplete,
  onCancel,
}: RunScreenProps): React.ReactElement {
  const [status, setStatus] = useState<LoopStatus>(() => readLoopStatus(featureName));
  const [tasks, setTasks] = useState<TaskCounts>({
    tasksDone: 0,
    tasksPending: 0,
    e2eDone: 0,
    e2ePending: 0,
  });
  const [branch, setBranch] = useState<string>('-');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  const childRef = useRef<ChildProcess | null>(null);
  const stopRequestedRef = useRef(false);
  const isMountedRef = useRef(true);
  const startTimeRef = useRef<number>(Date.now());
  const specsDirRef = useRef<string>('.ralph/specs');
  const configRootRef = useRef<string>('.ralph');
  const scriptsDirRef = useRef<string>('.ralph/scripts');
  const maxIterationsRef = useRef<number>(0);
  const maxE2eAttemptsRef = useRef<number>(0);

  useInput((input, key) => {
    if (showConfirm) return;
    if (key.ctrl && input === 'c') {
      setShowConfirm(true);
      return;
    }
    if (key.escape) {
      onCancel();
    }
  });

  const refreshStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    const nextStatus = readLoopStatus(featureName);
    setStatus(nextStatus);

    const nextTasks = await parseImplementationPlan(projectRoot, featureName, specsDirRef.current);
    if (!isMountedRef.current) return;
    setTasks(nextTasks);

    if (!isMountedRef.current) return;
    setBranch(getGitBranch(projectRoot));
  }, [featureName, projectRoot]);

  const stopLoop = useCallback(() => {
    stopRequestedRef.current = true;
    if (childRef.current) {
      childRef.current.kill('SIGINT');
    }
  }, []);

  const handleConfirm = useCallback((value: boolean) => {
    setShowConfirm(false);
    if (value) {
      stopLoop();
    }
  }, [stopLoop]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    const startLoop = async () => {
      try {
        if (!/^[a-zA-Z0-9_-]+$/.test(featureName)) {
          setError('Feature name must contain only letters, numbers, hyphens, and underscores.');
          setIsStarting(false);
          return;
        }

        const config = sessionState.config ?? await loadConfigWithDefaults(projectRoot);
        specsDirRef.current = config.paths.specs;
        scriptsDirRef.current = config.paths.scripts;
        configRootRef.current = config.paths.root;
        maxIterationsRef.current = config.loop.maxIterations;
        maxE2eAttemptsRef.current = config.loop.maxE2eAttempts;

        const specFile = findSpecFile(projectRoot, featureName, config.paths.specs);
        if (!specFile) {
          setError(`Spec file not found for "${featureName}". Run /new ${featureName} first.`);
          setIsStarting(false);
          return;
        }

        const scriptPath = findFeatureLoopScript(projectRoot, config.paths.scripts);
        if (!scriptPath) {
          setError('feature-loop.sh script not found. Run /init to generate scripts.');
          setIsStarting(false);
          return;
        }

        const logPath = `/tmp/ralph-loop-${featureName}.log`;
        const logFd = openSync(logPath, 'a');

        const args = [
          featureName,
          String(config.loop.maxIterations),
          String(config.loop.maxE2eAttempts),
        ];

        const child = spawn('bash', [scriptPath, ...args], {
          cwd: dirname(scriptPath),
          stdio: ['ignore', logFd, logFd],
          env: {
            ...process.env,
            RALPH_CONFIG_ROOT: config.paths.root,
            RALPH_SPEC_DIR: config.paths.specs,
            RALPH_SCRIPTS_DIR: config.paths.scripts,
          },
        });

        childRef.current = child;
        startTimeRef.current = Date.now();
        setIsStarting(false);

        if (stopRequestedRef.current) {
          child.kill('SIGINT');
        }

        pollTimer = setInterval(() => {
          refreshStatus();
        }, POLL_INTERVAL_MS);

        refreshStatus();

        child.on('error', (err) => {
          if (cancelled) return;
          setError(`Failed to start feature loop: ${err.message}`);
        });

        child.on('close', async (code) => {
          if (cancelled) return;
          if (pollTimer) clearInterval(pollTimer);
          closeSync(logFd);
          const latestStatus = readLoopStatus(featureName);
          const latestTasks = await parseImplementationPlan(projectRoot, featureName, specsDirRef.current);

          const tasksDone = latestTasks.tasksDone + latestTasks.e2eDone;
          const tasksTotal = tasksDone + latestTasks.tasksPending + latestTasks.e2ePending;
          const exitCode = typeof code === 'number' ? code : 1;
          const errorTail = exitCode === 0 ? undefined : readLogTail(logPath, ERROR_TAIL_LINES) || undefined;

          onComplete({
            feature: featureName,
            iterations: latestStatus.iteration,
            maxIterations: latestStatus.maxIterations || config.loop.maxIterations,
            tasksDone,
            tasksTotal,
            tokensInput: latestStatus.tokensInput,
            tokensOutput: latestStatus.tokensOutput,
            exitCode,
            branch: getGitBranch(projectRoot),
            logPath,
            errorTail,
          });
        });
      } catch (err) {
        if (cancelled) return;
        setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        setIsStarting(false);
      }
    };

    startLoop();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [featureName, projectRoot, refreshStatus, onComplete, sessionState.config]);

  const totalTasks = tasks.tasksDone + tasks.tasksPending;
  const totalE2e = tasks.e2eDone + tasks.e2ePending;
  const totalAll = totalTasks + totalE2e;
  const doneAll = tasks.tasksDone + tasks.e2eDone;
  const percentTasks = totalTasks > 0 ? Math.round((tasks.tasksDone / totalTasks) * 100) : 0;
  const percentE2e = totalE2e > 0 ? Math.round((tasks.e2eDone / totalE2e) * 100) : 0;
  const percentAll = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

  const totalTokens = status.tokensInput + status.tokensOutput;
  const phaseLine = isStarting ? 'Starting...' : status.phase;

  return (
    <Box flexDirection="column" padding={1}>
      <StatusLine
        action="Run Loop"
        phase={phaseLine}
        path={featureName}
      />

      {error && (
        <Box marginTop={1}>
          <Text color={theme.colors.error}>Error: {error}</Text>
        </Box>
      )}

      {!error && (
        <>
          <Box marginTop={1} flexDirection="row">
            <Text>Phase: </Text>
            <Text color={colors.yellow}>{phaseLine}</Text>
            <Text dimColor>{theme.statusLine.separator}</Text>
            <Text>Iter: </Text>
            <Text color={colors.green}>{status.iteration}</Text>
            <Text dimColor>/{status.maxIterations || maxIterationsRef.current || '-'}</Text>
            <Text dimColor>{theme.statusLine.separator}</Text>
            <Text>Branch: </Text>
            <Text color={colors.blue}>{branch}</Text>
          </Box>

          <Box marginTop={1} flexDirection="row">
            <Text>Tokens: </Text>
            <Text color={colors.pink}>{formatNumber(totalTokens)}</Text>
            <Text dimColor> (in:{formatNumber(status.tokensInput)} out:{formatNumber(status.tokensOutput)})</Text>
            <Text dimColor>{theme.statusLine.separator}</Text>
            <Text dimColor>Elapsed: {formatDuration(startTimeRef.current)}</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Text bold>Implementation:</Text>
              <ProgressBar percent={percentTasks} />
              <Text>{percentTasks}%</Text>
              <Text color={colors.green}>✓ {tasks.tasksDone}</Text>
              <Text color={colors.yellow}>○ {tasks.tasksPending}</Text>
            </Box>

            {totalE2e > 0 && (
              <Box flexDirection="row" alignItems="center" gap={1}>
                <Text bold>E2E Tests:</Text>
                <ProgressBar percent={percentE2e} />
                <Text>{percentE2e}%</Text>
                <Text color={colors.green}>✓ {tasks.e2eDone}</Text>
                <Text color={colors.yellow}>○ {tasks.e2ePending}</Text>
              </Box>
            )}

            <Box flexDirection="row" alignItems="center" gap={1} marginTop={1}>
              <Text bold>Overall:</Text>
              <ProgressBar percent={percentAll} />
              <Text>{percentAll}%</Text>
              <Text color={colors.green}>✓ {doneAll}</Text>
              <Text color={colors.yellow}>○ {totalAll - doneAll}</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>Tip: /monitor {featureName} in another terminal for details</Text>
          </Box>
          <Box>
            <Text dimColor>Press Ctrl+C to stop the loop</Text>
          </Box>
        </>
      )}

      {showConfirm && (
        <Box marginTop={1}>
          <Confirm
            message={stopRequestedRef.current ? 'Stopping loop...' : 'Stop the feature loop?'}
            onConfirm={handleConfirm}
            onCancel={() => setShowConfirm(false)}
            initialValue={false}
          />
        </Box>
      )}
    </Box>
  );
}
