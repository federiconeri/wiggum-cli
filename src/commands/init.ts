/**
 * Init Command
 * Initialize Ralph in the current project - BYOK multi-agent AI analysis
 */

import { logger } from '../utils/logger.js';
import { Scanner, type ScanResult } from '../scanner/index.js';
import { Generator, formatGenerationResult } from '../generator/index.js';
import {
  AIEnhancer,
  formatAIAnalysis,
  type AIProvider,
  type EnhancedScanResult,
} from '../ai/index.js';
import {
  hasApiKey,
  getApiKeyEnvVar,
  getAvailableProvider,
  AVAILABLE_MODELS,
  OPTIONAL_SERVICE_ENV_VARS,
  hasTavilyKey,
  hasContext7Key,
} from '../ai/providers.js';
import * as prompts from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { simpson, sectionHeader, drawLine } from '../utils/colors.js';

export interface InitOptions {
  provider?: AIProvider;
  yes?: boolean;
}

/**
 * Save API keys to .env.local file
 */
function saveKeysToEnvLocal(
  projectRoot: string,
  keys: Record<string, string>
): void {
  const envLocalPath = path.join(projectRoot, '.env.local');
  let envContent = '';

  // Read existing content if file exists
  if (fs.existsSync(envLocalPath)) {
    envContent = fs.readFileSync(envLocalPath, 'utf-8');
  }

  // Update or add each key
  for (const [envVar, value] of Object.entries(keys)) {
    if (!value) continue;

    const keyRegex = new RegExp(`^${envVar}=.*$`, 'm');
    if (keyRegex.test(envContent)) {
      // Replace existing key
      envContent = envContent.replace(keyRegex, `${envVar}=${value}`);
    } else {
      // Append new key
      envContent = envContent.trimEnd() + (envContent ? '\n' : '') + `${envVar}=${value}\n`;
    }
  }

  fs.writeFileSync(envLocalPath, envContent);
}

/**
 * Get the default model for a provider (the one marked as 'recommended' or first)
 */
function getDefaultModel(provider: AIProvider): string {
  const models = AVAILABLE_MODELS[provider];
  const recommended = models.find(m => m.hint?.includes('recommended'));
  return recommended?.value || models[0].value;
}

/**
 * BYOK Flow: Collect API keys from user
 */
