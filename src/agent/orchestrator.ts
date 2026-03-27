import { ToolLoopAgent } from 'ai';
import { join } from 'node:path';
import { MemoryStore } from './memory/store.js';
import { ingestStrategicDocs } from './memory/ingest.js';
import { createBacklogTools } from './tools/backlog.js';
import { createMemoryTools, REFLECT_TOOL_NAME } from './tools/memory.js';
import { createExecutionTools } from './tools/execution.js';
import { createReportingTools } from './tools/reporting.js';
import { createIntrospectionTools } from './tools/introspection.js';
import { createDryRunExecutionTools, createDryRunFeatureStateTools, createDryRunReportingTools } from './tools/dry-run.js';
import { createFeatureStateTools } from './tools/feature-state.js';
import type { AgentConfig, AgentIssueState, AgentStepEvent, BacklogCandidate } from './types.js';
import { buildRankedBacklog, createSchedulerRunCache, invalidateSchedulerRunCache, toIssueStates } from './scheduler.js';
import { logger } from '../utils/logger.js';
import { getTracedAI } from '../utils/tracing.js';

export const AGENT_SYSTEM_PROMPT = `You are wiggum's per-issue autonomous development worker.

You are given exactly one backlog issue that has already been selected by a higher-level orchestrator. Your job is to ship that issue or perform the required housekeeping for it. Do not select another issue.

## Workflow

1. Read memory and strategic docs to recover relevant context.
2. Read the selected issue in full.
3. Derive a short kebab-case feature name from the issue title.
4. Call assessFeatureState before taking any action.
5. Follow the feature-state decision tree:
   - start_fresh -> generateSpec -> runLoop
   - generate_plan -> runLoop without resume
   - resume_implementation -> runLoop with resume: true
   - resume_pr_phase -> runLoop with resume: true
   - pr_exists_open / linked_pr_open -> comment and stop
   - pr_merged / linked_pr_merged -> check boxes, close issue, reflect with outcome "skipped", stop
6. After every runLoop:
   - readLoopLog
   - assessFeatureState again
   - create blocker issues for pre-existing/systemic failures when needed
   - only close the issue if work is merged
7. Always call reflectOnWork before stopping.

## Important rules

- You must stay within the selected issue.
- You must pass issueNumber to assessFeatureState.
- You must pass resume: true for resume_implementation and resume_pr_phase.
- You must forward Runtime Config values using the tool schemas:
  - pass model and provider to generateSpec when they are set
  - pass reviewMode to runLoop when it is set
- You must not close an issue unless assessFeatureState confirms merged work.
- If a loop fails, quote or summarize readLoopLog evidence in your issue comment. Do not guess.
- You may use listIssues(labels: ["bug"]) only for blocker detection and duplicate checking.
- Your only text response is a brief final summary after the selected issue is fully handled.`;

export interface AgentOrchestrator {
  readonly version: 'agent-v1';
  readonly id: string | undefined;
  readonly tools: Record<string, unknown>;
  generate(options: { prompt: string | unknown[]; abortSignal?: AbortSignal; timeout?: unknown }): Promise<{ text?: string }>;
  stream(options: { prompt: string | unknown[]; abortSignal?: AbortSignal; timeout?: unknown; experimental_transform?: unknown }): Promise<{ textStream: AsyncIterable<string> }>;
}

interface WorkerOutcomeTracker {
  outcome: 'success' | 'partial' | 'failure' | 'skipped' | 'unknown';
  reflected: boolean;
}

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
    lines.push(`- Stop after completing ${config.maxItems} issue(s).`);
  }
  if (config.labels?.length) {
    lines.push(`- Initial backlog scope is limited to labels: ${config.labels.join(', ')}.`);
  }
  if (config.issues?.length) {
    lines.push(`- Initial backlog scope is limited to issues: ${config.issues.map(n => `#${n}`).join(', ')}.`);
  }
  if (config.dryRun) {
    lines.push('- DRY RUN MODE: execution and reporting tools are simulated.');
  }
  return lines.length > 0
    ? `\n\n## Constraints\n\n${lines.join('\n')}`
    : '';
}

