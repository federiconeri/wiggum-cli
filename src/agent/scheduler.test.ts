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

import { buildRankedBacklog } from './scheduler.js';
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

  it('marks out-of-scope dependencies as blocked_out_of_scope', async () => {
    mockListRepoIssues.mockResolvedValue({
      issues: [
        { number: 2, title: 'Add auth UI', labels: ['P1'], createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    mockFetchGitHubIssue.mockResolvedValue({
      title: 'Add auth UI',
      body: 'Build auth UI. Depends on #1',
      labels: ['P1'],
    });
    mockAssessFeatureStateImpl.mockResolvedValue(featureState('start_fresh'));

    const ranked = await buildRankedBacklog(makeConfig({ issues: [2] }), makeStore());

    expect(ranked.queue[0].actionability).toBe('blocked_out_of_scope');
    expect(ranked.queue[0].blockedBy?.[0]?.reason).toContain('out-of-scope');
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
