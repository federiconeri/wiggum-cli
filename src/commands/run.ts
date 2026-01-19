/**
 * Run Command
 * Executes the feature development loop for a specific feature
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  maxIterations?: number;
  maxE2eAttempts?: number;
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
    logger.warn('No ralph.config.js found. Run "ralph init" first to configure your project.');
    logger.info('Attempting to run with default settings...');
    console.log('');
  }

  // Load config
  const config = await loadConfigWithDefaults(projectRoot);

  // Validate spec file exists
  const specFile = await validateSpecFile(projectRoot, feature);
  if (!specFile) {
    logger.error(`Spec file not found: ${feature}.md`);
    logger.info(`Create the spec first: ralph new ${feature}`);
    logger.info(`Expected location: ${join(projectRoot, config.paths.specs, `${feature}.md`)}`);
    process.exit(1);
  }

  logger.info(`Found spec: ${specFile}`);

  // Find the feature-loop.sh script
  const scriptPath = findFeatureLoopScript(projectRoot);
  if (!scriptPath) {
    logger.error('feature-loop.sh script not found');
    logger.info('The script should be in .ralph/scripts/ or the ralph/ directory');
    logger.info('Run "ralph init" to generate the necessary scripts');
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

  // Display configuration
  console.log(pc.cyan('--- Run Configuration ---'));
  console.log(`  Feature: ${pc.bold(feature)}`);
  console.log(`  Spec: ${specFile}`);
  console.log(`  Max Iterations: ${maxIterations}`);
  console.log(`  Max E2E Attempts: ${maxE2eAttempts}`);
  console.log(`  Model: ${options.model || config.loop.defaultModel}`);
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
          reject(new Error(`Feature loop exited with code: ${code || 1}`));
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