async function collectApiKeys(
  projectRoot: string,
  options: InitOptions
): Promise<{
  provider: AIProvider;
  model: string;
  tavilyKey?: string;
  context7Key?: string;
} | null> {
  // Check if we already have an LLM key
  let provider: AIProvider = options.provider || 'anthropic';
  const existingProvider = getAvailableProvider();
  let hadLlmKeyBefore = options.provider ? hasApiKey(options.provider) : !!existingProvider;
  let llmKeyEnteredThisSession = false;

  if (!hadLlmKeyBefore) {
    // In --yes mode, fail if no API key is available
    if (options.yes) {
      logger.error('No API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.');
      return null;
    }

    // Need to collect LLM API key interactively
    console.log('');
    console.log(simpson.yellow('─── API Key Setup ───'));
    console.log('');
    console.log('Ralph uses AI to analyze your codebase and generate configuration.');
    console.log('');

    // Select provider
    const providerChoice = await prompts.select({
      message: 'Select your AI provider:',
      options: [
        { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'recommended' },
        { value: 'openai', label: 'OpenAI (GPT-4/5)' },
        { value: 'openrouter', label: 'OpenRouter', hint: 'multiple providers' },
      ],
    });

    if (prompts.isCancel(providerChoice)) {
      return null;
    }

    provider = providerChoice as AIProvider;
    const envVar = getApiKeyEnvVar(provider);

    // Get API key
    const apiKeyInput = await prompts.password({
      message: `Enter your ${envVar}:`,
    });

    if (prompts.isCancel(apiKeyInput) || !apiKeyInput) {
      logger.error('LLM API key is required to use Ralph.');
      return null;
    }

    // Set in process.env for this session
    process.env[envVar] = apiKeyInput;
    llmKeyEnteredThisSession = true;
  } else if (!options.provider) {
    // Use the available provider
    provider = existingProvider || 'anthropic';
  }

  // Select model (skip in --yes mode, use default)
  let selectedModel: string;

  if (options.yes) {
    selectedModel = getDefaultModel(provider);
  } else {
    const modelOptions = AVAILABLE_MODELS[provider];
    const modelChoice = await prompts.select({
      message: 'Select model:',
      options: modelOptions.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.hint,
      })),
    });

    if (prompts.isCancel(modelChoice)) {
      return null;
    }

    selectedModel = modelChoice as string;
  }

  // Collect optional Tavily API key (skip in --yes mode)
  let tavilyKey: string | undefined;
  let tavilyKeyEnteredThisSession = false;

  if (hasTavilyKey()) {
    tavilyKey = process.env[OPTIONAL_SERVICE_ENV_VARS.tavily];
  } else if (!options.yes) {
    console.log('');
    console.log(pc.dim('Tavily enables web search for current best practices (optional)'));

    const tavilyInput = await prompts.password({
      message: `Enter ${OPTIONAL_SERVICE_ENV_VARS.tavily} (press Enter to skip):`,
    });

    if (!prompts.isCancel(tavilyInput) && tavilyInput) {
      tavilyKey = tavilyInput;
      tavilyKeyEnteredThisSession = true;
      process.env[OPTIONAL_SERVICE_ENV_VARS.tavily] = tavilyInput;
    }
  }

  // Collect optional Context7 API key (skip in --yes mode)
  let context7Key: string | undefined;
  let context7KeyEnteredThisSession = false;

  if (hasContext7Key()) {
    context7Key = process.env[OPTIONAL_SERVICE_ENV_VARS.context7];
  } else if (!options.yes) {
    console.log(pc.dim('Context7 enables documentation lookup for your stack (optional)'));

    const context7Input = await prompts.password({
      message: `Enter ${OPTIONAL_SERVICE_ENV_VARS.context7} (press Enter to skip):`,
    });

    if (!prompts.isCancel(context7Input) && context7Input) {
      context7Key = context7Input;
      context7KeyEnteredThisSession = true;
      process.env[OPTIONAL_SERVICE_ENV_VARS.context7] = context7Input;
    }
  }

  // Save keys entered this session to .env.local
  const keysToSave: Record<string, string> = {};

  if (llmKeyEnteredThisSession) {
    const llmEnvVar = getApiKeyEnvVar(provider);
    keysToSave[llmEnvVar] = process.env[llmEnvVar]!;
  }
  if (tavilyKeyEnteredThisSession && tavilyKey) {
    keysToSave[OPTIONAL_SERVICE_ENV_VARS.tavily] = tavilyKey;
  }
  if (context7KeyEnteredThisSession && context7Key) {
    keysToSave[OPTIONAL_SERVICE_ENV_VARS.context7] = context7Key;
  }

  if (Object.keys(keysToSave).length > 0) {
    // In --yes mode, auto-save keys
    if (options.yes) {
      saveKeysToEnvLocal(projectRoot, keysToSave);
      logger.success('API keys saved to .env.local');
    } else {
      const saveKeys = await prompts.confirm({
        message: 'Save API keys to .env.local?',
        initialValue: true,
      });

      if (!prompts.isCancel(saveKeys) && saveKeys) {
        saveKeysToEnvLocal(projectRoot, keysToSave);
        logger.success('API keys saved to .env.local');
      }
    }
  }

  return {
    provider,
    model: selectedModel,
    tavilyKey,
    context7Key,
  };
}

