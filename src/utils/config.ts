/**
 * Configuration Utilities
 * Load and parse ralph.config.cjs files
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from './logger.js';

/**
 * Stack configuration in ralph.config.cjs
 */
export interface StackConfig {
  framework: {
    name: string;
    version?: string;
    variant?: string;
  };
  packageManager: string;
  testing: {
    unit: string;
    e2e: string;
  };
  styling: string;
}

/**
 * Commands configuration in ralph.config.cjs
 */
export interface CommandsConfig {
  dev: string;
  build: string;
  test: string;
  lint: string;
  typecheck: string;
}

/**
 * Paths configuration in ralph.config.cjs
 */
export interface PathsConfig {
  root: string;
  prompts: string;
  guides: string;
  specs: string;
  scripts: string;
  learnings: string;
  agents: string;
}

/**
 * Loop configuration in ralph.config.cjs
 */
export interface LoopConfig {
  maxIterations: number;
  maxE2eAttempts: number;
  defaultModel: string;
  planningModel: string;
  reviewMode: 'manual' | 'auto';
}

/**
 * Full ralph.config.cjs structure
 */
export interface RalphConfig {
  name: string;
  stack: StackConfig;
  commands: CommandsConfig;
  paths: PathsConfig;
  loop: LoopConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: RalphConfig = {
  name: 'project',
  stack: {
    framework: {
      name: 'unknown',
      version: undefined,
      variant: undefined,
    },
    packageManager: 'npm',
    testing: {
      unit: 'none',
      e2e: 'none',
    },
    styling: 'css',
  },
  commands: {
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint',
    typecheck: 'npm run typecheck',
  },
  paths: {
    root: '.ralph',
    prompts: '.ralph/prompts',
    guides: '.ralph/guides',
    specs: '.ralph/specs',
    scripts: '.ralph/scripts',
    learnings: '.ralph/LEARNINGS.md',
    agents: '.ralph/AGENTS.md',
  },
  loop: {
    maxIterations: 10,
    maxE2eAttempts: 5,
    defaultModel: 'sonnet',
    planningModel: 'opus',
    reviewMode: 'manual',
  },
};

/**
 * Load ralph.config.cjs from a project directory
 * Returns null if config file doesn't exist
 */
export async function loadConfig(projectRoot: string): Promise<RalphConfig | null> {
  const configPath = join(projectRoot, 'ralph.config.cjs');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    // Use dynamic import for ESM compatibility
    // Add timestamp to bust module cache for fresh config
    const configUrl = pathToFileURL(configPath).href + `?t=${Date.now()}`;
    const configModule = await import(configUrl);
    return (configModule.default || configModule) as RalphConfig;
  } catch (error) {
    logger.error(`Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Load config with defaults merged in
 */
export async function loadConfigWithDefaults(projectRoot: string): Promise<RalphConfig> {
  const config = await loadConfig(projectRoot);

  if (!config) {
    return DEFAULT_CONFIG;
  }

  // Deep merge with defaults
  return {
    name: config.name || DEFAULT_CONFIG.name,
    stack: {
      ...DEFAULT_CONFIG.stack,
      ...config.stack,
      framework: {
        ...DEFAULT_CONFIG.stack.framework,
        ...config.stack?.framework,
      },
      testing: {
        ...DEFAULT_CONFIG.stack.testing,
        ...config.stack?.testing,
      },
    },
    commands: {
      ...DEFAULT_CONFIG.commands,
      ...config.commands,
    },
    paths: {
      ...DEFAULT_CONFIG.paths,
      ...config.paths,
    },
    loop: {
      ...DEFAULT_CONFIG.loop,
      ...config.loop,
    },
  };
}

/**
 * Check if a ralph config exists in the project
 */
export function hasConfig(projectRoot: string): boolean {
  const configPath = join(projectRoot, 'ralph.config.cjs');
  return existsSync(configPath);
}

/**
 * Get the ralph root directory from config or default
 */
export async function getRalphRoot(projectRoot: string): Promise<string> {
  const config = await loadConfig(projectRoot);
  return config?.paths?.root || '.ralph';
}

/**
 * Get the specs directory from config or default
 */
export async function getSpecsDir(projectRoot: string): Promise<string> {
  const config = await loadConfig(projectRoot);
  return config?.paths?.specs || '.ralph/specs';
}

/**
 * Get the scripts directory from config or default
 */
export async function getScriptsDir(projectRoot: string): Promise<string> {
  const config = await loadConfig(projectRoot);
  return config?.paths?.scripts || '.ralph/scripts';
}

/**
 * Get loop settings with defaults
 */
export async function getLoopSettings(projectRoot: string): Promise<LoopConfig> {
  const config = await loadConfig(projectRoot);
  return {
    maxIterations: config?.loop?.maxIterations || DEFAULT_CONFIG.loop.maxIterations,
    maxE2eAttempts: config?.loop?.maxE2eAttempts || DEFAULT_CONFIG.loop.maxE2eAttempts,
    defaultModel: config?.loop?.defaultModel || DEFAULT_CONFIG.loop.defaultModel,
    planningModel: config?.loop?.planningModel || DEFAULT_CONFIG.loop.planningModel,
    reviewMode: config?.loop?.reviewMode || DEFAULT_CONFIG.loop.reviewMode,
  };
}
