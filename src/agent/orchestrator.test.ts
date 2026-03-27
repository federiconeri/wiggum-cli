import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockMemoryStoreRead,
  mockMemoryStorePrune,
  mockBuildRankedBacklog,
  mockCreateSchedulerRunCache,
  mockInvalidateSchedulerRunCache,
  mockToIssueStates,
  mockIngestStrategicDocs,
  mockToolLoopStream,
  mockToolLoopState,
} = vi.hoisted(() => ({
  mockMemoryStoreRead: vi.fn().mockResolvedValue([]),
  mockMemoryStorePrune: vi.fn().mockResolvedValue(0),
  mockBuildRankedBacklog: vi.fn(),
  mockCreateSchedulerRunCache: vi.fn(() => ({ issueDetails: new Map(), featureStates: new Map() })),
  mockInvalidateSchedulerRunCache: vi.fn(),
  mockToIssueStates: vi.fn((queue) => queue),
  mockIngestStrategicDocs: vi.fn().mockResolvedValue(0),
  mockToolLoopStream: vi.fn().mockResolvedValue({
    textStream: (async function* () {})(),
  }),
  mockToolLoopState: {
    outcomes: [] as Array<'success' | 'partial' | 'failure' | 'skipped'>,
    options: undefined as any,
  },
}));

vi.mock('./memory/store.js', () => {
  class MockMemoryStore {
    read = mockMemoryStoreRead;
    prune = mockMemoryStorePrune;
  }
  return { MemoryStore: MockMemoryStore };
});

vi.mock('./memory/ingest.js', () => ({
  ingestStrategicDocs: mockIngestStrategicDocs,
}));

vi.mock('./scheduler.js', () => ({
  buildRankedBacklog: mockBuildRankedBacklog,
  createSchedulerRunCache: mockCreateSchedulerRunCache,
  invalidateSchedulerRunCache: mockInvalidateSchedulerRunCache,
  toIssueStates: mockToIssueStates,
}));

vi.mock('./tools/backlog.js', () => ({
  createBacklogTools: vi.fn().mockReturnValue({}),
}));

vi.mock('./tools/memory.js', () => ({
  createMemoryTools: vi.fn().mockReturnValue({}),
  REFLECT_TOOL_NAME: 'reflectOnWork',
}));

vi.mock('./tools/execution.js', () => ({
  createExecutionTools: vi.fn().mockReturnValue({}),
}));

vi.mock('./tools/reporting.js', () => ({
  createReportingTools: vi.fn().mockReturnValue({}),
}));

vi.mock('./tools/introspection.js', () => ({
  createIntrospectionTools: vi.fn().mockReturnValue({}),
}));

vi.mock('./tools/dry-run.js', () => ({
  createDryRunExecutionTools: vi.fn().mockReturnValue({}),
  createDryRunFeatureStateTools: vi.fn().mockReturnValue({}),
  createDryRunReportingTools: vi.fn().mockReturnValue({}),
}));

vi.mock('./tools/feature-state.js', () => ({
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
            toolCalls: [{ toolName: 'reflectOnWork', input: { issueNumber: 1, outcome } }],
            toolResults: [{ toolName: 'reflectOnWork', output: { memoriesWritten: 1 } }],
          });
        }
        return result;
      });
    },
  }),
}));

import { AGENT_SYSTEM_PROMPT, buildConstraints, buildRuntimeConfig, createAgentOrchestrator } from './orchestrator.js';

