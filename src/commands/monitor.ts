/**
 * Monitor Command
 * Display real-time status of a feature loop
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfigWithDefaults, hasConfig } from '../utils/config.js';
import pc from 'picocolors';

export interface MonitorOptions {
  /** Use bash script monitor instead of built-in */
  bash?: boolean;
  /** Use Python TUI monitor */
  python?: boolean;
  /** Refresh interval in seconds */
  interval?: number;
}

interface LoopStatus {
  running: boolean;
  phase: string;
  iteration: number;
  maxIterations: number;
  tokensInput: number;
  tokensOutput: number;
  tasksDone: number;
  tasksPending: number;
  e2eDone: number;
  e2ePending: number;
  branch: string;
  elapsed: string;
}

/**
 * Find the ralph-monitor.sh script
 */
function findMonitorScript(projectRoot: string): string | null {
  // Check .ralph/scripts first
  const localScript = join(projectRoot, '.ralph', 'scripts', 'ralph-monitor.sh');
  if (existsSync(localScript)) {
    return localScript;
  }

  // Check for ralph directory as sibling (development setup)
  const siblingRalph = join(projectRoot, '..', 'ralph', 'ralph-monitor.sh');
  if (existsSync(siblingRalph)) {
    return siblingRalph;
  }

  // Check in current directory (ralph repo)
  const currentRalph = join(projectRoot, 'ralph-monitor.sh');
  if (existsSync(currentRalph)) {
    return currentRalph;
  }

  return null;
}

/**
 * Check if a process matching pattern is running
 * Uses pgrep with -f flag for full command line matching
 */
