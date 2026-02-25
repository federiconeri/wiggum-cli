import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryTools } from './memory.js';
import { MemoryStore } from '../memory/store.js';
import { createMemoryEntry } from '../memory/types.js';

describe('createMemoryTools', () => {
  let tempDir: string;
  let store: MemoryStore;
  let tools: ReturnType<typeof createMemoryTools>;
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memory-tools-'));
    store = new MemoryStore(tempDir);
    tools = createMemoryTools(store);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('readMemory returns entries', async () => {
    await store.append(createMemoryEntry({ type: 'work_log', content: 'did work' }));

    const result = await tools.readMemory.execute({ limit: 10 }, execCtx);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toBe('did work');
  });

  it('writeMemory appends to store', async () => {
    const result = await tools.writeMemory.execute(
      { type: 'project_knowledge', content: 'tests need mocks' },
      execCtx,
    );
    expect(result).toHaveProperty('id');

    const entries = await store.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('project_knowledge');
  });

  it('reflectOnWork writes work_log entry', async () => {
    const result = await tools.reflectOnWork.execute(
      {
        issueNumber: 42,
        outcome: 'success',
        whatWorked: 'TDD approach saved time',
        whatFailed: 'E2E selectors were flaky',
      },
      execCtx,
    );
    expect(result.memoriesWritten).toBe(1);

    const entries = await store.read({ type: 'work_log' });
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain('#42');
  });

  it('reflectOnWork writes pattern as project_knowledge', async () => {
    const result = await tools.reflectOnWork.execute(
      {
        issueNumber: 42,
        outcome: 'success',
        whatWorked: 'TDD',
        whatFailed: 'nothing',
        patternDiscovered: 'Always use data-testid',
      },
      execCtx,
    );
    expect(result.memoriesWritten).toBe(2);

    const knowledge = await store.read({ type: 'project_knowledge' });
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].content).toBe('Always use data-testid');
  });

  it('reflectOnWork writes spec quality note', async () => {
    await tools.reflectOnWork.execute(
      {
        issueNumber: 42,
        outcome: 'partial',
        whatWorked: 'code gen',
        whatFailed: 'unclear spec',
        specQualityNote: 'Need clearer acceptance criteria',
      },
      execCtx,
    );

    const knowledge = await store.read({ type: 'project_knowledge' });
    expect(knowledge.some(e => e.content.includes('Spec quality'))).toBe(true);
  });
});
