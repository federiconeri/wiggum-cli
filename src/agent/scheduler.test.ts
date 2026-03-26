import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockListRepoIssues,
  mockFetchGitHubIssue,
  mockAssessFeatureStateImpl,
  mockLoadContext,
  mockGenerateObject,
} = vi.hoisted(() => ({
  mockListRepoIssues: vi.fn(),
  mockFetchGitHubIssue: vi.fn(),
  mockAssessFeatureStateImpl: vi.fn(),
  mockLoadContext: vi.fn(),
  mockGenerateObject: vi.fn(),
}));

vi.mock('../utils/github.js', () => ({
  listRepoIssues: mockListRepoIssues,
  fetchGitHubIssue: mockFetchGitHubIssue,
}));

vi.mock('./tools/feature-state.js', () => ({
  assessFeatureStateImpl: mockAssessFeatureStateImpl,
}));

vi.mock('../context/index.js', () => ({
  loadContext: mockLoadContext,
}));

vi.mock('../utils/tracing.js', () => ({
  getTracedAI: () => ({
    generateObject: mockGenerateObject,
  }),
}));

import { buildRankedBacklog, createSchedulerRunCache, extractDependencyHints } from './scheduler.js';
import type { AgentConfig } from './types.js';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    model: {} as any,
    modelId: 'gpt-5.3-codex',
    provider: 'openai',
    projectRoot: '/repo',
    owner: 'acme',
    repo: 'app',
    ...overrides,
  };
}

function makeStore(entries: Array<{ relatedIssue?: number; tags?: string[] }> = []) {
  return {
    read: vi.fn().mockResolvedValue(entries.map((entry, index) => ({
      id: `m${index}`,
      timestamp: new Date().toISOString(),
      type: 'work_log',
      content: `Issue #${entry.relatedIssue}`,
      relatedIssue: entry.relatedIssue,
      tags: entry.tags,
    }))),
  } as any;
}

function featureState(recommendation: string) {
  return {
    featureName: 'feature',
    branch: { exists: false, commitsAhead: 0 },
    spec: { exists: false },
    plan: { exists: false, totalTasks: 0, completedTasks: 0, completionPercent: 0 },
    pr: { exists: false },
    linkedPr: { exists: false },
    loopStatus: { hasStatusFiles: false },
    recommendation,
  };
}

