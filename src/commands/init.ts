/**
 * Init Command
 * Initialize Ralph in the current project - BYOK multi-agent AI analysis
 */

import { logger } from '../utils/logger.js';
import { Scanner, type ScanResult } from '../scanner/index.js';
import { Generator, type GenerationResult } from '../generator/index.js';
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
} from '../ai/providers.js';
import * as prompts from '@clack/prompts';
import fs from 'fs';
import path from 'path';
import {
  simpson,
  compactHeader,
  stackBox,
  fileTree,
  nextStepsBox,
} from '../utils/colors.js';
import { flushTracing } from '../utils/tracing.js';
import { createShimmerSpinner, type ShimmerSpinner } from '../utils/spinner.js';

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
 * BYOK Flow: Collect API keys from user (simplified - no optional keys)
 */
async function collectApiKeys(
  projectRoot: string,
  options: InitOptions
): Promise<{
  provider: AIProvider;
  model: string;
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
    console.log(compactHeader('API Key'));
    console.log('');

    // Select provider
    const providerChoice = await prompts.select({
      message: 'Select your AI provider:',
      options: [
        { value: 'anthropic', label: 'Anthropic', hint: 'recommended' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'openrouter', label: 'OpenRouter', hint: 'multiple providers' },
      ],
    });

    if (prompts.isCancel(providerChoice)) {
      return null;
    }

    provider = providerChoice as AIProvider;
    const envVar = getApiKeyEnvVar(provider);

    // Get API key with fixed-length mask display
    const apiKeyInput = await prompts.password({
      message: `Enter your ${envVar}:`,
      mask: '▪',
    });

    if (prompts.isCancel(apiKeyInput) || !apiKeyInput) {
      logger.error('API key is required to use Ralph.');
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

  // Save key entered this session to .env.local
  if (llmKeyEnteredThisSession) {
    const llmEnvVar = getApiKeyEnvVar(provider);
    const keysToSave: Record<string, string> = {
      [llmEnvVar]: process.env[llmEnvVar]!,
    };

    // In --yes mode, auto-save keys
    if (options.yes) {
      saveKeysToEnvLocal(projectRoot, keysToSave);
      logger.success('API key saved to .env.local');
    } else {
      console.log('');
      const saveKeys = await prompts.confirm({
        message: 'Save API key to .env.local?',
        initialValue: true,
      });

      if (!prompts.isCancel(saveKeys) && saveKeys) {
        saveKeysToEnvLocal(projectRoot, keysToSave);
        logger.success('API key saved to .env.local');
      }
    }
  }

  return {
    provider,
    model: selectedModel,
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

  // Step 1: Scan the project
  const scanSpinner = createShimmerSpinner({ showTimer: true, style: 'shimmer' });
  scanSpinner.start('Scanning project structure...');

  const scanner = new Scanner();
  let scanResult: ScanResult;

  try {
    scanResult = await scanner.scan(projectRoot);
    scanSpinner.stop('Project scanned');
  } catch (error) {
    scanSpinner.fail('Scan failed');
    logger.error(`Failed to scan project: ${error instanceof Error ? error.message : String(error)}`);
    await flushTracing();
    process.exit(1);
  }

  // Step 2: Show detected stack
  console.log('');
  const { stack } = scanResult;
  console.log(stackBox({
    framework: stack.framework ? `${stack.framework.name}${stack.framework.version ? ` ${stack.framework.version}` : ''}` : undefined,
    language: 'TypeScript', // Wiggum targets TypeScript projects
    testing: stack.testing?.unit?.name,
    packageManager: stack.packageManager?.name || 'npm',
  }));
  console.log('');

  // Step 3: Collect API keys (BYOK)
  const apiKeys = await collectApiKeys(projectRoot, options);

  if (!apiKeys) {
    // In --yes mode, null means missing API key (hard failure)
    // In interactive mode, null means user cancelled
    await flushTracing();
    if (options.yes) {
      process.exit(1);
    }
    logger.info('Initialization cancelled');
    return;
  }

  // Step 4: Run AI analysis
  console.log('');
  const modelLabel = AVAILABLE_MODELS[apiKeys.provider].find(m => m.value === apiKeys.model)?.label || apiKeys.model;

  console.log(compactHeader(`AI Analysis (${apiKeys.provider} / ${modelLabel})`));
  console.log('');

  // Use shimmer spinner with timer and token tracking for AI analysis
  const aiSpinner = createShimmerSpinner({ showTimer: true, showTokens: true, style: 'shimmer' });
  aiSpinner.start('Analyzing codebase...');

  const aiEnhancer = new AIEnhancer({
    provider: apiKeys.provider,
    model: apiKeys.model,
    verbose: false,
    agentic: true,
    onProgress: (phase, detail) => {
      if (detail) {
        aiSpinner.update(`${phase} - ${detail}`);
      } else {
        aiSpinner.update(phase);
      }
    },
  });

  let enhancedResult: EnhancedScanResult;

  try {
    enhancedResult = await aiEnhancer.enhance(scanResult);

    if (enhancedResult.aiEnhanced && enhancedResult.aiAnalysis) {
      // Set token usage on spinner before stopping
      if (enhancedResult.tokenUsage) {
        aiSpinner.setTokens(enhancedResult.tokenUsage);
      }
      aiSpinner.stop('AI analysis complete');
      console.log('');
      console.log(formatAIAnalysis(enhancedResult.aiAnalysis));
    } else if (enhancedResult.aiError) {
      aiSpinner.fail('AI analysis failed');
      logger.warn(`AI error: ${enhancedResult.aiError}`);
      console.log('');
      enhancedResult = { ...scanResult, aiEnhanced: false };
    }
  } catch (error) {
    aiSpinner.fail('AI analysis failed');
    logger.warn(`AI error: ${error instanceof Error ? error.message : String(error)}`);
    console.log('');
    enhancedResult = { ...scanResult, aiEnhanced: false };
  }

  // Step 5: Confirm with user (unless --yes)
  if (!options.yes) {
    const shouldContinue = await prompts.confirm({
      message: 'Generate Ralph configuration files?',
      initialValue: true,
    });

    if (prompts.isCancel(shouldContinue) || !shouldContinue) {
      await flushTracing();
      logger.info('Initialization cancelled');
      return;
    }
  }

  // Step 6: Generate configuration files
  console.log('');
  const genSpinner = createShimmerSpinner({ showTimer: true, style: 'shimmer' });
  genSpinner.start('Generating configuration files...');

  const generator = new Generator({
    existingFiles: 'backup',
    generateConfig: true,
    verbose: false,
  });

  try {
    const generationResult = await generator.generate(enhancedResult);
    genSpinner.stop('Configuration files generated');

    // Show file tree of what was generated
    console.log('');
    console.log(compactHeader('Generated Files'));
    console.log('');
    const generatedFiles = generationResult.writeSummary.results
      .filter((f: { action: string }) => f.action === 'created' || f.action === 'backed_up' || f.action === 'overwritten')
      .map((f: { path: string }) => {
        // Normalize absolute paths to relative paths within .ralph/
        const relativePath = path.relative(projectRoot, f.path);
        return relativePath.replace(/^\.ralph[\\/]/, '');
      });
    console.log(fileTree('.ralph', generatedFiles));

    // Flush tracing spans before completing
    await flushTracing();

    if (generationResult.success) {
      // Show next steps
      console.log(nextStepsBox([
        { command: 'ralph new my-feature', description: 'Create a feature specification' },
        { command: 'ralph run my-feature', description: 'Start the development loop' },
        { command: 'ralph monitor my-feature', description: 'Watch progress in real-time' },
      ]));

      console.log(`  ${simpson.brown('Documentation:')} .ralph/guides/AGENTS.md`);
      console.log('');
      logger.success('Ralph initialized successfully!');
    } else {
      logger.warn('Initialization completed with some errors');
    }
  } catch (error) {
    genSpinner.fail('Generation failed');
    logger.error(`Failed to generate files: ${error instanceof Error ? error.message : String(error)}`);
    await flushTracing();
    process.exit(1);
  }
}
