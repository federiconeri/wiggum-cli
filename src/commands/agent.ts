/**
 * Agent Command — Headless autonomous backlog executor
 *
 * Reads provider and model from ralph.config.cjs (set during wiggum init),
 * detects GitHub remote, creates the agent orchestrator, and runs it
 * in headless mode (generate or stream).
 */

import { logger } from '../utils/logger.js';
import {
  createAgentOrchestrator,
  type AgentOrchestrator,
} from '../agent/orchestrator.js';
import { resolveAgentEnv } from '../agent/resolve-config.js';
import type { AgentConfig } from '../agent/types.js';
import { initTracing, flushTracing, traced, currentSpan } from '../utils/tracing.js';

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

  // Resolve provider, model, and GitHub remote
  let env: Awaited<ReturnType<typeof resolveAgentEnv>>;
  try {
    env = await resolveAgentEnv(projectRoot, { model: options.model });
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { provider, model, modelId, owner, repo } = env;

  // 4. Create orchestrator
  const agentConfig: AgentConfig = {
    model,
    modelId: modelId ?? undefined,
    provider,
    projectRoot,
    owner,
    repo,
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
  logger.info(`Agent starting: ${owner}/${repo} with ${provider}/${modelId ?? 'default'}`);

  try {
    await traced(async () => {
      currentSpan().log({
        input: {
          owner,
          repo,
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
          owner,
          repo,
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
