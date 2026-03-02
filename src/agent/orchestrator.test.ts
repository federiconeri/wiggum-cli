import { describe, it, expect, vi } from 'vitest';

const { mockMemoryStoreRead, mockMemoryStoreAppend, mockMemoryStorePrune } = vi.hoisted(() => ({
  mockMemoryStoreRead: vi.fn().mockResolvedValue([]),
  mockMemoryStoreAppend: vi.fn().mockResolvedValue(undefined),
  mockMemoryStorePrune: vi.fn().mockResolvedValue(0),
}));

vi.mock('./memory/store.js', () => {
  class MockMemoryStore {
    read = mockMemoryStoreRead;
    append = mockMemoryStoreAppend;
    prune = mockMemoryStorePrune;
  }
  return { MemoryStore: MockMemoryStore };
});

vi.mock('./memory/ingest.js', () => ({
  ingestStrategicDocs: vi.fn().mockResolvedValue(0),
}));

import { createAgentOrchestrator, AGENT_SYSTEM_PROMPT, buildConstraints, buildRuntimeConfig } from './orchestrator.js';

describe('createAgentOrchestrator', () => {
  it('returns a ToolLoopAgent instance with generate and stream methods', () => {
    const mockModel = {} as any;

    const agent = createAgentOrchestrator({
      model: mockModel,
      projectRoot: '/fake',
      owner: 'test',
      repo: 'repo',
    });

    expect(agent).toBeDefined();
    expect(typeof agent.generate).toBe('function');
    expect(typeof agent.stream).toBe('function');
  });

  it('exports a non-empty system prompt', () => {
    expect(AGENT_SYSTEM_PROMPT).toBeTruthy();
    expect(AGENT_SYSTEM_PROMPT).toContain('backlog');
    expect(AGENT_SYSTEM_PROMPT).toContain('memory');
    expect(AGENT_SYSTEM_PROMPT).toContain('reflectOnWork');
  });

  it('system prompt contains concrete dependency ordering guidance', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/lower.number/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/dependsOn|depends.on/i);
  });

  it('system prompt instructs model forwarding only to generateSpec', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/forward.*model|model.*forward/i);
    expect(AGENT_SYSTEM_PROMPT).toContain('generateSpec');
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Runtime Config/);
    // Explicitly warns NOT to forward to runLoop
    expect(AGENT_SYSTEM_PROMPT).toMatch(/NOT.*forward.*runLoop|not.*forward.*runLoop/i);
  });

  it('system prompt mentions reviewMode for runLoop', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('reviewMode');
    expect(AGENT_SYSTEM_PROMPT).toContain("'manual'");
    expect(AGENT_SYSTEM_PROMPT).toContain("'auto'");
    expect(AGENT_SYSTEM_PROMPT).toContain("'merge'");
  });

  it('system prompt requires assessFeatureState before action', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('assessFeatureState');
    expect(AGENT_SYSTEM_PROMPT).toMatch(/MANDATORY/);
  });

  it('system prompt contains Feature State Decision Tree', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('Feature State Decision Tree');
    expect(AGENT_SYSTEM_PROMPT).toContain('start_fresh');
    expect(AGENT_SYSTEM_PROMPT).toContain('resume_implementation');
    expect(AGENT_SYSTEM_PROMPT).toContain('resume_pr_phase');
    expect(AGENT_SYSTEM_PROMPT).toContain('pr_exists_open');
    expect(AGENT_SYSTEM_PROMPT).toContain('pr_merged');
    expect(AGENT_SYSTEM_PROMPT).toContain('pr_closed');
    expect(AGENT_SYSTEM_PROMPT).toContain('generate_plan');
    expect(AGENT_SYSTEM_PROMPT).toContain('linked_pr_merged');
    expect(AGENT_SYSTEM_PROMPT).toContain('linked_pr_open');
  });

  it('system prompt instructs passing issueNumber and using stable feature names', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('issueNumber');
    expect(AGENT_SYSTEM_PROMPT).toMatch(/kebab-case/);
  });

  it('system prompt instructs resume: true for resume recommendations', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/resume.*true/i);
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

  it('combines multiple constraints', () => {
    const result = buildConstraints({ ...base, maxItems: 2, labels: ['P0'] });
    expect(result).toContain('2 issue(s)');
    expect(result).toContain('P0');
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
    const result = buildRuntimeConfig({ ...base, modelId: 'gpt-5.2-codex' });
    expect(result).toContain('model: gpt-5.2-codex');
    expect(result).toContain('Runtime Config');
  });

  it('includes provider when provided', () => {
    const result = buildRuntimeConfig({ ...base, provider: 'openai' });
    expect(result).toContain('provider: openai');
  });

  it('includes both model and provider', () => {
    const result = buildRuntimeConfig({ ...base, modelId: 'opus', provider: 'anthropic' });
    expect(result).toContain('model: opus');
    expect(result).toContain('provider: anthropic');
  });

  it('includes reviewMode when provided', () => {
    const result = buildRuntimeConfig({ ...base, reviewMode: 'auto' });
    expect(result).toContain('reviewMode: auto');
    expect(result).toContain('Runtime Config');
  });

  it('includes reviewMode with model and provider', () => {
    const result = buildRuntimeConfig({ ...base, modelId: 'opus', provider: 'anthropic', reviewMode: 'merge' });
    expect(result).toContain('model: opus');
    expect(result).toContain('provider: anthropic');
    expect(result).toContain('reviewMode: merge');
  });
});
