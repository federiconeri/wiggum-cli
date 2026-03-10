/**
 * Run Command
 * Executes the feature development loop for a specific feature
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../utils/logger.js';
import {
  loadConfigWithDefaults,
  hasConfig,
  type RalphConfig,
} from '../utils/config.js';
import pc from 'picocolors';

export interface RunOptions {
  worktree?: boolean;
  resume?: boolean;
  model?: string;
  cli?: 'claude' | 'codex';
  reviewCli?: 'claude' | 'codex';
  maxIterations?: number;
  maxE2eAttempts?: number;
  reviewMode?: 'manual' | 'auto' | 'merge';
}

const SUPPORTED_LOOP_CLIS = ['claude', 'codex'] as const;
const DEFAULT_CODEX_LOOP_MODEL = 'gpt-5.3-codex';

function isSupportedLoopCli(value: string): value is (typeof SUPPORTED_LOOP_CLIS)[number] {
  return SUPPORTED_LOOP_CLIS.includes(value as (typeof SUPPORTED_LOOP_CLIS)[number]);
}

function scriptSupportsCliFlags(scriptPath: string): boolean {
  try {
    const script = readFileSync(scriptPath, 'utf-8');
    return script.includes('--cli') && script.includes('--review-cli');
  } catch {
    return false;
  }
}

function getModelDisplayLabel(
  modelOverride: string | undefined,
  codingCli: 'claude' | 'codex',
  reviewCli: 'claude' | 'codex',
  config: RalphConfig
): string {
  if (modelOverride) return modelOverride;
  if (codingCli === 'codex' && reviewCli === 'codex') return DEFAULT_CODEX_LOOP_MODEL;
  if (codingCli === 'claude' && reviewCli === 'claude') return config.loop.defaultModel;
  return `${config.loop.defaultModel} (claude) / ${DEFAULT_CODEX_LOOP_MODEL} (codex)`;
}

/**
 * Find the feature-loop.sh script
 * Checks: 1) .ralph/scripts/ 2) ralph/ (parent ralph repo)
 */
function findFeatureLoopScript(projectRoot: string): string | null {
  // Check .ralph/scripts first
  const localScript = join(projectRoot, '.ralph', 'scripts', 'feature-loop.sh');
  if (existsSync(localScript)) {
    return localScript;
  }

  // Check for ralph directory as sibling (development setup)
  const siblingRalph = join(projectRoot, '..', 'ralph', 'feature-loop.sh');
  if (existsSync(siblingRalph)) {
    return siblingRalph;
  }

  // Check for ralph directory as parent (when running from within ralph-cli)
  const parentRalph = join(projectRoot, 'feature-loop.sh');
  if (existsSync(parentRalph)) {
    return parentRalph;
  }

  return null;
}

/**
 * Validate that the spec file exists
 */
