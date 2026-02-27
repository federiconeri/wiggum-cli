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
import { initTracing, flushTracing, traced, currentSpan } from '../utils/tracing.js';

const VALID_PROVIDERS: Set<string> = new Set(['anthropic', 'openai', 'openrouter']);

export interface AgentOptions {
  model?: string;
  maxItems?: number;
  maxSteps?: number;
  labels?: string[];
  reviewMode?: 'manual' | 'auto' | 'merge';
  dryRun?: boolean;
  stream?: boolean;
}

export async function agentCommand(options: AgentOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Initialize Braintrust tracing (no-op if BRAINTRUST_API_KEY not set)
  initTracing();

  // 1. Resolve provider (config > env detection)
  const ralphConfig = await loadConfigWithDefaults(projectRoot);
  const configProvider = ralphConfig.agent.defaultProvider;
  const validConfigProvider = VALID_PROVIDERS.has(configProvider)
    ? (configProvider as AIProvider)
    : null;
  const provider = validConfigProvider || getAvailableProvider();

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
  const modelId = options.model || ralphConfig.agent.defaultModel || undefined;
  const { model } = getModel(provider, modelId);

  // 4. Create orchestrator
  const agentConfig: AgentConfig = {
    model,
    modelId: modelId ?? undefined,
    provider,
    projectRoot,
    owner: remote.owner,
    repo: remote.repo,
    maxSteps: options.maxSteps,
    maxItems: options.maxItems,
    labels: options.labels,
    reviewMode: options.reviewMode,
    dryRun: options.dryRun,
    onStepUpdate: (event) => {
      const log = options.stream
        ? (msg: string) => process.stdout.write(`${msg}\n`)
        : (msg: string) => logger.info(msg);
      for (const tc of event.toolCalls) {
        log(`[tool] ${tc.toolName}`);
      }
      for (const tr of event.toolResults) {
        const summary = typeof tr.result === 'object' && tr.result !== null
          ? (tr.result as Record<string, unknown>).status ?? (tr.result as Record<string, unknown>).success ?? 'done'
          : 'done';
        log(`[tool:done] ${tr.toolName} → ${summary}`);
      }
    },
    onProgress: (toolName, line) => {
      const log = options.stream
        ? (msg: string) => process.stdout.write(`${msg}\n`)
        : (msg: string) => logger.info(msg);
      log(`  [${toolName}] ${line}`);
    },
  };

  const agent: AgentOrchestrator = createAgentOrchestrator(agentConfig);

  // 5. Run in headless mode
  logger.info(`Agent starting: ${remote.owner}/${remote.repo} with ${provider}/${modelId ?? 'default'}`);

  try {
    await traced(async () => {
      currentSpan().log({
        input: {
          owner: remote.owner,
          repo: remote.repo,
          provider,
          model: modelId ?? 'default',
          maxItems: options.maxItems,
          maxSteps: options.maxSteps,
          labels: options.labels,
          dryRun: options.dryRun ?? false,
          stream: options.stream ?? false,
        },
        metadata: {
          command: 'agent',
          owner: remote.owner,
          repo: remote.repo,
          provider,
          model: modelId ?? 'default',
          dryRun: String(options.dryRun ?? false),
        },
        tags: ['agent'],
      });

      if (options.stream) {
        const result = await agent.stream({ prompt: 'Begin working through the backlog.' });
        let hasOutput = false;
        for await (const chunk of result.textStream) {
          process.stdout.write(chunk);
          hasOutput = true;
        }
        if (hasOutput) {
          process.stdout.write('\n');
        }
      } else {
        const result = await agent.generate({ prompt: 'Begin working through the backlog.' });
        if (result.text) {
          console.log(result.text);
        }
      }
    }, { name: 'agent-run' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Agent failed — ${message}`);
    process.exit(1);
  } finally {
    await flushTracing();
  }
}
