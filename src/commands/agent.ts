/**
 * Agent Command — Headless autonomous backlog executor
 *
 * Reads provider and model from ralph.config.cjs (set during wiggum init),
 * detects GitHub remote, creates the agent orchestrator, and runs it
 * in headless mode (generate or stream).
 */

import { logger } from '../utils/logger.js';
import {
  getAvailableProvider,
  getModel,
} from '../ai/providers.js';
import type { AIProvider } from '../ai/providers.js';
import { detectGitHubRemote } from '../utils/github.js';
import { loadConfigWithDefaults } from '../utils/config.js';
import {
  createAgentOrchestrator,
  type AgentOrchestrator,
} from '../agent/orchestrator.js';
import type { AgentConfig } from '../agent/types.js';

export interface AgentOptions {
  model?: string;
  maxItems?: number;
  maxSteps?: number;
  labels?: string[];
  dryRun?: boolean;
  stream?: boolean;
}

export async function agentCommand(options: AgentOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Resolve provider (CLI flag > config > env detection)
  const ralphConfig = await loadConfigWithDefaults(projectRoot);
  const configProvider = ralphConfig.agent.defaultProvider as AIProvider | undefined;
  const envProvider = getAvailableProvider();
  const provider = configProvider || envProvider;

  if (!provider) {
    console.error(
      'Error: No AI provider configured. Run `wiggum init` or set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.',
    );
    process.exit(1);
  }

  // 2. Detect GitHub remote
  const remote = await detectGitHubRemote(projectRoot);
  if (!remote) {
    console.error(
      'Error: No GitHub remote detected. Run from a repo with a GitHub origin.',
    );
    process.exit(1);
  }

  // 3. Resolve model (CLI flag > config > provider default)
  const modelId = options.model ?? ralphConfig.agent.defaultModel;
  const { model } = getModel(provider as AIProvider, modelId);

  // 4. Create orchestrator
  const agentConfig: AgentConfig = {
    model,
    projectRoot,
    owner: remote.owner,
    repo: remote.repo,
    maxSteps: options.maxSteps,
    maxItems: options.maxItems,
    labels: options.labels,
    dryRun: options.dryRun,
    onStepUpdate: (event) => {
      for (const tc of event.toolCalls) {
        logger.info(`[tool] ${tc.toolName}`);
      }
    },
  };

  const agent: AgentOrchestrator = createAgentOrchestrator(agentConfig);

  // 5. Run in headless mode
  logger.info(`Agent starting: ${remote.owner}/${remote.repo} with ${provider}/${modelId}`);

  if (options.stream) {
    const result = await agent.stream({ prompt: 'Begin working through the backlog.' });
    let text = '';
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
      text += chunk;
    }
    if (text) {
      process.stdout.write('\n');
    }
  } else {
    const result = await agent.generate({ prompt: 'Begin working through the backlog.' });
    if (result.text) {
      console.log(result.text);
    }
  }
}
