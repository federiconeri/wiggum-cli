import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ingestStrategicDocs } from './ingest.js';
import { MemoryStore } from './store.js';

describe('ingestStrategicDocs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ingest-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('ingests markdown files from docs/plans/', async () => {
    const docsDir = join(tempDir, 'docs', 'plans');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'strategy.md'), '# Strategy\n\nShip auth first.\n');

    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    const count = await ingestStrategicDocs(tempDir, store);
    expect(count).toBe(1);

    const entries = await store.read({ type: 'strategic_context' });
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain('Strategy');
    expect(entries[0].tags).toContain('source:strategy.md');
  });

  it('skips already-ingested files', async () => {
    const docsDir = join(tempDir, 'docs', 'plans');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'plan.md'), '# Plan\n\nDo things.\n');

    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    await ingestStrategicDocs(tempDir, store);
    const secondCount = await ingestStrategicDocs(tempDir, store);

    expect(secondCount).toBe(0);
    const entries = await store.read({ type: 'strategic_context' });
    expect(entries).toHaveLength(1);
  });

  it('returns 0 when no docs/plans/ directory exists', async () => {
    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    const count = await ingestStrategicDocs(tempDir, store);
    expect(count).toBe(0);
  });

  it('truncates large files', async () => {
    const docsDir = join(tempDir, 'docs', 'plans');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'large.md'), 'x'.repeat(5000));

    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    await ingestStrategicDocs(tempDir, store);
    const entries = await store.read({ type: 'strategic_context' });
    expect(entries[0].content.length).toBeLessThan(2100);
    expect(entries[0].content).toContain('(truncated)');
  });
});
