import { ToolLoopAgent } from 'ai';
import { MemoryStore } from './memory/store.js';
import { ingestStrategicDocs } from './memory/ingest.js';
import { createBacklogTools } from './tools/backlog.js';
import { createMemoryTools, REFLECT_TOOL_NAME } from './tools/memory.js';
import { createExecutionTools } from './tools/execution.js';
import { createReportingTools } from './tools/reporting.js';
import { createIntrospectionTools } from './tools/introspection.js';
import { createDryRunExecutionTools, createDryRunReportingTools } from './tools/dry-run.js';
import type { AgentConfig } from './types.js';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { getTracedAI } from '../utils/tracing.js';

export const AGENT_SYSTEM_PROMPT = `You are wiggum's autonomous development agent. You work through the GitHub issue backlog, shipping features one at a time.

## Workflow

1. Read memory to recall previous work and context
2. List open issues and reason about what to work on next
   - Consider: PM priority labels (P0 > P1 > P2), dependencies, strategic context
3. For the chosen issue:
   a. Read the full issue details
   b. Generate a spec using generateSpec (creates spec via the interview agent)
   c. Run the development loop using runLoop (spawns Claude Code)
   d. Monitor progress with checkLoopStatus and readLoopLog
   e. Report results by commenting on the issue
4. Reflect on the outcome:
   - Call reflectOnWork with structured observations
   - Note what worked, what failed, any patterns discovered
   - Write additional project_knowledge entries if needed
5. Repeat from step 2 with enriched memory

## Prioritization

Use hybrid reasoning: respect PM labels (P0 > P1 > P2) but apply your own judgment for ordering within the same priority tier. Consider:
- Dependencies between issues (does one unblock another?)
- Strategic context from memory
- What you learned from previous iterations
- Issue size and complexity

## When to stop

Stop the loop when:
- Backlog has no more actionable open issues
- You've completed the maximum number of items (if configured)
- A critical failure requires human attention
- The user has signaled to stop

## Learning

After each issue, always call reflectOnWork. Your memory entries make you progressively better at this specific codebase. Be specific and narrative in what you record. Focus on: what patterns work here, what gotchas exist, which approaches produce better specs and fewer loop iterations.

## Error recovery

If spec generation fails: retry once with simplified goals. If it fails again, skip the issue and comment explaining why.
If a loop fails: reflect on what went wrong, comment on the issue, and move to the next issue.
Never get stuck on a single issue — always make forward progress.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentOrchestrator = ToolLoopAgent<never, any, any>;

export function buildConstraints(config: AgentConfig): string {
  const lines: string[] = [];
  if (config.maxItems != null) {
    lines.push(`- You MUST stop after completing ${config.maxItems} issue(s). Call reflectOnWork for each, then stop.`);
  }
  if (config.labels?.length) {
    lines.push(`- Only work on issues with these labels: ${config.labels.join(', ')}. Ignore all others.`);
  }
  if (config.dryRun) {
    lines.push('- DRY RUN MODE: Plan what you would do but do NOT execute. Execution and reporting tools return simulated results.');
  }
  return lines.length > 0
    ? `\n\n## Constraints\n\n${lines.join('\n')}`
    : '';
}

export function createAgentOrchestrator(config: AgentConfig): AgentOrchestrator {
  const { model, projectRoot, owner, repo } = config;
  const memoryDir = join(projectRoot, '.ralph', 'agent');
  const store = new MemoryStore(memoryDir);

  const backlog = createBacklogTools(owner, repo, {
    defaultLabels: config.labels,
  });
  const memory = createMemoryTools(store);
  const execution = config.dryRun
    ? createDryRunExecutionTools()
    : createExecutionTools(projectRoot);
  const reporting = config.dryRun
    ? createDryRunReportingTools()
    : createReportingTools(owner, repo);
  const introspection = createIntrospectionTools(projectRoot);

  const tools = {
    ...backlog,
    ...memory,
    ...execution,
    ...reporting,
    ...introspection,
  };

  const constraints = buildConstraints(config);
  const fullPrompt = AGENT_SYSTEM_PROMPT + constraints;
  const completedIssues = new Set<number>();
  const maxSteps = config.maxSteps ?? 200;

  // Use traced ToolLoopAgent so Braintrust automatically captures
  // all LLM calls, tool executions, and agent steps.
  const { ToolLoopAgent: TracedToolLoopAgent } = getTracedAI();

  return new TracedToolLoopAgent({
    model,
    instructions: fullPrompt,
    tools,
    stopWhen: ({ steps }) => {
      if (steps.length >= maxSteps) return true;
      if (config.maxItems != null && completedIssues.size >= config.maxItems) return true;
      return false;
    },
    prepareStep: async ({ steps }) => {
      try {
        if (steps.length === 0) {
          await ingestStrategicDocs(projectRoot, store);
          await store.prune();
        }

        const all = await store.read({ limit: 50 });
        const recentLogs = all.filter(e => e.type === 'work_log').slice(0, 5);
        const knowledge = all.filter(e => e.type === 'project_knowledge').slice(0, 3);
        const decisions = all.filter(e => e.type === 'decision').slice(0, 2);
        const strategic = all.filter(e => e.type === 'strategic_context').slice(0, 1);

        const memoryContext = [
          ...recentLogs.map(e => `[work] ${e.content}`),
          ...knowledge.map(e => `[knowledge] ${e.content}`),
          ...decisions.map(e => `[decision] ${e.content}`),
          ...strategic.map(e => `[strategy] ${e.content}`),
        ].join('\n');

        if (!memoryContext) return undefined;

        return {
          system: [
            fullPrompt,
            `## Current Memory\n\n${memoryContext}`,
          ].join('\n\n'),
        };
      } catch (err) {
        logger.warn(`prepareStep failed, continuing without memory: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    },
    onStepFinish: async ({ toolCalls, toolResults }) => {
      try {
        for (const tc of toolCalls) {
          if (tc.toolName === REFLECT_TOOL_NAME) {
            const issueNumber = (tc.input as { issueNumber?: number })?.issueNumber;
            if (issueNumber != null) {
              completedIssues.add(issueNumber);
            }
          }
        }

        config.onStepUpdate?.({
          toolCalls: toolCalls.map((tc) => ({ toolName: tc.toolName, args: tc.input })),
          toolResults: toolResults.map((tr) => ({ toolName: tr.toolName, result: tr.output })),
          completedItems: completedIssues.size,
        });
      } catch (err) {
        logger.warn(`onStepFinish failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
