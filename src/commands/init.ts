/**
 * Init Command
 * Initialize Ralph in the current project - scans and generates configuration
 */

import { logger } from '../utils/logger.js';
import { Scanner, formatScanResult, type ScanResult } from '../scanner/index.js';
import { Generator, formatGenerationResult } from '../generator/index.js';
import {
  AIEnhancer,
  formatAIAnalysis,
  type AIProvider,
  type EnhancedScanResult,
} from '../ai/index.js';
import { hasApiKey, getApiKeyEnvVar, getAvailableProvider, AVAILABLE_MODELS } from '../ai/providers.js';
import * as prompts from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { simpson, sectionHeader, drawLine } from '../utils/colors.js';

export interface InitOptions {
  ai?: boolean;
  provider?: AIProvider;
  yes?: boolean;
}

/**
 * Initialize Ralph in the current project
 * Scans the project and generates configuration
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();

  logger.info('Initializing Ralph...');
  logger.info(`Project: ${projectRoot}`);
  console.log('');

  // Step 1: Scan the project
  const spinner = prompts.spinner();
  spinner.start('Scanning project...');

  const scanner = new Scanner();
  let scanResult: ScanResult;

  try {
    scanResult = await scanner.scan(projectRoot);
    spinner.stop('Project scanned successfully');
  } catch (error) {
    spinner.stop('Scan failed');
    logger.error(`Failed to scan project: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Display scan results
  console.log('');
  console.log(simpson.yellow('─── Scan Results ───'));
  console.log(formatScanResult(scanResult));
  console.log('');

  // Step 2: AI Enhancement
  let enhancedResult: EnhancedScanResult | undefined;
  let useAI = options.ai;
  let provider: AIProvider = options.provider || 'anthropic';

  // Ask about AI enhancement if not specified via --ai flag and not in --yes mode
  if (!options.ai && !options.yes) {
    const wantAI = await prompts.confirm({
      message: 'Enable AI-enhanced analysis?',
      initialValue: true,
    });

    if (prompts.isCancel(wantAI)) {
      logger.info('Initialization cancelled');
      return;
    }

    useAI = wantAI;
  }

  if (useAI) {
    // Check if we have an API key for the selected provider or any provider
    let hasKey = options.provider ? hasApiKey(options.provider) : !!getAvailableProvider();

    // If no API key found, prompt for one
    if (!hasKey) {
      console.log('');
      console.log(simpson.pink('No API key found for AI enhancement.'));
      console.log('');

      // Ask which provider to use
      const providerChoice = await prompts.select({
        message: 'Which AI provider would you like to use?',
        options: [
          { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'recommended' },
          { value: 'openai', label: 'OpenAI (GPT-4)' },
          { value: 'openrouter', label: 'OpenRouter' },
        ],
      });

      if (prompts.isCancel(providerChoice)) {
        logger.info('Initialization cancelled');
        return;
      }

      provider = providerChoice as AIProvider;
      const envVar = getApiKeyEnvVar(provider);

      // Prompt for API key
      const apiKeyInput = await prompts.password({
        message: `Enter your ${envVar}:`,
      });

      if (prompts.isCancel(apiKeyInput) || !apiKeyInput) {
        logger.warn('No API key provided, skipping AI enhancement');
        useAI = false;
      } else {
        // Set the API key in process.env for current session
        process.env[envVar] = apiKeyInput;
        hasKey = true;

        // Offer to save to .env.local
        const saveKey = await prompts.confirm({
          message: 'Save API key to .env.local?',
          initialValue: true,
        });

        if (!prompts.isCancel(saveKey) && saveKey) {
          const envLocalPath = path.join(projectRoot, '.env.local');
          let envContent = '';

          // Read existing content if file exists
          if (fs.existsSync(envLocalPath)) {
            envContent = fs.readFileSync(envLocalPath, 'utf-8');
            // Check if key already exists
            const keyRegex = new RegExp(`^${envVar}=.*$`, 'm');
            if (keyRegex.test(envContent)) {
              // Replace existing key
              envContent = envContent.replace(keyRegex, `${envVar}=${apiKeyInput}`);
            } else {
              // Append new key
              envContent = envContent.trimEnd() + '\n' + `${envVar}=${apiKeyInput}\n`;
            }
          } else {
            envContent = `${envVar}=${apiKeyInput}\n`;
          }

          fs.writeFileSync(envLocalPath, envContent);
          logger.success(`API key saved to .env.local`);
        }
      }
    } else if (!options.provider) {
      // If we have a key but no provider specified, use the available one
      provider = getAvailableProvider() || 'anthropic';
    }

    // Run AI enhancement if we have a key
    if (useAI && hasKey) {
      // Ask which model to use
      const modelOptions = AVAILABLE_MODELS[provider];
      const modelChoice = await prompts.select({
        message: 'Which model would you like to use?',
        options: modelOptions.map(m => ({
          value: m.value,
          label: m.label,
          hint: m.hint,
        })),
      });

      if (prompts.isCancel(modelChoice)) {
        logger.info('Initialization cancelled');
        return;
      }

      const selectedModel = modelChoice as string;
      const modelLabel = modelOptions.find(m => m.value === selectedModel)?.label || selectedModel;

      console.log('');
      console.log(simpson.yellow(`─── AI Enhancement (${provider} / ${modelLabel}) ───`));

      const aiEnhancer = new AIEnhancer({
        provider,
        model: selectedModel,
        verbose: true,
      });

      spinner.start('Running AI analysis...');

      try {
        enhancedResult = await aiEnhancer.enhance(scanResult);

        if (enhancedResult.aiEnhanced && enhancedResult.aiAnalysis) {
          spinner.stop('AI analysis complete');
          console.log('');
          console.log(formatAIAnalysis(enhancedResult.aiAnalysis));

          // Use enhanced result for generation
          scanResult = enhancedResult;
        } else if (enhancedResult.aiError) {
          spinner.stop('AI analysis failed');
          logger.warn(`AI enhancement error: ${enhancedResult.aiError}`);
          console.log('');
        }
      } catch (error) {
        spinner.stop('AI analysis failed');
        logger.warn(`AI enhancement error: ${error instanceof Error ? error.message : String(error)}`);
        console.log('');
      }
    }
  }

  // Step 3: Confirm with user (unless --yes)
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

  // Step 4: Generate configuration files
  console.log('');
  spinner.start('Generating configuration files...');

  const generator = new Generator({
    existingFiles: 'backup',
    generateConfig: true,
    verbose: false,
  });

  try {
    const generationResult = await generator.generate(scanResult);
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