/**
 * Initialize Ralph in the current project
 * Uses BYOK (Bring Your Own Keys) model with multi-agent AI analysis
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();

  logger.info('Initializing Ralph...');
  logger.info(`Project: ${projectRoot}`);
  console.log('');

  // Step 1: Collect API keys (BYOK)
  const apiKeys = await collectApiKeys(projectRoot, options);

  if (!apiKeys) {
    // In --yes mode, null means missing API key (hard failure)
    // In interactive mode, null means user cancelled
    if (options.yes) {
      process.exit(1);
    }
    logger.info('Initialization cancelled');
    return;
  }

  // Step 2: Scan the project (background)
  const spinner = prompts.spinner();
  spinner.start('Scanning project...');

  const scanner = new Scanner();
  let scanResult: ScanResult;

  try {
    scanResult = await scanner.scan(projectRoot);
    spinner.stop('Project scanned');
  } catch (error) {
    spinner.stop('Scan failed');
    logger.error(`Failed to scan project: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Step 3: Run multi-agent AI analysis
  console.log('');
  const modelLabel = AVAILABLE_MODELS[apiKeys.provider].find(m => m.value === apiKeys.model)?.label || apiKeys.model;

  // Show capabilities status
  const capabilities: string[] = ['Codebase Analysis'];
  if (apiKeys.tavilyKey) capabilities.push('Web Research');
  if (apiKeys.context7Key) capabilities.push('Doc Lookup');

  console.log(simpson.yellow(`─── AI Analysis (${apiKeys.provider} / ${modelLabel}) ───`));
  console.log(pc.dim(`Capabilities: ${capabilities.join(' • ')}`));
  console.log('');

  spinner.start('Running AI analysis...');

  const aiEnhancer = new AIEnhancer({
    provider: apiKeys.provider,
    model: apiKeys.model,
    verbose: true,
    agentic: true, // Always use agentic mode for deeper analysis
    tavilyApiKey: apiKeys.tavilyKey,
    context7ApiKey: apiKeys.context7Key,
  });

  let enhancedResult: EnhancedScanResult;

  try {
    enhancedResult = await aiEnhancer.enhance(scanResult);

    if (enhancedResult.aiEnhanced && enhancedResult.aiAnalysis) {
      spinner.stop('AI analysis complete');
      console.log('');
      console.log(formatAIAnalysis(enhancedResult.aiAnalysis));
    } else if (enhancedResult.aiError) {
      spinner.stop('AI analysis failed');
      logger.warn(`AI error: ${enhancedResult.aiError}`);
      console.log('');

      // Fall back to basic scan result
      enhancedResult = { ...scanResult, aiEnhanced: false };
    }
  } catch (error) {
    spinner.stop('AI analysis failed');
    logger.warn(`AI error: ${error instanceof Error ? error.message : String(error)}`);
    console.log('');

    // Fall back to basic scan result
    enhancedResult = { ...scanResult, aiEnhanced: false };
  }

  // Step 4: Confirm with user (unless --yes)
  if (!options.yes) {
    const shouldContinue = await prompts.confirm({
      message: 'Generate Ralph configuration files?',
      initialValue: true,
    });

    if (prompts.isCancel(shouldContinue) || !shouldContinue) {
      logger.info('Initialization cancelled');
      return;
    }
  }

  // Step 5: Generate configuration files
  console.log('');
  spinner.start('Generating configuration files...');

  const generator = new Generator({
    existingFiles: 'backup',
    generateConfig: true,
    verbose: false,
  });

  try {
    const generationResult = await generator.generate(enhancedResult);
    spinner.stop('Configuration files generated');

    console.log('');
    console.log(simpson.yellow('─── Generation Results ───'));
    console.log(formatGenerationResult(generationResult));

    if (generationResult.success) {
      console.log('');
      logger.success('Ralph initialized successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Review the generated files in .ralph/');
      console.log('  2. Customize the prompts in .ralph/prompts/');
      console.log('  3. Run "ralph new <feature>" to create a feature spec');
      console.log('  4. Run "ralph run <feature>" to start development');
    } else {
      logger.warn('Initialization completed with some errors');
    }
  } catch (error) {
    spinner.stop('Generation failed');
    logger.error(`Failed to generate files: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