async function validateSpecFile(projectRoot: string, feature: string): Promise<string | null> {
  const config = await loadConfigWithDefaults(projectRoot);
  const specsDir = config.paths.specs;

  // Check various possible spec locations
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
 * Run the feature development loop for a specific feature
 */
export async function runCommand(feature: string, options: RunOptions = {}): Promise<void> {
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

  logger.info(`Running feature loop for: ${pc.bold(feature)}`);
  console.log('');

  // Check for config
  if (!hasConfig(projectRoot)) {
    logger.warn('No ralph.config.cjs found. Run "wiggum init" first to configure your project.');
    logger.info('Attempting to run with default settings...');
    console.log('');
  }

  // Load config
  const config = await loadConfigWithDefaults(projectRoot);

  // Validate spec file exists (skip when resuming — spec lives on the feature branch)
  let specFile: string | null = null;
  if (options.resume) {
    // Best-effort: find it if it's here, but don't fail
    specFile = await validateSpecFile(projectRoot, feature);
  } else {
    specFile = await validateSpecFile(projectRoot, feature);
    if (!specFile) {
      logger.error(`Spec file not found: ${feature}.md`);
      logger.info(`Create the spec first: wiggum new ${feature}`);
      logger.info(`Expected location: ${join(projectRoot, config.paths.specs, `${feature}.md`)}`);
      process.exit(1);
    }
  }

  if (specFile) {
    logger.info(`Found spec: ${specFile}`);
  }

  // Find the feature-loop.sh script
  const scriptPath = findFeatureLoopScript(projectRoot);
  if (!scriptPath) {
    logger.error('feature-loop.sh script not found');
    logger.info('The script should be in .ralph/scripts/ or the ralph/ directory');
    logger.info('Run "wiggum init" to generate the necessary scripts');
    process.exit(1);
  }

  logger.info(`Using script: ${scriptPath}`);
  console.log('');

  // Build command arguments
  const args: string[] = [feature];

  // Add max iterations
  const maxIterations = options.maxIterations ?? config.loop.maxIterations;
  args.push(String(maxIterations));

  // Add max E2E attempts
  const maxE2eAttempts = options.maxE2eAttempts ?? config.loop.maxE2eAttempts;
  args.push(String(maxE2eAttempts));

  // Add flags
  if (options.worktree) {
    args.push('--worktree');
  }

  if (options.resume) {
    args.push('--resume');
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  // Resolve and validate coding CLI
  const codingCli = options.cli ?? config.loop.codingCli ?? 'claude';
  if (!isSupportedLoopCli(codingCli)) {
    logger.error(`Invalid CLI '${codingCli}'. Allowed values are 'claude' or 'codex'.`);
    process.exit(1);
  }

  // Resolve and validate review CLI
  const reviewCli = options.reviewCli ?? config.loop.reviewCli ?? codingCli;
  if (!isSupportedLoopCli(reviewCli)) {
    logger.error(`Invalid review CLI '${reviewCli}'. Allowed values are 'claude' or 'codex'.`);
    process.exit(1);
  }

  // Guard against stale generated scripts that don't support CLI flags.
  if ((codingCli !== 'claude' || reviewCli !== 'claude') && !scriptSupportsCliFlags(scriptPath)) {
    logger.error('The current feature-loop.sh does not support --cli/--review-cli flags.');
    logger.info('Regenerate scripts with "wiggum init" (or re-run /init), then retry.');
    process.exit(1);
  }

  args.push('--cli', codingCli);
  args.push('--review-cli', reviewCli);

  // Resolve and validate reviewMode
  const reviewMode: string = options.reviewMode ?? config.loop.reviewMode ?? 'manual';

  if (reviewMode !== 'manual' && reviewMode !== 'auto' && reviewMode !== 'merge') {
    logger.error(`Invalid reviewMode '${reviewMode}'. Allowed values are 'manual', 'auto', or 'merge'.`);
    process.exit(1);
  }

  args.push('--review-mode', reviewMode);

  // Display configuration
  console.log(pc.cyan('--- Run Configuration ---'));
  console.log(`  Feature: ${pc.bold(feature)}`);
  console.log(`  Spec: ${specFile ?? '(on feature branch)'}`);

  console.log(`  Max Iterations: ${maxIterations}`);
  console.log(`  Max E2E Attempts: ${maxE2eAttempts}`);
  console.log(`  Model: ${getModelDisplayLabel(options.model, codingCli, reviewCli, config)}`);
  console.log(`  Implementation CLI: ${codingCli}`);
  console.log(`  Review CLI: ${reviewCli}`);
  console.log(`  Review Mode: ${reviewMode}`);
  console.log(`  Worktree: ${options.worktree ? 'enabled' : 'disabled'}`);
  console.log(`  Resume: ${options.resume ? 'enabled' : 'disabled'}`);
  console.log('');

  // Execute the feature-loop.sh script
  logger.info('Starting feature loop...');
  console.log('');

  const scriptDir = dirname(scriptPath);

  return new Promise((resolve, reject) => {
    try {
      const child = spawn('bash', [scriptPath, ...args], {
        cwd: scriptDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          // Pass config paths to script
          RALPH_CONFIG_ROOT: config.paths.root,
          RALPH_SPEC_DIR: config.paths.specs,
          RALPH_SCRIPTS_DIR: config.paths.scripts,
        },
      });

      child.on('error', (error) => {
        logger.error(`Failed to start feature loop: ${error.message}`);
        if (process.env.DEBUG) {
          console.error(error.stack);
        }
        reject(error);
      });

      child.on('close', (code) => {
        console.log('');
        if (code === 0) {
          logger.success('Feature loop completed successfully!');
          resolve();
        } else if (code === 130) {
          // SIGINT (Ctrl+C)
          logger.info('Feature loop interrupted by user');
          resolve();
        } else {
          logger.error(`Feature loop exited with code: ${code}`);
          logger.info('Use --resume to continue from where you left off');
          process.exitCode = code || 1;
          resolve();
        }
      });
    } catch (error) {
      logger.error(`Unexpected error starting feature loop: ${error instanceof Error ? error.message : String(error)}`);
      if (process.env.DEBUG && error instanceof Error) {
        console.error(error.stack);
      }
      reject(error);
    }
  });
}
