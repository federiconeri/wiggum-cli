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

import { createAgentOrchestrator, AGENT_SYSTEM_PROMPT, buildConstraints } from './orchestrator.js';

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

  it('includes milestone constraint', () => {
    const result = buildConstraints({ ...base, milestone: 'Alpha' });
    expect(result).toContain('Alpha');
  });

  it('combines multiple constraints', () => {
    const result = buildConstraints({ ...base, maxItems: 2, labels: ['P0'] });
    expect(result).toContain('2 issue(s)');
    expect(result).toContain('P0');
  });
});