describe('buildRankedBacklog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadContext.mockResolvedValue(null);
    mockGenerateObject.mockResolvedValue({ object: { edges: [] } });
  });

  it('prioritizes housekeeping items ahead of fresh work', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Fresh issue', labels: ['P1'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Merged issue', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 1 ? 'Fresh issue' : 'Merged issue',
      body: 'Body',
      labels: ['P1'],
    }));
    mockAssessFeatureStateImpl.mockImplementation(async (_root: string, _featureName: string, issueNumber: number) =>
      issueNumber === 2 ? featureState('pr_merged') : featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig(), makeStore());

    expect(ranked.queue[0].issueNumber).toBe(2);
    expect(ranked.queue[0].actionability).toBe('housekeeping');
  });

  it('prioritizes retry and resume work ahead of fresh work', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Fresh issue', labels: ['P1'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Resume issue', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 1 ? 'Fresh issue' : 'Resume issue',
      body: 'Body',
      labels: ['P1'],
    }));
    mockAssessFeatureStateImpl.mockImplementation(async (_root: string, _featureName: string, issueNumber: number) =>
      issueNumber === 2 ? featureState('resume_implementation') : featureState('start_fresh'));

    const ranked = await buildRankedBacklog(
      makeConfig(),
      makeStore([{ relatedIssue: 2, tags: ['failure'] }]),
    );

    expect(ranked.queue[0].issueNumber).toBe(2);
    expect(ranked.queue[0].attemptState).toBe('failure');
    expect(ranked.queue[0].recommendation).toBe('resume_implementation');
  });

  it('enforces explicit dependencies as hard blockers', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Create auth API', labels: ['P1'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Add auth UI', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 1 ? 'Create auth API' : 'Add auth UI',
      body: number === 2 ? 'Build the UI. Depends on #1' : 'Build the API.',
      labels: ['P1'],
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig(), makeStore());
    const downstream = ranked.queue.find((issue) => issue.issueNumber === 2);

    expect(ranked.queue[0].issueNumber).toBe(1);
    expect(downstream?.actionability).toBe('blocked_dependency');
    expect(downstream?.blockedBy?.[0]?.issueNumber).toBe(1);
  });

  it('blocks high-confidence inferred dependencies', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Set up auth API', labels: ['P1'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Add auth UI', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 1 ? 'Set up auth API' : 'Add auth UI',
      body: number === 1 ? 'Create backend auth API and schema.' : 'Build auth UI that consumes auth API.',
      labels: ['P1'],
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));
    mockGenerateObject.mockImplementation(async ({ prompt }: { prompt: string }) => ({
      object: {
        edges: prompt.includes('Current issue:\n#2')
          ? [{ targetIssue: 1, confidence: 'high', evidence: 'UI depends on the auth API and schema work.' }]
          : [],
      },
    }));

    const ranked = await buildRankedBacklog(makeConfig(), makeStore());
    const downstream = ranked.queue.find((issue) => issue.issueNumber === 2);

    expect(ranked.queue[0].issueNumber).toBe(1);
    expect(downstream?.actionability).toBe('blocked_dependency');
    expect(downstream?.inferredDependsOn).toEqual([{ issueNumber: 1, confidence: 'high' }]);
  });

  it('uses medium-confidence inferred dependencies as ordering hints without blocking', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 4, title: 'Add auth UI', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
        { number: 5, title: 'Set up auth API', labels: ['P1'], createdAt: '2026-01-01T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 4 ? 'Add auth UI' : 'Set up auth API',
      body: number === 4 ? 'Build auth login UI and flows.' : 'Create backend auth API and schema.',
      labels: ['P1'],
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));
    mockGenerateObject.mockImplementation(async ({ prompt }: { prompt: string }) => ({
      object: {
        edges: /Current issue:\n#4: Add auth UI/.test(prompt)
          ? [{ targetIssue: 5, confidence: 'medium', evidence: 'The UI likely wants the auth API first.' }]
          : [],
      },
    }));

    const ranked = await buildRankedBacklog(makeConfig(), makeStore());
    const uiIssue = ranked.queue.find((issue) => issue.issueNumber === 4);

    expect(ranked.queue[0].issueNumber).toBe(5);
    expect(uiIssue?.actionability).toBe('ready');
    expect(uiIssue?.inferredDependsOn).toEqual([{ issueNumber: 5, confidence: 'medium' }]);
  });

  it('limits model-based dependency inference to the top candidate slice on unscoped runs', async () => {
    const issues = Array.from({ length: 20 }, (_, index) => ({
      number: index + 1,
      title: `Native agent task ${index + 1}`,
      labels: ['ai/llm'],
      createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    mockListRepoIssues.mockResolvedValue({ issues });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      number,
      title: `Native agent task ${number}`,
      body: `Build native agent task ${number} with runtime contract and evaluation hooks.`,
      labels: ['ai/llm'],
      state: 'open',
      createdAt: `2026-01-${String(number).padStart(2, '0')}T00:00:00Z`,
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));
    mockGenerateObject.mockResolvedValue({ object: { edges: [] } });

    await buildRankedBacklog(makeConfig(), makeStore());

    expect(mockGenerateObject).toHaveBeenCalledTimes(12);
  });

  it('reuses cached issue details and feature state across ranked backlog rebuilds', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Runtime foundation', labels: ['loop'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Dependent workflow', labels: ['loop'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      number,
      title: number === 1 ? 'Runtime foundation' : 'Dependent workflow',
      body: number === 2 ? 'Depends on #1' : 'Build the runtime foundation.',
      labels: ['loop'],
      state: 'open',
      createdAt: `2026-01-0${number}T00:00:00Z`,
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const cache = createSchedulerRunCache();
    await buildRankedBacklog(makeConfig(), makeStore(), cache);
    await buildRankedBacklog(makeConfig(), makeStore(), cache);

    expect(mockFetchGitHubIssue).toHaveBeenCalledTimes(2);
    expect(mockAssessFeatureStateImpl).toHaveBeenCalledTimes(2);
    expect(mockListRepoIssues).toHaveBeenCalledTimes(1);
  });

  it('produces clearer fallback rationale for runtime-first inferred dependencies', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 74, title: 'Create native agent runtime interface + tool execution contract', labels: ['ai/llm'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 76, title: 'Build native-agent evaluation harness and baseline benchmarks', labels: ['ai/llm'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      number,
      title: number === 74
        ? 'Create native agent runtime interface + tool execution contract'
        : 'Build native-agent evaluation harness and baseline benchmarks',
      body: number === 74
        ? 'Define a native runtime interface and tool execution contract.'
        : 'Create an evaluation harness to compare native-agent behavior against baseline runs.',
      labels: ['ai/llm'],
      state: 'open',
      createdAt: number === 74 ? '2026-01-01T00:00:00Z' : '2026-01-02T00:00:00Z',
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));
    mockGenerateObject.mockResolvedValue({ object: { edges: [] } });

    const ranked = await buildRankedBacklog(makeConfig({ issues: [74, 76] }), makeStore());
    const evalIssue = ranked.queue.find((issue) => issue.issueNumber === 76);

    expect(evalIssue?.selectionReasons?.some(reason =>
      reason.message.includes('defines the native runtime contract') && reason.message.includes('evaluation work'),
    )).toBe(true);
  });

  it('expands issue scope to include explicit prerequisites', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Build LoopOrchestrator runtime', labels: ['loop'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Add auth UI', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 1 ? 'Build LoopOrchestrator runtime' : 'Add auth UI',
      body: number === 1 ? 'Build the runtime.' : 'Build auth UI. Depends on #1',
      labels: number === 1 ? ['loop'] : ['P1'],
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [2] }), makeStore());

    expect(ranked.expansions).toEqual([{ issueNumber: 1, requestedBy: [2] }]);
    expect(ranked.queue.map((issue) => issue.issueNumber)).toEqual([1, 2]);
    expect(ranked.queue[0].scopeOrigin).toBe('dependency');
    expect(ranked.queue[1].actionability).toBe('blocked_dependency');
  });

  it('expands issue scope from natural language body cues and backlog titles', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 69, title: 'Build LoopOrchestrator runtime (process supervision + PTY)', labels: ['loop'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 70, title: 'Define structured loop action IPC', labels: ['loop'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 69 ? 'Build LoopOrchestrator runtime (process supervision + PTY)' : 'Define structured loop action IPC',
      body: number === 69 ? 'Runtime implementation.' : 'Depends on orchestrator runtime.',
      labels: ['loop'],
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [70] }), makeStore());
    const requestedIssue = ranked.queue.find((issue) => issue.issueNumber === 70);

    expect(requestedIssue?.dependsOn).toEqual([69]);
    expect(ranked.expansions).toEqual([{ issueNumber: 69, requestedBy: [70] }]);
    expect(ranked.queue.map((issue) => issue.issueNumber)).toEqual([69, 70]);
    expect(ranked.queue[0].scopeOrigin).toBe('dependency');
    expect(ranked.queue[1].actionability).toBe('blocked_dependency');
  });

  it('does not infer unrelated protocol issues from generic single-word dependency segments', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 60, title: '[S1] Define Action Inbox Protocol v1 for loop user decisions', labels: ['loop'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 61, title: '[S1] Implement TUI action modal + reply writer for loop inbox', labels: ['loop'], createdAt: '2026-01-02T00:00:00Z' },
        { number: 62, title: '[S1] Add timeout/retry/cleanup and integration tests for action inbox path', labels: ['loop'], createdAt: '2026-01-03T00:00:00Z' },
        { number: 66, title: '[S3] Implement phase status protocol v2 writers in loop scripts', labels: ['loop'], createdAt: '2026-01-04T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      number,
      title: number === 60
        ? '[S1] Define Action Inbox Protocol v1 for loop user decisions'
        : number === 61
          ? '[S1] Implement TUI action modal + reply writer for loop inbox'
          : number === 62
            ? '[S1] Add timeout/retry/cleanup and integration tests for action inbox path'
            : '[S3] Implement phase status protocol v2 writers in loop scripts',
      body: number === 60
        ? 'Define the protocol.'
        : number === 61
          ? 'Implement the modal. Depends on #60'
          : number === 62
            ? 'Depends on protocol + TUI action modal implementation.'
            : 'Write the phase status protocol files.',
      labels: ['loop'],
      state: 'open',
      createdAt: `2026-01-0${number === 60 ? 1 : number === 61 ? 2 : number === 62 ? 3 : 4}T00:00:00Z`,
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [60, 61, 62] }), makeStore());
    const testIssue = ranked.queue.find((issue) => issue.issueNumber === 62);

    expect(ranked.expansions).toEqual([]);
    expect(ranked.queue.map((issue) => issue.issueNumber)).toEqual([60, 61, 62]);
    expect(testIssue?.dependsOn).toContain(61);
    expect(testIssue?.dependsOn).not.toContain(66);
  });

  it('ignores generic single-word title matches but keeps multi-word dependency inference', () => {
    const hints = extractDependencyHints(
      'Depends on protocol + TUI action modal implementation.',
      [
        { number: 60, title: '[S1] Define Action Inbox Protocol v1 for loop user decisions' },
        { number: 61, title: '[S1] Implement TUI action modal + reply writer for loop inbox' },
        { number: 66, title: '[S3] Implement phase status protocol v2 writers in loop scripts' },
      ],
      62,
    );

    expect(hints).toContain(61);
    expect(hints).not.toContain(60);
    expect(hints).not.toContain(66);
  });

  it('keeps issues blocked_out_of_scope when the prerequisite is not in the open backlog', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 70, title: 'Define structured loop action IPC', labels: ['loop'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockResolvedValue({
      title: 'Define structured loop action IPC',
      body: 'Depends on #60',
      labels: ['loop'],
    });
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [70] }), makeStore());

    expect(ranked.expansions).toEqual([]);
    expect(ranked.queue[0].actionability).toBe('blocked_out_of_scope');
  });

  it('hydrates scoped issues directly when issue listing is unavailable', async () => {
    mockListRepoIssues.mockResolvedValue({ issues: [] });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      number,
      title: number === 74
        ? 'Create native agent runtime interface + tool execution contract'
        : number === 76
          ? 'Build native-agent evaluation harness and baseline benchmarks'
          : 'Add feature flags + safe rollback path for native-agent rollout',
      body: number === 74
        ? 'Define runtime interface and tool execution contract.'
        : number === 76
          ? 'Build evaluation harness for native/hybrid variants.'
          : 'Add rollout controls for native-agent alpha.',
      labels: ['ai/llm'],
      state: 'open',
      createdAt: `2026-01-0${number === 74 ? 1 : number === 76 ? 2 : 3}T00:00:00Z`,
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [74, 76, 77] }), makeStore());

    expect(ranked.queue.map((issue) => issue.issueNumber)).toEqual([74, 76, 77]);
    expect(ranked.queue.every((issue) => issue.scopeOrigin === 'requested')).toBe(true);
    expect(ranked.errors).toEqual([]);
  });

  it('surfaces GitHub fetch errors instead of silently returning an empty scoped backlog', async () => {
    mockListRepoIssues.mockResolvedValue({ issues: [] });
    mockFetchGitHubIssue.mockResolvedValue(null);
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [70] }), makeStore());

    expect(ranked.queue).toEqual([]);
    expect(ranked.errors[0]).toContain('Failed to fetch issue #70');
  });

  it('detects dependency cycles and blocks both issues', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 1, title: 'Issue one', labels: ['P1'], createdAt: '2026-01-01T00:00:00Z' },
        { number: 2, title: 'Issue two', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockImplementation(async (_owner: string, _repo: string, number: number) => ({
      title: number === 1 ? 'Issue one' : 'Issue two',
      body: number === 1 ? 'Depends on #2' : 'Depends on #1',
      labels: ['P1'],
    }));
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig(), makeStore());

    expect(ranked.queue.every((issue) => issue.actionability === 'blocked_cycle')).toBe(true);
  });
});
