/**
 * Monitor Command
 * Display real-time status of a feature loop
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfigWithDefaults } from '../utils/config.js';
import {
  readLoopStatus,
  parseImplementationPlan,
  getGitBranch,
  formatNumber,
  type LoopStatus,
  type TaskCounts,
} from '../tui/utils/loop-status.js';
import pc from 'picocolors';

export interface MonitorOptions {
  /** Use bash script monitor instead of built-in */
  bash?: boolean;
  /** Use Python TUI monitor */
  python?: boolean;
  /** Refresh interval in seconds */
  interval?: number;
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
async function displayDashboard(feature: string, projectRoot: string, specsDir: string, interval: number = 5): Promise<void> {
  const status = readLoopStatus(feature);
  const tasks = await parseImplementationPlan(projectRoot, feature, specsDir);
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

  const totalTokens = status.tokensInput + status.tokensOutput + status.cacheCreate + status.cacheRead;
  let tokensSuffix = '';
  if (status.tokensUpdatedAt) {
    const agoMs = Date.now() - status.tokensUpdatedAt;
    const agoSec = Math.floor(agoMs / 1000);
    if (agoSec >= 60) {
      tokensSuffix = pc.dim(` updated ${Math.floor(agoSec / 60)}m ago`);
    }
  }
  console.log(
    `  Tokens: ${pc.magenta(formatNumber(totalTokens))}` +
      pc.dim(` (in:${formatNumber(status.tokensInput)} out:${formatNumber(status.tokensOutput)} cache:${formatNumber(status.cacheRead)})`) +
      tokensSuffix
  );

  console.log(pc.dim('  ' + '-'.repeat(74)));

  // Progress
  console.log('');
  if (!tasks.planExists && status.running) {
    console.log(
      `  ${pc.bold('Implementation:')} ${pc.dim('[waiting for plan...]')}`
    );
  } else {
    console.log(
      `  ${pc.bold('Implementation:')} ${progressBar(percentTasks)} ${pc.bold(percentTasks + '%')}` +
        `  ${pc.green('\u2713 ' + tasks.tasksDone)} / ${pc.yellow('\u25cb ' + tasks.tasksPending)}`
    );
  }

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

  // Load config for correct specs path
  let specsDir = '.ralph/specs';
  try {
    const config = await loadConfigWithDefaults(projectRoot);
    specsDir = config.paths.specs;
  } catch (err) {
    logger.debug(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Built-in monitor with sequential polling
  const intervalSeconds = options.interval || 5;
  const intervalMs = intervalSeconds * 1000;

  // Initial display
  try {
    await displayDashboard(feature, projectRoot, specsDir, intervalSeconds);
  } catch (error) {
    logger.error(`Failed to display dashboard: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.DEBUG && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  // Sequential refresh loop (prevents overlapping refreshes)
  let running = true;
  const cleanup = () => {
    running = false;
    console.log('');
    logger.info('Monitor stopped');
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  while (running) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!running) break;
    try {
      await displayDashboard(feature, projectRoot, specsDir, intervalSeconds);
    } catch (error) {
      logger.debug(`Dashboard refresh error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