function mapToolResults(toolResults: Array<{ toolName: string; output: unknown }>) {
  return toolResults.map((tr) => ({ toolName: tr.toolName, result: tr.output }));
}

function createWorkerStepHandler(config: AgentConfig, tracker: WorkerOutcomeTracker) {
  return async ({ toolCalls, toolResults }: { toolCalls: Array<{ toolName: string; input: unknown }>; toolResults: Array<{ toolName: string; output: unknown }> }) => {
    try {
      for (const tc of toolCalls) {
        if (tc.toolName === REFLECT_TOOL_NAME && toolResults.some(tr => tr.toolName === REFLECT_TOOL_NAME)) {
          const input = tc.input as { outcome?: WorkerOutcomeTracker['outcome'] };
          tracker.outcome = input.outcome ?? 'unknown';
          tracker.reflected = true;
        }
      }

      const stepEvent: AgentStepEvent = {
        toolCalls: toolCalls.map((tc) => ({ toolName: tc.toolName, args: tc.input })),
        toolResults: mapToolResults(toolResults),
        completedItems: tracker.outcome !== 'unknown' ? 1 : 0,
      };

      config.onStepUpdate?.(stepEvent);
    } catch (err) {
      logger.warn(`worker onStepFinish failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

function createWorkerAgent(config: AgentConfig, store: MemoryStore) {
  const backlog = createBacklogTools(config.owner, config.repo, {
    defaultLabels: config.labels,
    issueNumbers: config.issues,
    scopeListIssuesToIssueNumbers: false,
    scopeReadIssueToIssueNumbers: true,
  });
  const memory = createMemoryTools(store, config.projectRoot);
  const execution = config.dryRun
    ? createDryRunExecutionTools()
    : createExecutionTools(config.projectRoot, { onProgress: config.onProgress });
  const reporting = config.dryRun
    ? createDryRunReportingTools()
    : createReportingTools(config.owner, config.repo);
  const introspection = createIntrospectionTools(config.projectRoot);
  const featureState = config.dryRun
    ? createDryRunFeatureStateTools()
    : createFeatureStateTools(config.projectRoot);

  const tools = {
    ...backlog,
    ...memory,
    ...execution,
    ...reporting,
    ...introspection,
    ...featureState,
  };

  const fullPrompt = AGENT_SYSTEM_PROMPT + buildRuntimeConfig(config) + buildConstraints(config);
  const tracker: WorkerOutcomeTracker = { outcome: 'unknown', reflected: false };
  const { ToolLoopAgent: TracedToolLoopAgent } = getTracedAI();

  const agent = new TracedToolLoopAgent({
    model: config.model,
    instructions: fullPrompt,
    tools,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'agent-worker',
      metadata: {
        owner: config.owner,
        repo: config.repo,
        dryRun: String(config.dryRun ?? false),
      },
    },
    stopWhen: ({ steps }) => steps.length >= (config.maxSteps ?? 200),
    prepareStep: async ({ steps }) => {
      try {
        if (steps.length === 0) {
          await ingestStrategicDocs(config.projectRoot, store);
          await store.prune();
        }

        const all = await store.read({ limit: 50 });
        const memoryContext = all
          .map((entry) => `[${entry.type}] ${entry.content}`)
          .join('\n');

        if (!memoryContext) return undefined;
        return {
          system: [fullPrompt, `## Current Memory\n\n${memoryContext}`].join('\n\n'),
        };
      } catch (err) {
        logger.warn(`worker prepareStep failed, continuing without memory: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    },
    onStepFinish: createWorkerStepHandler(config, tracker),
  });

  return { agent, tools, tracker };
}

function formatSelectionReasons(issue: AgentIssueState): string {
  const reasons = issue.selectionReasons ?? [];
  if (reasons.length === 0) return 'No additional scheduler rationale.';
  return reasons
    .slice(0, 5)
    .map((reason) => `- ${reason.message}`)
    .join('\n');
}

function buildWorkerPrompt(issue: BacklogCandidate): string {
  return `Selected issue:

#${issue.issueNumber}: ${issue.title}
Labels: ${issue.labels.join(', ') || 'none'}
Priority: ${issue.priorityTier ?? 'unlabeled'}
Actionability: ${issue.actionability ?? 'ready'}
Current recommendation: ${issue.recommendation ?? 'unknown'}
Feature name: ${issue.loopFeatureName ?? 'feature'}

Scheduler rationale:
${formatSelectionReasons(issue)}

Issue body:
${issue.body}

You must fully handle this selected issue and then stop.`;
}

interface ProcessedIssueSummary {
  issue: AgentIssueState;
  outcome: WorkerOutcomeTracker['outcome'];
}

function buildFinalSummary(processed: ProcessedIssueSummary[], blocked: AgentIssueState[]): string {
  const lines = [`Processed ${processed.length} issue(s).`];
  const byOutcome = new Map<WorkerOutcomeTracker['outcome'], number[]>();
  for (const item of processed) {
    const issues = byOutcome.get(item.outcome) ?? [];
    issues.push(item.issue.issueNumber);
    byOutcome.set(item.outcome, issues);
  }
  const orderedOutcomes: Array<{ outcome: WorkerOutcomeTracker['outcome']; label: string }> = [
    { outcome: 'success', label: 'Completed' },
    { outcome: 'partial', label: 'Partial' },
    { outcome: 'failure', label: 'Failed' },
    { outcome: 'skipped', label: 'Skipped' },
    { outcome: 'unknown', label: 'Unknown' },
  ];
  for (const { outcome, label } of orderedOutcomes) {
    const issues = byOutcome.get(outcome);
    if (issues?.length) {
      lines.push(`${label}: ${issues.map(issueNumber => `#${issueNumber}`).join(', ')}`);
    }
  }
  if (blocked.length > 0) {
    lines.push(`Blocked: ${blocked.map(issue => `#${issue.issueNumber} (${issue.actionability})`).join(', ')}`);
  }
  return lines.join('\n');
}

async function* oneChunk(text: string): AsyncGenerator<string> {
  if (text) {
    yield text;
  }
}

class StructuredAgentOrchestrator implements AgentOrchestrator {
  readonly version = 'agent-v1' as const;
  readonly id = 'agent-orchestrator';
  readonly tools: Record<string, unknown>;

  constructor(private readonly config: AgentConfig) {
    const memoryDir = join(config.projectRoot, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);
    this.tools = createWorkerAgent(config, store).tools;
  }

  private emit(event: Parameters<NonNullable<AgentConfig['onOrchestratorEvent']>>[0]) {
    this.config.onOrchestratorEvent?.(event);
  }

  private async run(options: { abortSignal?: AbortSignal }): Promise<string> {
    const memoryDir = join(this.config.projectRoot, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);
    await ingestStrategicDocs(this.config.projectRoot, store);
    await store.prune();

    const processed: ProcessedIssueSummary[] = [];
    const attemptedThisRun = new Set<number>();
    let completedBudget = 0;
    let blockedSnapshot: AgentIssueState[] = [];
    const schedulerCache = createSchedulerRunCache();

    while (true) {
      if (options.abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      const ranked = await buildRankedBacklog(this.config, store, schedulerCache);
      if (ranked.errors.length > 0) {
        throw new Error(ranked.errors[0]);
      }
      const queueStates = toIssueStates(ranked.queue);
      blockedSnapshot = queueStates.filter(
        issue => issue.actionability !== 'ready'
          && issue.actionability !== 'housekeeping'
          && issue.actionability !== 'waiting_pr',
      );

      if (ranked.expansions.length > 0) {
        this.emit({ type: 'scope_expanded', expansions: ranked.expansions });
      }
      this.emit({ type: 'backlog_scanned', total: queueStates.length, issues: queueStates });
      for (const candidate of ranked.queue) {
        this.emit({ type: 'candidate_enriched', issue: {
          issueNumber: candidate.issueNumber,
          title: candidate.title,
          labels: candidate.labels,
          phase: candidate.phase,
          actionability: candidate.actionability,
          priorityTier: candidate.priorityTier,
          dependsOn: candidate.dependsOn,
          inferredDependsOn: candidate.inferredDependsOn,
          blockedBy: candidate.blockedBy,
          recommendation: candidate.recommendation,
          selectionReasons: candidate.selectionReasons,
          score: candidate.score,
          attemptState: candidate.attemptState,
          featureState: candidate.featureState,
          loopFeatureName: candidate.loopFeatureName,
        } });
        if (candidate.inferredDependencyEdges.length > 0) {
          this.emit({ type: 'dependencies_inferred', issueNumber: candidate.issueNumber, edges: candidate.inferredDependencyEdges });
        }
      }

      this.emit({ type: 'queue_ranked', queue: queueStates });
      for (const blocked of blockedSnapshot) {
        this.emit({ type: 'task_blocked', issue: blocked });
      }

      const next = ranked.actionable.find(candidate => !attemptedThisRun.has(candidate.issueNumber));
      if (!next) {
        return buildFinalSummary(processed, blockedSnapshot);
      }

      if (this.config.maxItems != null && completedBudget >= this.config.maxItems) {
        return buildFinalSummary(processed, blockedSnapshot);
      }

      const selected: AgentIssueState = {
        issueNumber: next.issueNumber,
        title: next.title,
        labels: next.labels,
        phase: 'planning',
        scopeOrigin: next.scopeOrigin,
        requestedBy: next.requestedBy,
        actionability: next.actionability,
        priorityTier: next.priorityTier,
        dependsOn: next.dependsOn,
        inferredDependsOn: next.inferredDependsOn,
        blockedBy: next.blockedBy,
        recommendation: next.recommendation,
        selectionReasons: next.selectionReasons,
        score: next.score,
        attemptState: next.attemptState,
        featureState: next.featureState,
        loopFeatureName: next.loopFeatureName,
      };
      attemptedThisRun.add(selected.issueNumber);

      this.emit({ type: 'task_selected', issue: selected });
      this.emit({ type: 'task_started', issue: selected });

      const workerConfig: AgentConfig = {
        ...this.config,
        issues: [selected.issueNumber],
        labels: undefined,
        maxItems: 1,
      };
      const { agent, tracker } = createWorkerAgent(workerConfig, store);

      try {
        const result = await agent.stream({
          prompt: buildWorkerPrompt(next),
          abortSignal: options.abortSignal,
        });

        for await (const _chunk of result.textStream) {
          // Worker text is surfaced only in the final returned summary.
        }
      } catch (err) {
        const failed: AgentIssueState = { ...selected, error: err instanceof Error ? err.message : String(err) };
        processed.push({ issue: failed, outcome: tracker.outcome });
        this.emit({ type: 'task_completed', issue: failed, outcome: tracker.outcome });
        throw err;
      }

      if (!tracker.reflected) {
        attemptedThisRun.delete(selected.issueNumber);
        throw new Error(`Worker stopped before calling reflectOnWork for issue #${selected.issueNumber}.`);
      }

      const completedIssue: AgentIssueState = {
        ...selected,
        phase: 'reflecting',
      };
      processed.push({ issue: completedIssue, outcome: tracker.outcome });
      this.emit({ type: 'task_completed', issue: completedIssue, outcome: tracker.outcome });
      if (tracker.outcome !== 'skipped' && selected.scopeOrigin !== 'dependency') {
        completedBudget += 1;
      }
      invalidateSchedulerRunCache(schedulerCache, [selected.issueNumber]);
    }
  }

  async generate(options: { prompt: string | unknown[]; abortSignal?: AbortSignal; timeout?: unknown }): Promise<{ text?: string }> {
    const text = await this.run({ abortSignal: options.abortSignal });
    return { text };
  }

  async stream(options: { prompt: string | unknown[]; abortSignal?: AbortSignal; timeout?: unknown; experimental_transform?: unknown }): Promise<{ textStream: AsyncIterable<string> }> {
    const text = await this.run({ abortSignal: options.abortSignal });
    return { textStream: oneChunk(text) };
  }
}

export function createAgentOrchestrator(config: AgentConfig): AgentOrchestrator {
  return new StructuredAgentOrchestrator(config);
}
