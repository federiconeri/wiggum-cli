import { ToolLoopAgent } from 'ai';
import { MemoryStore } from './memory/store.js';
import { ingestStrategicDocs } from './memory/ingest.js';
import { createBacklogTools } from './tools/backlog.js';
import { createMemoryTools, REFLECT_TOOL_NAME } from './tools/memory.js';
import { createExecutionTools } from './tools/execution.js';
import { createReportingTools } from './tools/reporting.js';
import { createIntrospectionTools } from './tools/introspection.js';
import { createDryRunExecutionTools, createDryRunReportingTools, createDryRunFeatureStateTools } from './tools/dry-run.js';
import { createFeatureStateTools } from './tools/feature-state.js';
import type { AgentConfig } from './types.js';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { getTracedAI } from '../utils/tracing.js';

export const AGENT_SYSTEM_PROMPT = `You are wiggum's autonomous development agent. You work through the GitHub issue backlog, shipping features one at a time.

## Workflow

1. Read memory to recall previous work and context
   - Use listStrategicDocs to see available project documentation
   - Use readStrategicDoc to read full documents relevant to the current task (architecture, design, implementation plans)
2. List open issues and cross-reference with memory
   - Consider: PM priority labels (P0 > P1 > P2), dependencies, strategic context
   - **Housekeeping — close completed issues:** If memory says an issue was already completed (outcome "success" or "skipped") but it's still open, close it immediately with closeIssue before picking new work. Reflect with outcome "skipped" for each. This does NOT count against maxItems.
   - **Housekeeping — recover incomplete closures:** If memory says an issue was completed but assessFeatureState shows no merged PR (recommendation is NOT "pr_merged" or "linked_pr_merged"), the issue was closed prematurely. Reopen it with commentOnIssue explaining why, and prioritize it as your next work item. Run the loop with resume: true to complete the PR phase.
3. For the chosen issue (one NOT already completed):
   a. Read the full issue details
   b. Derive a featureName from the issue title (lowercase, hyphens, no spaces)
   c. **Assess feature state** using assessFeatureState — MANDATORY before any action
   d. Follow the Feature State Decision Tree based on the recommendation field
   e. Monitor progress with checkLoopStatus and readLoopLog
   f. Report results by commenting on the issue

## Feature State Decision Tree

After calling assessFeatureState, follow the recommendation:

| recommendation | action |
|---|---|
| start_fresh | generateSpec → runLoop (fresh) |
| generate_plan | runLoop without resume (spec exists, needs planning) |
| resume_implementation | runLoop with resume: true (plan has pending tasks) |
| resume_pr_phase | runLoop with resume: true (all tasks done, needs PR) |
| pr_exists_open | Comment on issue, do NOT re-run loop |
| pr_merged | Verify PR is merged, close issue with closeIssue, reflect with outcome "skipped", move on |
| pr_closed | Decide: restart from scratch or skip |
| linked_pr_merged | Verify the linked PR is merged, close issue with closeIssue (comment "shipped via PR #N"), reflect with outcome "skipped", move on |
| linked_pr_open | Work in progress under a different branch — comment "in progress via PR #N", do NOT re-run loop |

**Critical:**
- When recommendation is resume_implementation or resume_pr_phase, you MUST pass resume: true to runLoop
- When recommendation is generate_plan, do NOT pass resume (fresh branch needed)
- When recommendation is start_fresh, generate a spec first, then run the loop without resume
- ALWAYS pass issueNumber to assessFeatureState so it can detect work shipped under a different branch name
- Derive short, stable feature names (2-4 words, kebab-case) from the issue title — e.g. "config-module" not "config-module-toml-read-write-with-secret-masking"
4. After the loop completes (successfully or with failure):
   - Call assessFeatureState to check the actual state — do NOT rely solely on loop log output
   - Only close the issue if assessFeatureState confirms a PR was merged (recommendation: "pr_merged" or "linked_pr_merged")
   - When closing: check off acceptance criteria with checkAllBoxes, then close with closeIssue
   - If the loop produced code but no PR was created/merged, run the loop again with resume: true to trigger the PR phase
   - If the loop failed and code exists on the branch without a PR, this is incomplete work — do NOT close the issue
5. Reflect on the outcome:
   - Call reflectOnWork with structured observations
   - Use outcome "skipped" for issues that were already complete (no real work done) — these do NOT count against maxItems
   - Use outcome "success"/"partial"/"failure" for issues where real work was performed
   - Note what worked, what failed, any patterns discovered
6. Repeat from step 2 with enriched memory

## Model forwarding

When calling generateSpec, ALWAYS forward the model and provider so the spec generation uses the same AI model as this agent session. The values are provided in the Runtime Config section below.

Do NOT forward model/provider to runLoop — the development loop uses Claude Code internally, which has its own model configuration (opus for planning, sonnet for implementation). Passing a non-Claude model would break the loop.

When calling runLoop, pass the reviewMode from the Runtime Config below (if configured). This controls how the loop handles the PR phase:
- 'manual': stop at PR creation (default)
- 'auto': create PR + run automated review (no merge)
- 'merge': create PR + review + merge if approved

## Prioritization

Use hybrid reasoning: respect PM labels (P0 > P1 > P2) but apply your own judgment for ordering within the same priority tier.

**Ordering rules (in priority order):**
1. PM priority labels: P0 > P1 > P2 > unlabeled
2. Explicit dependencies: if readIssue returns a \`dependsOn\` array (parsed from "depends on #N" / "blocked by #N" in the issue body), complete those issues first
3. Lower-numbered issues first: within the same priority tier, prefer lower issue numbers — they are typically more foundational (scaffolding, setup, core infrastructure)
4. Strategic context from memory and what you learned from previous iterations

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
If a loop fails:
1. ALWAYS call readLoopLog to get the actual log content
2. Your issue comment MUST quote or summarize what the log says — do NOT speculate or guess the cause
3. Call assessFeatureState to check if a PR was merged despite the loop failure
4. If assessFeatureState shows "pr_merged" or "linked_pr_merged" → close the issue (the work shipped)
5. If assessFeatureState shows "resume_pr_phase" → the code exists but no PR was created. Run the loop again with resume: true to create and merge the PR. Do NOT close the issue yet.
6. If the log says "already complete" but no PR is merged, the work is stranded on a branch — resume the loop to ship it
7. If runLoop returns status "already_complete", verify with assessFeatureState before closing
8. Reflect on what happened, then move to the next issue
Never close an issue without verifying the code is merged to main. Loop log evidence alone is not sufficient.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentOrchestrator = ToolLoopAgent<never, any, any>;

export function buildRuntimeConfig(config: AgentConfig): string {
  const lines: string[] = [];
  if (config.modelId) lines.push(`- model: ${config.modelId}`);
  if (config.provider) lines.push(`- provider: ${config.provider}`);
  if (config.reviewMode) lines.push(`- reviewMode: ${config.reviewMode}`);
  return lines.length > 0
    ? `\n\n## Runtime Config\n\n${lines.join('\n')}`
    : '';
}

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
  const memory = createMemoryTools(store, projectRoot);
  const execution = config.dryRun
    ? createDryRunExecutionTools()
    : createExecutionTools(projectRoot, { onProgress: config.onProgress });
  const reporting = config.dryRun
    ? createDryRunReportingTools()
    : createReportingTools(owner, repo);
  const introspection = createIntrospectionTools(projectRoot);
  const featureState = config.dryRun
    ? createDryRunFeatureStateTools()
    : createFeatureStateTools(projectRoot);

  const tools = {
    ...backlog,
    ...memory,
    ...execution,
    ...reporting,
    ...introspection,
    ...featureState,
  };

  const constraints = buildConstraints(config);
  const runtimeConfig = buildRuntimeConfig(config);
  const fullPrompt = AGENT_SYSTEM_PROMPT + runtimeConfig + constraints;
  const completedIssues = new Set<number>();
  const maxSteps = config.maxSteps ?? 200;

  // Use traced ToolLoopAgent so Braintrust automatically captures
  // all LLM calls, tool executions, and agent steps.
  const { ToolLoopAgent: TracedToolLoopAgent } = getTracedAI();

  return new TracedToolLoopAgent({
    model,
    instructions: fullPrompt,
    tools,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'agent-orchestrator',
      metadata: { owner, repo, dryRun: String(config.dryRun ?? false) },
    },
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
        // Strategic docs are injected as lightweight catalog entries (filename + summary).
        // The agent reads full content on-demand via readStrategicDoc tool.
        const strategic = all.filter(e => e.type === 'strategic_context');

        const memoryContext = [
          ...recentLogs.map(e => `[work] ${e.content}`),
          ...knowledge.map(e => `[knowledge] ${e.content}`),
          ...decisions.map(e => `[decision] ${e.content}`),
          ...strategic.map(e => `[strategic-doc] ${e.content}`),
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
            const input = tc.input as { issueNumber?: number; outcome?: string };
            if (input.issueNumber != null && input.outcome !== 'skipped') {
              completedIssues.add(input.issueNumber);
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
