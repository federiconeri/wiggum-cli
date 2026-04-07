import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockMemoryStoreRead,
  mockMemoryStorePrune,
  mockBuildRankedBacklog,
  mockCreateSchedulerRunCache,
  mockInvalidateSchedulerRunCache,
  mockToIssueStates,
  mockIngestStrategicDocs,
  mockCreateBacklogTools,
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
  mockCreateBacklogTools: vi.fn().mockReturnValue({}),
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
  createBacklogTools: mockCreateBacklogTools,
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
    mockBuildRankedBacklog.mockReset();
    mockBuildRankedBacklog.mockResolvedValue({
      queue: [],
      actionable: [],
      blocked: [],
      expansions: [],
      errors: [],
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
    expect(AGENT_SYSTEM_PROMPT).toContain('pass model and provider to generateSpec');
    expect(AGENT_SYSTEM_PROMPT).toContain('pass reviewMode to runLoop');
    expect(AGENT_SYSTEM_PROMPT).not.toContain('pass model and provider to runLoop');
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
        errors: [],
      })
      .mockResolvedValueOnce({
        queue,
        actionable: [queue[0]],
        blocked: [queue[1]],
        expansions: [{ issueNumber: 69, requestedBy: [70] }],
        errors: [],
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
    expect(result.text).toContain('Partial: #69');
    expect(result.text).toContain('Blocked: #70 (blocked_dependency)');
    expect(mockToolLoopState.options.instructions).toContain('Initial backlog scope is limited to issues: #69.');
    expect(mockToolLoopState.options.instructions).not.toContain('Initial backlog scope is limited to issues: #70.');
    expect(mockCreateBacklogTools).toHaveBeenLastCalledWith('acme', 'app', {
      defaultLabels: undefined,
      issueNumbers: [69],
      scopeListIssuesToIssueNumbers: true,
      scopeReadIssueToIssueNumbers: true,
      allowGlobalBugDuplicateChecks: true,
    });
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

  it('fails explicitly when scheduler errors are present even if some items ranked', async () => {
    const queue = [{
      issueNumber: 69,
      title: 'Build LoopOrchestrator runtime',
      body: 'Runtime implementation.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Ready issue.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'loop-runtime',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    }];
    mockBuildRankedBacklog.mockResolvedValue({
      queue,
      actionable: queue,
      blocked: [],
      expansions: [],
      errors: ['Failed to fetch dependency issue #70 from GitHub. Check gh connectivity.'],
    });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
    });

    await expect(agent.generate({ prompt: 'Begin working through the backlog.' }))
      .rejects.toThrow('Failed to fetch dependency issue #70 from GitHub');
    expect(mockToolLoopStream).not.toHaveBeenCalled();
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

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Begin working through the backlog.' });

    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Partial: #3');
    expect(result.text).toContain('Skipped: #2');
    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(mockBuildRankedBacklog).toHaveBeenCalledTimes(3);
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
    expect(result.text).toContain('Partial: #69, #70');
    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(mockBuildRankedBacklog).toHaveBeenCalledTimes(3);
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

  it('emits a failure outcome when the worker crashes before reflectOnWork', async () => {
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
    mockToolLoopStream.mockRejectedValueOnce(new Error('worker crashed'));

    const events: Array<{ type: string; outcome?: string; issue?: number }> = [];
    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
      onOrchestratorEvent: (event) => {
        if (event.type === 'task_completed') {
          events.push({ type: event.type, outcome: event.outcome, issue: event.issue.issueNumber });
        }
      },
    });

    await expect(agent.generate({ prompt: 'Begin working through the backlog.' }))
      .rejects.toThrow('worker crashed');
    expect(events).toContainEqual({ type: 'task_completed', issue: 3, outcome: 'failure' });
  });

  it('dispatches waiting_pr issues through the worker path', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('partial');
    const waitingIssue = {
      issueNumber: 123,
      title: 'Feature with open PR',
      body: 'Implementation is already under review.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'waiting_pr',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'existing_work', message: 'Open PR exists.' }],
      recommendation: 'pr_exists_open',
      loopFeatureName: 'feature-open-pr',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [waitingIssue],
        actionable: [waitingIssue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [waitingIssue],
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

    expect(mockToolLoopStream).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Processed 1 issue(s).');
    expect(result.text).toContain('Partial: #123');
  });

  it('does not consume maxItems on waiting_pr bookkeeping passes', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('success', 'success');
    const waitingIssue = {
      issueNumber: 123,
      title: 'Feature with open PR',
      body: 'Implementation is already under review.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'waiting_pr',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'existing_work', message: 'Open PR exists.' }],
      recommendation: 'pr_exists_open',
      loopFeatureName: 'feature-open-pr',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    const freshIssue = {
      issueNumber: 124,
      title: 'Fresh implementation issue',
      body: 'Needs real implementation work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Fresh work remains.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'fresh-implementation-issue',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [waitingIssue, freshIssue],
        actionable: [waitingIssue, freshIssue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [freshIssue],
        actionable: [freshIssue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
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
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Handle open PR bookkeeping, then continue to real work.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Completed: #123, #124');
  });

  it('allows resumable issues to be selected again within the same run', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('partial', 'partial');
    const resumable = {
      issueNumber: 74,
      title: 'Build runtime',
      body: 'Continue implementation.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'retry', message: 'Resume the in-progress implementation.' }],
      recommendation: 'resume_implementation',
      loopFeatureName: 'runtime',
      attemptState: 'partial',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
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

    const result = await agent.generate({ prompt: 'Resume work until the issue is no longer actionable.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Partial: #74, #74');
  });

  it('allows a successful implementation pass to be reselected for the PR phase', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('success', 'partial');
    const issue = {
      issueNumber: 88,
      title: 'Ship runtime feature',
      body: 'Implementation work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'retry', message: 'Continue through the PR phase.' }],
      recommendation: 'resume_pr_phase',
      loopFeatureName: 'runtime-feature',
      attemptState: 'success',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [{ ...issue, recommendation: 'start_fresh', attemptState: 'never_tried' }],
        actionable: [{ ...issue, recommendation: 'start_fresh', attemptState: 'never_tried' }],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [issue],
        actionable: [issue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [issue],
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

    const result = await agent.generate({ prompt: 'Complete implementation and PR work.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Completed: #88');
    expect(result.text).toContain('Partial: #88');
  });

  it('allows a successful implementation pass to be reselected for merged housekeeping', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('success', 'skipped');
    const issue = {
      issueNumber: 93,
      title: 'Ship runtime feature',
      body: 'Implementation work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'housekeeping',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'housekeeping', message: 'Issue appears already shipped and only needs housekeeping.' }],
      recommendation: 'pr_merged',
      loopFeatureName: 'runtime-feature',
      attemptState: 'success',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [{ ...issue, recommendation: 'start_fresh', actionability: 'ready', attemptState: 'never_tried' }],
        actionable: [{ ...issue, recommendation: 'start_fresh', actionability: 'ready', attemptState: 'never_tried' }],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [issue],
        actionable: [issue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
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
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Complete implementation, then do housekeeping when merged.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Completed: #93');
    expect(result.text).toContain('Skipped: #93');
  });

  it('returns the success summary when the post-success verification rescan fails', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('success');
    const issue = {
      issueNumber: 91,
      title: 'Successful issue',
      body: 'Complete the implementation.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Do the requested work.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'successful-issue',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [issue],
        actionable: [issue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [],
        actionable: [],
        blocked: [],
        expansions: [],
        errors: ['GitHub issue listing failed: transient outage'],
      });

    const agent = createAgentOrchestrator({
      model: {} as any,
      projectRoot: '/fake',
      owner: 'acme',
      repo: 'app',
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Complete one issue.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Processed 1 issue(s).');
    expect(result.text).toContain('Completed: #91');
  });

  it('counts only one successful pass per issue toward maxItems', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('success', 'success', 'success');
    const prFollowUpIssue = {
      issueNumber: 88,
      title: 'Ship runtime feature',
      body: 'Implementation work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'retry', message: 'Continue through the PR phase.' }],
      recommendation: 'resume_pr_phase',
      loopFeatureName: 'runtime-feature',
      attemptState: 'success',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };
    const secondIssue = {
      issueNumber: 89,
      title: 'Follow-up issue',
      body: 'Separate requested work.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Another requested issue remains.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'follow-up-issue',
      attemptState: 'never_tried',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [{ ...prFollowUpIssue, recommendation: 'start_fresh', attemptState: 'never_tried' }, secondIssue],
        actionable: [{ ...prFollowUpIssue, recommendation: 'start_fresh', attemptState: 'never_tried' }, secondIssue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [prFollowUpIssue, secondIssue],
        actionable: [prFollowUpIssue, secondIssue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [secondIssue],
        actionable: [secondIssue],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
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
      maxItems: 2,
    });

    const result = await agent.generate({ prompt: 'Complete two logical issues.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(3);
    expect(result.text).toContain('Processed 3 issue(s).');
    expect(result.text).toContain('Completed: #88, #88, #89');
  });

  it('continues with a ranked queue when only pagination listing errors remain', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('success');
    const issue = {
      issueNumber: 92,
      title: 'Issue from last successful listing page',
      body: 'Continue with the already ranked backlog item.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'priority', message: 'Actionable work exists from the successful listing snapshot.' }],
      recommendation: 'start_fresh',
      loopFeatureName: 'issue-from-last-successful-listing-page',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [issue],
        actionable: [issue],
        blocked: [],
        expansions: [],
        errors: ['GitHub issue listing failed: transient network error'],
      })
      .mockResolvedValueOnce({
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
      maxItems: 1,
    });

    const result = await agent.generate({ prompt: 'Proceed with the ranked queue despite a later relist hiccup.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Processed 1 issue(s).');
    expect(result.text).toContain('Completed: #92');
  });

  it('does not consume maxItems on partial requested outcomes', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('partial', 'partial');
    const resumable = {
      issueNumber: 74,
      title: 'Build runtime',
      body: 'Continue implementation.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'retry', message: 'Resume the in-progress implementation.' }],
      recommendation: 'resume_implementation',
      loopFeatureName: 'runtime',
      attemptState: 'partial',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
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

    const result = await agent.generate({ prompt: 'Resume work until the issue is no longer actionable.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('Processed 2 issue(s).');
    expect(result.text).toContain('Partial: #74, #74');
    expect(mockBuildRankedBacklog).toHaveBeenCalledTimes(3);
  });

  it('stops retrying the same partial issue after the within-run retry cap', async () => {
    mockBuildRankedBacklog.mockReset();
    mockToolLoopState.outcomes.push('partial', 'partial', 'partial');
    const resumable = {
      issueNumber: 90,
      title: 'Persistently blocked issue',
      body: 'Still blocked.',
      labels: ['loop'],
      phase: 'idle',
      actionability: 'ready',
      priorityTier: 'unlabeled',
      selectionReasons: [{ kind: 'retry', message: 'Resume the blocked implementation.' }],
      recommendation: 'resume_implementation',
      loopFeatureName: 'blocked-issue',
      attemptState: 'partial',
      explicitDependencyEdges: [],
      inferredDependencyEdges: [],
    };

    mockBuildRankedBacklog
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
        blocked: [],
        expansions: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        queue: [resumable],
        actionable: [resumable],
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

    const result = await agent.generate({ prompt: 'Keep trying until the orchestrator gives up.' });

    expect(mockToolLoopStream).toHaveBeenCalledTimes(3);
    expect(mockBuildRankedBacklog).toHaveBeenCalledTimes(4);
    expect(result.text).toContain('Processed 3 issue(s).');
    expect(result.text).toContain('Partial: #90, #90, #90');
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

describe('AGENT_SYSTEM_PROMPT', () => {
  it('includes an explicit worker path for pr_closed recommendations', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('pr_closed -> comment about the closed PR, then re-triage:');
    expect(AGENT_SYSTEM_PROMPT).toContain('if branch commits or a plan already exist, runLoop with resume: true');
    expect(AGENT_SYSTEM_PROMPT).toContain('otherwise restart with generateSpec -> runLoop without resume');
    expect(AGENT_SYSTEM_PROMPT).toContain('You must not force pr_closed into resume mode when there is no branch or plan state to resume.');
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
