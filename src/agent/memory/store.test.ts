import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from './store.js';
import type { MemoryEntry } from './types.js';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type: 'work_log',
    content: 'test content',
    ...overrides,
  };
}

describe('MemoryStore', () => {
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memory-store-'));
    store = new MemoryStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('appends and reads entries', async () => {
    const entry = makeEntry({ content: 'hello world' });
    await store.append(entry);

    const entries = await store.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('hello world');
  });

  it('appends multiple entries preserving order', async () => {
    await store.append(makeEntry({ content: 'first' }));
    await store.append(makeEntry({ content: 'second' }));

    const entries = await store.read();
    // read() reverses (most recent first)
    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe('second');
    expect(entries[1].content).toBe('first');
  });

  it('filters by type', async () => {
    await store.append(makeEntry({ type: 'work_log', content: 'log' }));
    await store.append(makeEntry({ type: 'decision', content: 'dec' }));
    await store.append(makeEntry({ type: 'work_log', content: 'log2' }));

    const logs = await store.read({ type: 'work_log' });
    expect(logs).toHaveLength(2);
    expect(logs.every(e => e.type === 'work_log')).toBe(true);
  });

  it('limits results (most recent first)', async () => {
    await store.append(makeEntry({ content: 'old' }));
    await store.append(makeEntry({ content: 'new' }));

    const limited = await store.read({ limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0].content).toBe('new');
  });

  it('searches by content substring', async () => {
    await store.append(makeEntry({ content: 'auth middleware works' }));
    await store.append(makeEntry({ content: 'billing integration' }));

    const results = await store.read({ search: 'auth' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('auth');
  });

  it('returns empty array when file does not exist', async () => {
    const entries = await store.read();
    expect(entries).toEqual([]);
  });

  it('creates directory if it does not exist', async () => {
    const nested = join(tempDir, 'deep', 'nested');
    const nestedStore = new MemoryStore(nested);
    await nestedStore.append(makeEntry({ content: 'nested' }));

    const entries = await nestedStore.read();
    expect(entries).toHaveLength(1);
  });

  it('skips malformed JSONL lines gracefully', async () => {
    await store.append(makeEntry({ content: 'valid entry' }));
    // Corrupt the file by appending invalid JSON
    const filePath = join(tempDir, 'memory.jsonl');
    writeFileSync(filePath,
      JSON.stringify(makeEntry({ content: 'valid entry' })) + '\n' +
      'THIS IS NOT JSON\n' +
      JSON.stringify(makeEntry({ content: 'also valid' })) + '\n',
    );

    const entries = await store.read();
    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe('also valid');
    expect(entries[1].content).toBe('valid entry');
  });

  it('prune skips malformed JSONL lines without crashing', async () => {
    const filePath = join(tempDir, 'memory.jsonl');
    writeFileSync(filePath,
      JSON.stringify(makeEntry({ content: 'good' })) + '\n' +
      '{broken\n',
    );

    const pruned = await store.prune();
    expect(pruned).toBe(0); // good entry is recent, nothing pruned

    const entries = await store.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('good');
  });

  it('keeps work_log entries under 30 days', async () => {
    const midAge = makeEntry({
      type: 'work_log',
      content: '20-day-old log',
      timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await store.append(midAge);

    const pruned = await store.prune();
    expect(pruned).toBe(0);

    const entries = await store.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('20-day-old log');
  });

  it('filters by both type and search together', async () => {
    await store.append(makeEntry({ type: 'work_log', content: 'auth middleware works' }));
    await store.append(makeEntry({ type: 'decision', content: 'auth uses JWT' }));
    await store.append(makeEntry({ type: 'work_log', content: 'billing integration' }));

    const results = await store.read({ type: 'work_log', search: 'auth' });
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('work_log');
    expect(results[0].content).toContain('auth');
  });

  it('serializes read() with append() and prune() to prevent races', async () => {
    // Queue operations concurrently — if read() were not serialized,
    // it could see partial state from a concurrent prune()
    await store.append(makeEntry({ content: 'entry-a' }));
    await store.append(makeEntry({ content: 'entry-b' }));

    // Launch all three concurrently
    const [readResult, , pruneResult] = await Promise.all([
      store.read(),
      store.append(makeEntry({ content: 'entry-c' })),
      store.prune(),
    ]);

    // read() should return a valid array (not throw or return corrupt data)
    expect(Array.isArray(readResult)).toBe(true);
    expect(readResult.length).toBeGreaterThanOrEqual(2);
    // prune() should succeed
    expect(typeof pruneResult).toBe('number');
  });

  it('prunes old entries but keeps decisions', async () => {
    const old = makeEntry({
      type: 'work_log',
      content: 'old log',
      timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const recent = makeEntry({ type: 'work_log', content: 'recent log' });
    const oldDecision = makeEntry({
      type: 'decision',
      content: 'old decision',
      timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await store.append(old);
    await store.append(recent);
    await store.append(oldDecision);

    const pruned = await store.prune();
    expect(pruned).toBe(1);

    const entries = await store.read();
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.content === 'old log')).toBeUndefined();
    expect(entries.find(e => e.content === 'old decision')).toBeDefined();
  });
});
