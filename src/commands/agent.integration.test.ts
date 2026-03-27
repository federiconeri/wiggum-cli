import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockResolveAgentEnv,
  mockMemoryStoreRead,
  mockMemoryStorePrune,
  mockIngestStrategicDocs,
  mockBuildRankedBacklog,
  mockCreateSchedulerRunCache,
  mockInvalidateSchedulerRunCache,
  mockToIssueStates,
  mockToolLoopStream,
  mockToolLoopState,
} = vi.hoisted(() => ({
  mockResolveAgentEnv: vi.fn(),
  mockMemoryStoreRead: vi.fn().mockResolvedValue([]),
  mockMemoryStorePrune: vi.fn().mockResolvedValue(0),
  mockIngestStrategicDocs: vi.fn().mockResolvedValue(0),
  mockBuildRankedBacklog: vi.fn(),
  mockCreateSchedulerRunCache: vi.fn(() => ({ issueDetails: new Map(), featureStates: new Map() })),
  mockInvalidateSchedulerRunCache: vi.fn(),
  mockToIssueStates: vi.fn((queue) => queue),
  mockToolLoopStream: vi.fn().mockResolvedValue({
    textStream: (async function* () {})(),
  }),
  mockToolLoopState: {
    outcomes: [] as Array<'success' | 'partial' | 'failure' | 'skipped'>,
    options: undefined as any,
  },
}));

vi.mock('../agent/resolve-config.js', () => ({
  resolveAgentEnv: mockResolveAgentEnv,
}));

vi.mock('../agent/memory/store.js', () => {
  class MockMemoryStore {
    read = mockMemoryStoreRead;
    prune = mockMemoryStorePrune;
  }
  return { MemoryStore: MockMemoryStore };
});

vi.mock('../agent/memory/ingest.js', () => ({
  ingestStrategicDocs: mockIngestStrategicDocs,
}));

vi.mock('../agent/scheduler.js', () => ({
  buildRankedBacklog: mockBuildRankedBacklog,
  createSchedulerRunCache: mockCreateSchedulerRunCache,
  invalidateSchedulerRunCache: mockInvalidateSchedulerRunCache,
  toIssueStates: mockToIssueStates,
}));

vi.mock('../agent/tools/backlog.js', () => ({
  createBacklogTools: vi.fn().mockReturnValue({}),
}));

vi.mock('../agent/tools/memory.js', () => ({
  createMemoryTools: vi.fn().mockReturnValue({}),
  REFLECT_TOOL_NAME: 'reflectOnWork',
}));

vi.mock('../agent/tools/execution.js', () => ({
  createExecutionTools: vi.fn().mockReturnValue({}),
}));

vi.mock('../agent/tools/reporting.js', () => ({
  createReportingTools: vi.fn().mockReturnValue({}),
}));

vi.mock('../agent/tools/introspection.js', () => ({
  createIntrospectionTools: vi.fn().mockReturnValue({}),
}));

vi.mock('../agent/tools/dry-run.js', () => ({
  createDryRunExecutionTools: vi.fn().mockReturnValue({}),
  createDryRunFeatureStateTools: vi.fn().mockReturnValue({}),
  createDryRunReportingTools: vi.fn().mockReturnValue({}),
}));

vi.mock('../agent/tools/feature-state.js', () => ({
  createFeatureStateTools: vi.fn().mockReturnValue({}),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/tracing.js', () => ({
  initTracing: vi.fn(),
  flushTracing: vi.fn().mockResolvedValue(undefined),
  traced: async (fn: () => Promise<unknown>) => fn(),
  currentSpan: () => ({ log: vi.fn() }),
  getTracedAI: () => ({
    ToolLoopAgent: class MockToolLoopAgent {
      constructor(options: any) {
        mockToolLoopState.options = options;
      }

      stream = vi.fn().mockImplementation(async (...args: any[]) => {
        const result = await mockToolLoopStream(...args);
        const outcome = mockToolLoopState.outcomes.shift();
        if (outcome && mockToolLoopState.options?.onStepFinish) {
          await mockToolLoopState.options.onStepFinish({
            toolCalls: [{ toolName: 'reflectOnWork', input: { issueNumber: 69, outcome } }],
            toolResults: [{ toolName: 'reflectOnWork', output: { memoriesWritten: 1 } }],
          });
        }
        return result;
      });
    },
  }),
}));

import { agentCommand } from './agent.js';

describe('agentCommand integration', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAgentEnv.mockResolvedValue({
      provider: 'openai',
      model: {},
      modelId: 'gpt-5.3-codex',
      owner: 'acme',
      repo: 'app',
      projectRoot: '/fake',
    });
    mockMemoryStoreRead.mockResolvedValue([]);
    mockMemoryStorePrune.mockResolvedValue(0);
    mockIngestStrategicDocs.mockResolvedValue(0);
    mockCreateSchedulerRunCache.mockReturnValue({ issueDetails: new Map(), featureStates: new Map() });
    mockToIssueStates.mockImplementation((queue) => queue);
    mockToolLoopStream.mockResolvedValue({
      textStream: (async function* () {})(),
    });
    mockToolLoopState.outcomes.length = 0;
    mockToolLoopState.options = undefined;

    mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${code})`);
    });
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    stdoutWriteSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('streams the real orchestrator event flow for scoped dependency expansion', async () => {
    mockToolLoopState.outcomes.push('partial');
    const queue = [
      {
        issueNumber: 69,
        title: 'Build LoopOrchestrator runtime',
        body: 'Runtime implementation.',
        labels: ['loop'],
        phase: 'idle',
        actionability: 'ready',
        priorityTier: 'unlabeled',
        selectionReasons: [{ kind: 'scope_expansion', message: 'Pulled into scope as a prerequisite for #70.' }],
        recommendation: 'start_fresh',
        loopFeatureName: 'loop-runtime',
        scopeOrigin: 'dependency',
        requestedBy: [70],
        explicitDependencyEdges: [],
        inferredDependencyEdges: [],
      },
      {
        issueNumber: 70,
        title: 'Define structured loop action IPC',
        body: 'Depends on orchestrator runtime.',
        labels: ['loop'],
        phase: 'idle',
        actionability: 'blocked_dependency',
        priorityTier: 'unlabeled',
        blockedBy: [{ issueNumber: 69, reason: 'Explicit dependency on #69.', confidence: 'high' }],
        selectionReasons: [{ kind: 'blocked', message: 'Explicit dependency on #69.', issueNumber: 69, confidence: 'high' }],
        recommendation: 'start_fresh',
        loopFeatureName: 'loop-ipc',
        scopeOrigin: 'requested',
        explicitDependencyEdges: [],
        inferredDependencyEdges: [],
      },
    ];

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue,
        actionable: [queue[0]],
        blocked: [queue[1]],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue,
        actionable: [queue[0]],
        blocked: [queue[1]],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
        errors: [],
      });

    await agentCommand({ stream: true, dryRun: true, issues: [70] });

    const output = stdoutWriteSpy.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('[orchestrator] expanded scope with #69\n');
    expect(output).toContain('[orchestrator] ranked 2 issue(s)\n');
    expect(output).toContain('[orchestrator] blocked #70 — Explicit dependency on #69.\n');
    expect(output).toContain('[orchestrator] selected #69 — Pulled into scope as a prerequisite for #70.\n');
    expect(output).toContain('[orchestrator] completed #69 (partial)\n');
    expect(output).toContain('Processed 1 issue(s).\nCompleted: #69\nBlocked: #70 (blocked_dependency)\n');
    expect(mockBuildRankedBacklog).toHaveBeenCalledTimes(2);
    expect(mockToolLoopStream).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