function isProcessRunning(pattern: string): boolean {
  try {
    // Use execFileSync for safer execution
    const result = execFileSync('pgrep', ['-f', pattern], { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Detect current phase of the loop
 */
function detectPhase(feature: string): string {
  if (isProcessRunning('PROMPT_feature.md')) return 'Planning';
  if (isProcessRunning('PROMPT_e2e.md')) return 'E2E Testing';
  if (isProcessRunning('PROMPT_verify.md')) return 'Verification';
  if (isProcessRunning('PROMPT_review_manual.md')) return 'PR Review';
  if (isProcessRunning('PROMPT_review_auto.md')) return 'PR Review';
  if (isProcessRunning('PROMPT.md')) return 'Implementation';
  if (isProcessRunning(`feature-loop.sh.*${feature}`)) return 'Running';
  return 'Idle';
}

/**
 * Read status from temp files
 */
function readStatus(feature: string): LoopStatus {
  const statusFile = `/tmp/ralph-loop-${feature}.status`;
  const tokensFile = `/tmp/ralph-loop-${feature}.tokens`;

  let iteration = 0;
  let maxIterations = 50;

  // Read status file
  if (existsSync(statusFile)) {
    try {
      const content = readFileSync(statusFile, 'utf-8').trim();
      const parts = content.split('|');
      iteration = parseInt(parts[0]) || 0;
      maxIterations = parseInt(parts[1]) || 50;
    } catch {
      // Ignore errors
    }
  }

  // Read tokens file
  let tokensInput = 0;
  let tokensOutput = 0;
  if (existsSync(tokensFile)) {
    try {
      const content = readFileSync(tokensFile, 'utf-8').trim();
      const parts = content.split('|');
      tokensInput = parseInt(parts[0]) || 0;
      tokensOutput = parseInt(parts[1]) || 0;
    } catch {
      // Ignore errors
    }
  }

  return {
    running: isProcessRunning(`feature-loop.sh.*${feature}`),
    phase: detectPhase(feature),
    iteration,
    maxIterations,
    tokensInput,
    tokensOutput,
    tasksDone: 0,
    tasksPending: 0,
    e2eDone: 0,
    e2ePending: 0,
    branch: '',
    elapsed: '',
  };
}

/**
 * Parse implementation plan for task counts
 */
async function parseImplementationPlan(
  projectRoot: string,
  feature: string
): Promise<{ tasksDone: number; tasksPending: number; e2eDone: number; e2ePending: number }> {
  const config = await loadConfigWithDefaults(projectRoot);
  const planPath = join(projectRoot, config.paths.specs, `${feature}-implementation-plan.md`);

  let tasksDone = 0;
  let tasksPending = 0;
  let e2eDone = 0;
  let e2ePending = 0;

  if (existsSync(planPath)) {
    try {
      const content = readFileSync(planPath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.match(/^- \[x\]/)) {
          if (line.includes('E2E:')) {
            e2eDone++;
          } else {
            tasksDone++;
          }
        } else if (line.match(/^- \[ \]/)) {
          if (line.includes('E2E:')) {
            e2ePending++;
          } else {
            tasksPending++;
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return { tasksDone, tasksPending, e2eDone, e2ePending };
}

/**
 * Get current git branch
 */
function getGitBranch(projectRoot: string): string {
  try {
    // Try app directory first
    const appDir = join(projectRoot, '..', 'app');
    if (existsSync(appDir)) {
      return execFileSync('git', ['branch', '--show-current'], {
        cwd: appDir,
        encoding: 'utf-8',
      }).trim();
    }
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '-';
  }
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return String(num);
}

/**
 * Create a progress bar
 */
function progressBar(percent: number, width: number = 15): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return pc.green('\u2588'.repeat(filled)) + pc.dim('\u2591'.repeat(empty));
}

/**
 * Display built-in monitor dashboard
 */
async function displayDashboard(feature: string, projectRoot: string, interval: number = 5): Promise<void> {
  const status = readStatus(feature);
  const tasks = await parseImplementationPlan(projectRoot, feature);
  const branch = getGitBranch(projectRoot);

  // Calculate progress
  const totalTasks = tasks.tasksDone + tasks.tasksPending;
  const totalE2e = tasks.e2eDone + tasks.e2ePending;
  const totalAll = totalTasks + totalE2e;
  const doneAll = tasks.tasksDone + tasks.e2eDone;

  const percentTasks = totalTasks > 0 ? Math.round((tasks.tasksDone / totalTasks) * 100) : 0;
  const percentE2e = totalE2e > 0 ? Math.round((tasks.e2eDone / totalE2e) * 100) : 0;
  const percentAll = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

  // Clear screen
  console.clear();

  // Header
  const timestamp = new Date().toLocaleTimeString();
  console.log(pc.bold('='.repeat(78)));
  console.log(
    pc.bold('  ') +
      pc.cyan('RALPH MONITOR') +
      `: ${pc.bold(feature)}` +
      `  ${pc.dim(timestamp)}`
  );
  console.log(pc.bold('='.repeat(78)));
  console.log('');

  // Status line
  const phaseColors: Record<string, (s: string) => string> = {
    Planning: pc.blue,
    Implementation: pc.yellow,
    'E2E Testing': pc.cyan,
    Verification: pc.magenta,
    'PR Review': pc.green,
    Idle: pc.dim,
    Running: pc.white,
  };
  const phaseColor = phaseColors[status.phase] || pc.white;

  console.log(
    `  Phase: ${phaseColor(pc.bold(status.phase))}` +
      `  |  Iter: ${pc.bold(String(status.iteration))}/${pc.dim(String(status.maxIterations))}` +
      `  |  Branch: ${pc.cyan(branch)}`
  );

  const totalTokens = status.tokensInput + status.tokensOutput;
  console.log(
    `  Tokens: ${pc.magenta(formatNumber(totalTokens))}` +
      pc.dim(` (in:${formatNumber(status.tokensInput)} out:${formatNumber(status.tokensOutput)})`)
  );

  console.log(pc.dim('  ' + '-'.repeat(74)));

  // Progress
  console.log('');
  console.log(
    `  ${pc.bold('Implementation:')} ${progressBar(percentTasks)} ${pc.bold(percentTasks + '%')}` +
      `  ${pc.green('\u2713 ' + tasks.tasksDone)} / ${pc.yellow('\u25cb ' + tasks.tasksPending)}`
  );

  if (totalE2e > 0) {
    console.log(
      `  ${pc.bold('E2E Tests:     ')} ${progressBar(percentE2e)} ${pc.bold(percentE2e + '%')}` +
        `  ${pc.green('\u2713 ' + tasks.e2eDone)} / ${pc.yellow('\u25cb ' + tasks.e2ePending)}`
    );
  }

  console.log(pc.dim('  ' + '-'.repeat(40)));
  console.log(
    `  ${pc.bold('Overall:       ')} ${progressBar(percentAll)} ${pc.bold(percentAll + '%')}` +
      `  ${pc.green('\u2713 ' + doneAll)} / ${pc.yellow('\u25cb ' + (totalAll - doneAll))}`
  );

  // Status indicator
  console.log('');
  if (status.running) {
    console.log(pc.green('  \u25cf Loop is running'));
  } else {
    console.log(pc.yellow('  \u25cb Loop is not running'));
  }

  console.log('');
  console.log(pc.dim(`  Refreshing every ${interval}s | Press Ctrl+C to exit`));
}

/**
 * Launch the monitoring dashboard for a feature
 */
export async function monitorCommand(feature: string, options: MonitorOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Validate feature name
  if (!feature || typeof feature !== 'string') {
    logger.error('Feature name is required');
    process.exit(1);
  }

  // Sanitize feature name (allow alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(feature)) {
    logger.error('Feature name must contain only letters, numbers, hyphens, and underscores');
    process.exit(1);
  }

  // Validate interval
  if (options.interval !== undefined && (options.interval < 1 || options.interval > 60)) {
    logger.warn('Interval should be between 1 and 60 seconds. Using default (5).');
    options.interval = 5;
  }

  logger.info(`Monitoring feature: ${pc.bold(feature)}`);
  console.log('');

  // Check for bash monitor option
  if (options.bash) {
    const monitorScript = findMonitorScript(projectRoot);
    if (!monitorScript) {
      logger.error('ralph-monitor.sh script not found');
      logger.info('The script should be in .ralph/scripts/ or the ralph/ directory');
      process.exit(1);
    }

    logger.info(`Using bash monitor: ${monitorScript}`);
    console.log('');

    const child = spawn('bash', [monitorScript, feature], {
      cwd: dirname(monitorScript),
      stdio: 'inherit',
    });

    return new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', () => resolve());
    });
  }

  // Python TUI option
  if (options.python) {
    logger.warn('Python TUI monitor not yet implemented');
    logger.info('Using built-in monitor instead');
  }

  // Built-in monitor
  const intervalSeconds = options.interval || 5;
  const intervalMs = intervalSeconds * 1000;

  // Initial display
  try {
    await displayDashboard(feature, projectRoot, intervalSeconds);
  } catch (error) {
    logger.error(`Failed to display dashboard: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.DEBUG && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  // Refresh loop
  const refreshTimer = setInterval(async () => {
    try {
      await displayDashboard(feature, projectRoot, intervalSeconds);
    } catch (error) {
      // Log error but continue monitoring
      logger.debug(`Dashboard refresh error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, intervalMs);

  // Return a Promise that resolves on SIGINT
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      clearInterval(refreshTimer);
      console.log('');
      logger.info('Monitor stopped');
      resolve();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}
