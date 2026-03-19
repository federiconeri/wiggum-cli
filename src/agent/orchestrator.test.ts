import { describe, it, expect, vi } from 'vitest';

const { mockMemoryStoreRead, mockMemoryStorePrune } = vi.hoisted(() => ({
  mockMemoryStoreRead: vi.fn().mockResolvedValue([]),
  mockMemoryStorePrune: vi.fn().mockResolvedValue(0),
}));

vi.mock('./memory/store.js', () => {
  class MockMemoryStore {
    read = mockMemoryStoreRead;
    prune = mockMemoryStorePrune;
  }
  return { MemoryStore: MockMemoryStore };
});

vi.mock('./memory/ingest.js', () => ({
  ingestStrategicDocs: vi.fn().mockResolvedValue(0),
}));

import { AGENT_SYSTEM_PROMPT, buildConstraints, buildRuntimeConfig, createAgentOrchestrator } from './orchestrator.js';

describe('createAgentOrchestrator', () => {
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
