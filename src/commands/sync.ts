/**
 * Headless Sync Command
 * Runs project scan + AI enhancement and persists context to .ralph/.context.json
 * CLI equivalent of the TUI /sync command, for non-interactive use.
 */

import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { Scanner } from '../scanner/index.js';
import { AIEnhancer } from '../ai/enhancer.js';
import {
  saveContext,
  toPersistedScanResult,
  toPersistedAIAnalysis,
  getGitMetadata,
} from '../context/index.js';
import {
  getAvailableProvider,
  AVAILABLE_MODELS,
  normalizeModelId,
} from '../ai/providers.js';

export async function syncCommand(): Promise<void> {
  const projectRoot = process.cwd();

  // Detect provider
  const provider = getAvailableProvider();
  if (!provider) {
    console.error(
      'Error: No AI provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.',
    );
    process.exit(1);
  }

  // Resolve model
  const recommendedModel = AVAILABLE_MODELS[provider].find(
    (m) => m.hint?.includes('recommended'),
  );
  const defaultModel = recommendedModel?.value ?? AVAILABLE_MODELS[provider][0].value;
  const model = normalizeModelId(provider, defaultModel);

  logger.info('Scanning project...');

  // Step 1: Scan
  const scanner = new Scanner();
  const scanResult = await scanner.scan(projectRoot);

  logger.info('Running AI analysis...');

  // Step 2: AI enhancement
  const enhancer = new AIEnhancer({
    provider,
    model,
    agentic: true,
  });
  const enhanced = await enhancer.enhance(scanResult);

  if (enhanced.aiError) {
    console.error(`Error: AI analysis failed: ${enhanced.aiError}`);
    process.exit(1);
  }

  // Step 3: Persist
  const git = await getGitMetadata(projectRoot);
  await saveContext(
    {
      lastAnalyzedAt: new Date().toISOString(),
      gitCommitHash: git.gitCommitHash,
      gitBranch: git.gitBranch,
      scanResult: toPersistedScanResult(enhanced),
      aiAnalysis: toPersistedAIAnalysis(enhanced.aiAnalysis),
    },
    projectRoot,
  );

  const contextPath = join(projectRoot, '.ralph', '.context.json');
  console.log(contextPath);
  process.exit(0);
}
