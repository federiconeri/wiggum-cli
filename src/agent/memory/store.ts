import { readFile, writeFile, appendFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { MemoryEntry, MemoryType } from './types.js';

const MEMORY_FILE = 'memory.jsonl';
const FILE_MODE = 0o600;
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PERMANENT_TYPES: MemoryType[] = ['decision', 'strategic_context'];

export interface ReadOptions {
  type?: MemoryType;
  limit?: number;
  search?: string;
}

export class MemoryStore {
  private readonly filePath: string;

  constructor(dirPath: string) {
    this.filePath = join(dirPath, MEMORY_FILE);
  }

  async append(entry: MemoryEntry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + '\n', { encoding: 'utf-8', mode: FILE_MODE });
  }

  async read(options: ReadOptions = {}): Promise<MemoryEntry[]> {
    if (!existsSync(this.filePath)) return [];

    const raw = (await readFile(this.filePath, 'utf-8')).trim();
    if (!raw) return [];

    let entries: MemoryEntry[] = raw
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line) as MemoryEntry; }
        catch { return null; }
      })
      .filter((e): e is MemoryEntry => e !== null);

    if (options.type) {
      entries = entries.filter(e => e.type === options.type);
    }

    if (options.search) {
      const term = options.search.toLowerCase();
      entries = entries.filter(e => e.content.toLowerCase().includes(term));
    }

    // Most recent first for limit
    entries.reverse();

    if (options.limit && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  async prune(): Promise<number> {
    if (!existsSync(this.filePath)) return 0;

    const raw = (await readFile(this.filePath, 'utf-8')).trim();
    if (!raw) return 0;

    const entries: MemoryEntry[] = raw
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line) as MemoryEntry; }
        catch { return null; }
      })
      .filter((e): e is MemoryEntry => e !== null);

    const now = Date.now();
    const kept = entries.filter(entry => {
      const age = now - new Date(entry.timestamp).getTime();
      if (PERMANENT_TYPES.includes(entry.type)) return true;
      return age < PRUNE_AGE_MS;
    });

    const pruned = entries.length - kept.length;
    if (pruned > 0) {
      // Atomic write: write to temp file then rename
      const tmpPath = this.filePath + '.tmp';
      const content = kept.map(e => JSON.stringify(e)).join('\n') + '\n';
      await writeFile(tmpPath, content, { encoding: 'utf-8', mode: FILE_MODE });
      await rename(tmpPath, this.filePath);
    }

    return pruned;
  }
}
