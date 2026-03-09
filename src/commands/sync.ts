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

/**
 * Pure sync logic — scans, enhances, persists context.
 * Returns the context file path on success. Throws on failure.
 * Safe to call from tools/agents (no process.exit).
 */
export async function syncProjectContext(projectRoot: string): Promise<string> {
  // Detect provider
  const provider = getAvailableProvider();
  if (!provider) {
    throw new Error('No AI provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.');
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
    throw new Error(`AI analysis failed: ${enhanced.aiError}`);
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

  return join(projectRoot, '.ralph', '.context.json');
}

/**
 * CLI entry point — wraps syncProjectContext with process.exit behavior.
 */
export async function syncCommand(): Promise<void> {
  let contextPath: string;
  try {
    contextPath = await syncProjectContext(process.cwd());
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return; // unreachable, but satisfies TS control flow
  }
  console.log(contextPath);
  process.exit(0);
}
