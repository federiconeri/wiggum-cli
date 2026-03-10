/**
 * Config Command
 * Manage API keys and settings for Wiggum
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { logger } from '../utils/logger.js';
import { simpson } from '../utils/colors.js';
import type { SessionState } from '../repl/session-state.js';
import { getAvailableProvider, AVAILABLE_MODELS } from '../ai/providers.js';
import { writeKeysToEnvFile } from '../utils/env.js';
import { loadConfigWithDefaults, type RalphConfig } from '../utils/config.js';

/**
 * Supported services for API key configuration
 */
const CONFIGURABLE_SERVICES = {
  tavily: {
    envVar: 'TAVILY_API_KEY',
    description: 'Web search tool',
  },
  context7: {
    envVar: 'CONTEXT7_API_KEY',
    description: 'Documentation lookup',
  },
  braintrust: {
    envVar: 'BRAINTRUST_API_KEY',
    description: 'AI tracing and analytics',
  },
} as const;

type ConfigurableService = keyof typeof CONFIGURABLE_SERVICES;
type LoopCli = 'claude' | 'codex';
type LoopCliSetting = 'cli' | 'review-cli';
const LOOP_CLI_SETTINGS: readonly LoopCliSetting[] = ['cli', 'review-cli'] as const;
const LOOP_CLI_VALUES: readonly LoopCli[] = ['claude', 'codex'] as const;

/**
 * Check if a service API key is configured
 */
function isServiceConfigured(service: ConfigurableService): boolean {
  const envVar = CONFIGURABLE_SERVICES[service].envVar;
  return !!process.env[envVar];
}

/**
 * Save an API key to .ralph/.env.local file
 */
function saveKeyToEnvLocal(projectRoot: string, envVar: string, value: string): void {
  // Check that .ralph/ exists (project is initialized)
  const ralphDir = path.join(projectRoot, '.ralph');
  if (!fs.existsSync(ralphDir) || !fs.statSync(ralphDir).isDirectory()) {
    throw new Error('This project is not initialized. Run \'ralph init\' to set up .ralph/ before using \'ralph config set\'.');
  }

  const envLocalPath = path.join(ralphDir, '.env.local');
  writeKeysToEnvFile(envLocalPath, { [envVar]: value });
}

function toConfigFileContent(config: RalphConfig): string {
  const content = `module.exports = ${JSON.stringify(config, null, 2)};
`;

  return content
    .replace(/"(\w+)":/g, '$1:')
    .replace(/: "([^"]+)"/g, ": '$1'");
}

function normalizeLoopCliSetting(raw: string): LoopCliSetting | null {
  if (raw === 'cli') return 'cli';
  if (raw === 'review-cli' || raw === 'reviewCli') return 'review-cli';
  return null;
}

function isLoopCliValue(value: string): value is LoopCli {
  return LOOP_CLI_VALUES.includes(value as LoopCli);
}

async function saveLoopCliToConfig(projectRoot: string, setting: LoopCliSetting, value: LoopCli): Promise<void> {
  // Check that .ralph/ exists (project is initialized)
  const ralphDir = path.join(projectRoot, '.ralph');
  if (!fs.existsSync(ralphDir) || !fs.statSync(ralphDir).isDirectory()) {
    throw new Error('This project is not initialized. Run \'wiggum init\' before using loop CLI settings.');
  }

  const configPath = path.join(projectRoot, 'ralph.config.cjs');
  const config = await loadConfigWithDefaults(projectRoot);
  const nextConfig: RalphConfig = {
    ...config,
    loop: {
      ...config.loop,
      codingCli: setting === 'cli' ? value : config.loop.codingCli,
      reviewCli: setting === 'review-cli' ? value : config.loop.reviewCli,
    },
  };

  fs.writeFileSync(configPath, toConfigFileContent(nextConfig), 'utf-8');
}

/**
 * Display current configuration status
 */
