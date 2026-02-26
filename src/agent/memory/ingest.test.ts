import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ingestStrategicDocs, listStrategicDocs, readStrategicDoc } from './ingest.js';
import { MemoryStore } from './store.js';

describe('ingestStrategicDocs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ingest-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('ingests markdown files as catalog entries (filename + summary)', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'strategy.md'), '# Strategy\n\nShip auth first.\n');

    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    const count = await ingestStrategicDocs(tempDir, store);
    expect(count).toBe(1);

    const entries = await store.read({ type: 'strategic_context' });
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain('[strategy.md]');
    expect(entries[0].content).toContain('Strategy');
    expect(entries[0].tags).toContain('source:strategy.md');
  });

  it('stores only a summary, not full content', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'large.md'), '# Title\n\n' + 'x'.repeat(10000));

    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    await ingestStrategicDocs(tempDir, store);
    const entries = await store.read({ type: 'strategic_context' });
    // Summary should be much shorter than the full file
    expect(entries[0].content.length).toBeLessThan(400);
    expect(entries[0].content).toContain('[large.md]');
  });

  it('skips already-ingested files', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
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

  it('returns 0 when no .ralph/strategic/ directory exists', async () => {
    const memoryDir = join(tempDir, '.ralph', 'agent');
    const store = new MemoryStore(memoryDir);

    const count = await ingestStrategicDocs(tempDir, store);
    expect(count).toBe(0);
  });
});

describe('listStrategicDocs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ingest-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists markdown files in .ralph/strategic/', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'design.md'), '# Design');
    writeFileSync(join(docsDir, 'plan.md'), '# Plan');
    writeFileSync(join(docsDir, 'notes.txt'), 'not markdown');

    const files = await listStrategicDocs(tempDir);
    expect(files).toContain('design.md');
    expect(files).toContain('plan.md');
    expect(files).not.toContain('notes.txt');
  });

  it('returns empty array when directory does not exist', async () => {
    const files = await listStrategicDocs(tempDir);
    expect(files).toEqual([]);
  });
});

describe('readStrategicDoc', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ingest-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads full file content without truncation', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
    mkdirSync(docsDir, { recursive: true });
    const fullContent = '# Design\n\n' + 'x'.repeat(50000);
    writeFileSync(join(docsDir, 'design.md'), fullContent);

    const content = await readStrategicDoc(tempDir, 'design.md');
    expect(content).toBe(fullContent);
  });

  it('returns null for non-existent file', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
    mkdirSync(docsDir, { recursive: true });

    const content = await readStrategicDoc(tempDir, 'missing.md');
    expect(content).toBeNull();
  });

  it('sanitizes filename to prevent path traversal', async () => {
    const docsDir = join(tempDir, '.ralph', 'strategic');
    mkdirSync(docsDir, { recursive: true });

    const content = await readStrategicDoc(tempDir, '../../../etc/passwd');
    expect(content).toBeNull();
  });
});