describe('createAgentOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('returns an agent-v1 compatible wrapper', () => {
    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
    });

    expect(agent).toBeDefined();
    expect(agent.version).toBe('agent-v1');
    expect(agent.id).toBe('agent-orchestrator');
    expect(typeof agent.generate).toBe('function');
    expect(typeof agent.stream).toBe('function');
    expect(agent.tools).toBeDefined();
  });

  it('exports a worker prompt scoped to one issue', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('selected issue');
    expect(AGENT_SYSTEM_PROMPT).toContain('assessFeatureState');
    expect(AGENT_SYSTEM_PROMPT).toContain('reflectOnWork');
    expect(AGENT_SYSTEM_PROMPT).toContain('Do not select another issue');
  });

  it('emits scope expansion and does not reselect the same issue in one run', async () => {
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
      })
      .mockResolvedValueOnce({
        queue,
        actionable: [queue[0]],
        blocked: [queue[1]],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
      });

    const events: Array<{ type: string; issue?: number }> = [];
    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
      onOrchestratorEvent: (event) => {
        events.push({
          type: event.type,
          issue: 'issue' in event && event.issue ? event.issue.issueNumber : undefined,
        });
      },
    });

    const result = await agent.generate({ prompt: 'Begin working through the backlog.' });

    expect(mockBuildRankedBacklog).toHaveBeenCalledTimes(2);
    expect(mockBuildRankedBacklog.mock.calls[0][2]).toBe(mockBuildRankedBacklog.mock.calls[1][2]);
    expect(mockToolLoopStream).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSchedulerRunCache).toHaveBeenCalledWith(mockBuildRankedBacklog.mock.calls[0][2], [69]);
    expect(result.text).toContain('Processed 1 issue(s).');
    expect(result.text).toContain('Completed: #69');
    expect(result.text).toContain('Blocked: #70 (blocked_dependency)');
    expect(events.some((event) => event.type === 'scope_expanded')).toBe(true);
    expect(events.filter((event) => event.type === 'task_selected').map((event) => event.issue)).toEqual([69]);
  });

  it('returns a clean empty summary when the backlog is genuinely empty', async () => {
    mockBuildRankedBacklog.mockResolvedValue({
      queue: [],
      actionable: [],
      blocked: [],
      expansions: [],
      errors: [],
    });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
    });

    const result = await agent.generate({ prompt: 'Begin working through the backlog.' });

    expect(result.text).toBe('Processed 0 issue(s).');
  });

  it('fails explicitly when backlog fetch errors leave the queue empty', async () => {
    mockBuildRankedBacklog.mockResolvedValue({
      queue: [],
      actionable: [],
      blocked: [],
      expansions: [],
      errors: ['Failed to fetch requested issue #70 from GitHub. Check gh connectivity.'],
    });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
    });

    await expect(agent.generate({ prompt: 'Begin working through the backlog.' }))
      .rejects.toThrow('Failed to fetch requested issue #70 from GitHub');
  });

  it('does not count skipped housekeeping toward maxItems', async () => {
    mockToolLoopState.outcomes.push('skipped', 'partial');
    const housekeeping = {
      issueNumber: 2,
      title: 'Already merged issue',
      body: 'Merged already.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'housekeeping',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'housekeeping', message: 'Already merged.' }],
      recommendation: 'pr_merged',
      loopFeatureName: 'merged-issue',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    const fresh = {
      issueNumber: 3,
      title: 'Fresh issue',
      body: 'Do work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Ready issue.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'fresh-issue',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [housekeeping, fresh],
        actionable: [housekeeping, fresh],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [housekeeping, fresh],
        actionable: [fresh],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [housekeeping, fresh],
        actionable: [],
        blocked: [],
        expansions: [],
        errors: [],
      });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Begin working through the backlog.' });

    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Completed: #2, #3');
    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
  });

  it('does not count scope-expanded prerequisites toward maxItems', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('partial', 'partial');
    const prerequisite = {
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
    };
    const requested = {
      issueNumber: 70,
      title: 'Define structured loop action IPC',
      body: 'Depends on orchestrator runtime.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Requested issue is now actionable.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'loop-ipc',
      scopeOrigin: 'requested',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    const initiallyBlocked = {
      ...requested,
      actionability: 'blocked_dependency',
      blockedBy: [{ issueNumber: 69, reason: 'Explicit dependency on #69.', confidence: 'high' }],
      selectionReasons: [{ kind: 'blocked', message: 'Explicit dependency on #69.', issueNumber: 69, confidence: 'high' }],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [prerequisite, initiallyBlocked],
        actionable: [prerequisite],
        blocked: [initiallyBlocked],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [prerequisite, requested],
        actionable: [requested],
        blocked: [],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [prerequisite, requested],
        actionable: [],
        blocked: [],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
        errors: [],
      });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Begin working through the backlog.' });

    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Completed: #69, #70');
    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
  });

  it('fails when the worker stops before reflectOnWork completes', async () => {
    mockBuildRankedBacklog.mockReset();
    const fresh = {
      issueNumber: 3,
      title: 'Fresh issue',
      body: 'Do work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Ready issue.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'fresh-issue',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    mockBuildRankedBacklog.mockResolvedValue({
      queue: [fresh],
      actionable: [fresh],
      blocked: [],
      expansions: [],
      errors: [],
    });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
    });

    await expect(agent.generate({ prompt: 'Begin working through the backlog.' }))
      .rejects.toThrow('Worker stopped before calling reflectOnWork for issue #3.');
    expect(mockInvalidateSchedulerRunCache).not.toHaveBeenCalled();
  });
});

describe('buildConstraints', () => {
  const base = { model: {} as any, projectRoot: '/fake', owner: 'o', repo: 'r' };

  it('returns empty string when no constraints', () => {
    expect(buildConstraints(base)).toBe('');
  });

  it('includes maxItems constraint', () => {
    const result = buildConstraints({ ...base, maxItems: 1 });
    expect(result).toContain('1 issue(s)');
    expect(result).toContain('Constraints');
  });

  it('includes labels constraint', () => {
    const result = buildConstraints({ ...base, labels: ['P0', 'bug'] });
    expect(result).toContain('P0, bug');
  });

  it('includes issues constraint', () => {
    const result = buildConstraints({ ...base, issues: [137, 139] });
    expect(result).toContain('#137');
    expect(result).toContain('#139');
  });

  it('includes dryRun constraint', () => {
    const result = buildConstraints({ ...base, dryRun: true });
    expect(result).toContain('DRY RUN');
  });
});

describe('buildRuntimeConfig', () => {
  const base = { model: {} as any, projectRoot: '/fake', owner: 'o', repo: 'r' };

  it('returns empty string when no model or provider', () => {
    expect(buildRuntimeConfig(base)).toBe('');
  });

  it('includes model when provided', () => {
    const result = buildRuntimeConfig({ ...base, modelId: 'gpt-5.3-codex' });
    expect(result).toContain('model: gpt-5.3-codex');
    expect(result).toContain('Runtime Config');
  });

  it('includes provider when provided', () => {
    const result = buildRuntimeConfig({ ...base, provider: 'openai' });
    expect(result).toContain('provider: openai');
  });

  it('includes reviewMode when provided', () => {
    const result = buildRuntimeConfig({ ...base, reviewMode: 'auto' });
    expect(result).toContain('reviewMode: auto');
  });
});
