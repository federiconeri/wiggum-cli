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
import { detectGitHubRemote, runGitHubDiagnostics } from '../utils/github.js';

export interface AgentOptions {
  model?: string;
  maxItems?: number;
  maxSteps?: number;
  labels?: string[];
  issues?: number[];
  reviewMode?: 'manual' | 'auto' | 'merge';
  dryRun?: boolean;
  stream?: boolean;
  diagnoseGh?: boolean;
}

export async function agentCommand(options: AgentOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  if (options.diagnoseGh) {
    const repo = await detectGitHubRemote(projectRoot);
    if (!repo) {
      console.error('Error: No GitHub remote detected. Run this inside a git repo with an origin remote.');
      process.exit(1);
    }

    const diagnostics = await runGitHubDiagnostics(repo.owner, repo.repo, options.issues?.[0]);
    for (const check of diagnostics.checks) {
      const status = check.ok ? 'OK' : 'FAIL';
      console.log(`[diagnose-gh] ${status} ${check.name}: ${check.message}`);
    }

    if (!diagnostics.success) {
      process.exit(1);
    }
    return;
  }

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
    issues: options.issues,
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
    onOrchestratorEvent: (event) => {
      const log = options.stream
        ? (msg: string) => process.stdout.write(`${msg}\n`)
        : (msg: string) => logger.info(msg);

      switch (event.type) {
        case 'scope_expanded':
          log(`[orchestrator] expanded scope with ${event.expansions.map(expansion => `#${expansion.issueNumber}`).join(', ')}`);
          break;
        case 'queue_ranked':
          log(`[orchestrator] ranked ${event.queue.length} issue(s)`);
          break;
        case 'task_selected': {
          const reason = event.issue.selectionReasons?.[0]?.message;
          log(`[orchestrator] selected #${event.issue.issueNumber}${reason ? ` — ${reason}` : ''}`);
          break;
        }
        case 'task_blocked':
          log(`[orchestrator] blocked #${event.issue.issueNumber} — ${event.issue.blockedBy?.[0]?.reason ?? event.issue.actionability ?? 'blocked'}`);
          break;
        case 'task_completed':
          log(`[orchestrator] completed #${event.issue.issueNumber} (${event.outcome})`);
          break;
        default:
          break;
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
    if (message.includes('GitHub') || message.includes('gh ')) {
      console.error(`Hint: run 'wiggum agent --diagnose-gh${options.issues?.length ? ` --issues ${options.issues.join(',')}` : ''}' to inspect GitHub connectivity.`);
    }
    process.exit(1);
  } finally {
    await flushTracing();
  }
}
