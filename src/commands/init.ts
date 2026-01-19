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
import * as prompts from '@clack/prompts';
import pc from 'picocolors';

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
  console.log(pc.cyan('--- Scan Results ---'));
  console.log(formatScanResult(scanResult));
  console.log('');

  // Step 2: AI Enhancement (if enabled)
  let enhancedResult: EnhancedScanResult | undefined;

  if (options.ai) {
    const provider = options.provider || 'anthropic';
    console.log(pc.cyan(`--- AI Enhancement (${provider}) ---`));

    const aiEnhancer = new AIEnhancer({
      provider,
      verbose: true,
    });

    // Check if API key is available
    if (!aiEnhancer.isAvailable()) {
      const envVar = aiEnhancer.getRequiredEnvVar();
      logger.warn(`AI enhancement skipped: ${envVar} not set`);
      logger.info(`To enable AI enhancement, set the ${envVar} environment variable`);
      console.log('');
    } else {
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
    console.log(pc.cyan('--- Generation Results ---'));
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
