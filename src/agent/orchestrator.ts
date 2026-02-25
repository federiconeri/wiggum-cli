import { ToolLoopAgent, stepCountIs, type ToolSet } from 'ai';
import { MemoryStore } from './memory/store.js';
import { ingestStrategicDocs } from './memory/ingest.js';
import { createBacklogTools } from './tools/backlog.js';
import { createMemoryTools } from './tools/memory.js';
import { createExecutionTools } from './tools/execution.js';
import { createReportingTools } from './tools/reporting.js';
import { createIntrospectionTools } from './tools/introspection.js';
import type { AgentConfig } from './types.js';
import { join } from 'node:path';

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
export type AgentOrchestrator = ToolLoopAgent<any, any, any>;

export function createAgentOrchestrator(config: AgentConfig): AgentOrchestrator {
  const { model, projectRoot, owner, repo } = config;
  const memoryDir = join(projectRoot, '.ralph', 'agent');
  const store = new MemoryStore(memoryDir);

  const backlog = createBacklogTools(owner, repo);
  const memory = createMemoryTools(store);
  const execution = createExecutionTools(projectRoot);
  const reporting = createReportingTools(owner, repo);
  const introspection = createIntrospectionTools(projectRoot);

  const tools = {
    ...backlog,
    ...memory,
    ...execution,
    ...reporting,
    ...introspection,
  };

  return new ToolLoopAgent({
    model,
    instructions: AGENT_SYSTEM_PROMPT,
    tools,
    stopWhen: stepCountIs(config.maxSteps ?? 200),
    prepareStep: async ({ stepNumber }) => {
      if (stepNumber === 0) {
        await ingestStrategicDocs(projectRoot, store);
        await store.prune();
      }

      const recentLogs = await store.read({ type: 'work_log', limit: 5 });
      const knowledge = await store.read({ type: 'project_knowledge', limit: 3 });
      const decisions = await store.read({ type: 'decision', limit: 2 });
      const strategic = await store.read({ type: 'strategic_context', limit: 1 });

      const memoryContext = [
        ...recentLogs.map(e => `[work] ${e.content}`),
        ...knowledge.map(e => `[knowledge] ${e.content}`),
        ...decisions.map(e => `[decision] ${e.content}`),
        ...strategic.map(e => `[strategy] ${e.content}`),
      ].join('\n');

      if (!memoryContext) return undefined;

      return {
        system: [
          AGENT_SYSTEM_PROMPT,
          `## Current Memory\n\n${memoryContext}`,
        ].join('\n\n'),
      };
    },
    onStepFinish: async ({ toolCalls, toolResults }) => {
      config.onStepUpdate?.({
        toolCalls: toolCalls.map((tc) => ({ toolName: tc.toolName, args: tc.input })),
        toolResults: toolResults.map((tr) => ({ toolName: tr.toolName, result: tr.output })),
      });
    },
  });
}
