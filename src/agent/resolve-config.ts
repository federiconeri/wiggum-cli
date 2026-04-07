/**
 * Shared agent environment resolution
 *
 * Extracts provider, model, and GitHub remote detection into a reusable
 * function that **throws** on error (no process.exit). Used by both the
 * headless agent command and the TUI AgentScreen.
 */

import type { LanguageModel } from 'ai';
import {
  getAvailableProvider,
  getModel,
} from '../ai/providers.js';
import type { AIProvider } from '../ai/providers.js';
import { detectGitHubRemote } from '../utils/github.js';
import { loadConfigWithDefaults } from '../utils/config.js';
import type { ReviewMode } from './types.js';

const VALID_PROVIDERS: Set<string> = new Set(['anthropic', 'openai', 'openrouter']);

export interface ResolvedAgentEnv {
  provider: AIProvider;
  model: LanguageModel;
  modelId: string | undefined;
  owner: string;
  repo: string;
  projectRoot: string;
  reviewMode?: ReviewMode;
}

/**
 * Resolve provider, model, and GitHub remote for agent execution.
 * Throws descriptive errors instead of calling process.exit.
 */
export async function resolveAgentEnv(
  projectRoot: string,
  options?: { model?: string },
): Promise<ResolvedAgentEnv> {
  // 1. Resolve provider (config > env detection)
  const ralphConfig = await loadConfigWithDefaults(projectRoot);
  const configProvider = ralphConfig.agent.defaultProvider;
  const validConfigProvider = VALID_PROVIDERS.has(configProvider)
    ? (configProvider as AIProvider)
    : null;
  const provider = validConfigProvider || getAvailableProvider();

  if (!provider) {
    throw new Error(
      'No AI provider configured. Run `wiggum init` or set a supported provider API key.',
    );
  }

  // 2. Detect GitHub remote
  const remote = await detectGitHubRemote(projectRoot);
  if (!remote) {
    throw new Error(
      'No GitHub remote detected. Run from a repo with a GitHub origin.',
    );
  }

  // 3. Resolve model (CLI flag > config > provider default)
  const modelId = options?.model || ralphConfig.agent.defaultModel || undefined;
  const { model } = getModel(provider, modelId);

  return {
    provider,
    model,
    modelId,
    owner: remote.owner,
    repo: remote.repo,
    projectRoot,
  };
}