function displayConfigStatus(state: SessionState): void {
  const provider = state.provider || getAvailableProvider() || 'not configured';
  const model = state.model || 'default';
  const modelLabel = provider !== 'not configured'
    ? AVAILABLE_MODELS[provider as keyof typeof AVAILABLE_MODELS]?.find(m => m.value === model)?.label || model
    : model;

  console.log('');
  console.log(simpson.yellow('Configuration'));
  console.log(pc.dim('─'.repeat(45)));
  console.log('');
  console.log(`  ${pc.bold('AI Provider:')}   ${provider}${provider !== 'not configured' ? ` (${modelLabel})` : ''}`);
  console.log('');
  console.log(`  ${pc.bold('Services:')}`);

  for (const [service, config] of Object.entries(CONFIGURABLE_SERVICES)) {
    const configured = isServiceConfigured(service as ConfigurableService);
    const status = configured
      ? pc.green('\u2713 configured')
      : pc.dim('\u2717 not configured');
    console.log(`    ${service.padEnd(12)} ${status}`);
  }

  console.log('');
  console.log(pc.dim('─'.repeat(45)));
  console.log('');
  console.log(pc.bold('Usage:'));
  console.log(`  ${simpson.yellow('/config set tavily')} ${pc.dim('<api-key>')}`);
  console.log(`  ${simpson.yellow('/config set context7')} ${pc.dim('<api-key>')}`);
  console.log(`  ${simpson.yellow('/config set braintrust')} ${pc.dim('<api-key>')}`);
  console.log(`  ${simpson.yellow('/config set cli')} ${pc.dim('<claude|codex>')}`);
  console.log(`  ${simpson.yellow('/config set review-cli')} ${pc.dim('<claude|codex>')}`);
  console.log('');
}

/**
 * Handle the /config command
 */
export async function handleConfigCommand(
  args: string[],
  state: SessionState
): Promise<SessionState> {
  // No args - show current configuration
  if (args.length === 0) {
    displayConfigStatus(state);
    return state;
  }

  const subcommand = args[0]?.toLowerCase();

  if (subcommand !== 'set') {
    logger.error(`Unknown subcommand: ${subcommand}. Usage: /config [set <service> <key>]`);
    return state;
  }

  // /config set <service> <key>
  if (args.length < 3) {
    logger.error('Usage: /config set <service> <value>');
    console.log('');
    console.log('Available services:');
    for (const [service, config] of Object.entries(CONFIGURABLE_SERVICES)) {
      console.log(`  ${service.padEnd(12)} ${pc.dim(config.description)}`);
    }
    for (const setting of LOOP_CLI_SETTINGS) {
      console.log(`  ${setting.padEnd(12)} ${pc.dim('Loop CLI setting')}`);
    }
    console.log('');
    return state;
  }

  const rawService = args[1]?.toLowerCase() ?? '';
  const apiKey = args[2];
  const loopCliSetting = normalizeLoopCliSetting(rawService);

  if (loopCliSetting) {
    if (!isLoopCliValue(apiKey)) {
      logger.error(`Invalid ${loopCliSetting} value: '${apiKey}'. Allowed values: ${LOOP_CLI_VALUES.join(', ')}`);
      return state;
    }

    try {
      await saveLoopCliToConfig(state.projectRoot, loopCliSetting, apiKey);
      logger.success(`${loopCliSetting} saved to ralph.config.cjs (${apiKey})`);
      console.log('');
    } catch (error) {
      logger.error(`Failed to save ${loopCliSetting}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return state;
  }

  const service = rawService as ConfigurableService;

  if (!(service in CONFIGURABLE_SERVICES)) {
    logger.error(`Unknown service: ${service}`);
    console.log('');
    console.log('Available services:');
    for (const [svc, config] of Object.entries(CONFIGURABLE_SERVICES)) {
      console.log(`  ${svc.padEnd(12)} ${pc.dim(config.description)}`);
    }
    for (const setting of LOOP_CLI_SETTINGS) {
      console.log(`  ${setting.padEnd(12)} ${pc.dim('Loop CLI setting')}`);
    }
    console.log('');
    return state;
  }

  const { envVar } = CONFIGURABLE_SERVICES[service];

  // Validate API key format (basic check)
  if (!apiKey || apiKey.length < 10) {
    logger.error('Invalid API key. Key appears too short.');
    return state;
  }

  try {
    // Save to .env.local
    saveKeyToEnvLocal(state.projectRoot, envVar, apiKey);

    // Also set in current process environment
    process.env[envVar] = apiKey;

    logger.success(`${envVar} saved to .ralph/.env.local`);
    console.log(pc.dim('Restart Wiggum to apply changes to tool availability.'));
    console.log('');
  } catch (error) {
    logger.error(`Failed to save API key: ${error instanceof Error ? error.message : String(error)}`);
  }

  return state;
}
