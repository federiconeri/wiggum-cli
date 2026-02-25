import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { MemoryEntry, MemoryType } from './types.js';

const MEMORY_FILE = 'memory.jsonl';
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const KEEP_RECENT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
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
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  async read(options: ReadOptions = {}): Promise<MemoryEntry[]> {
    if (!existsSync(this.filePath)) return [];

    const raw = readFileSync(this.filePath, 'utf-8').trim();
    if (!raw) return [];

    let entries: MemoryEntry[] = raw
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as MemoryEntry);

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

    const raw = readFileSync(this.filePath, 'utf-8').trim();
    if (!raw) return 0;

    const entries: MemoryEntry[] = raw
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as MemoryEntry);

    const now = Date.now();
    const kept = entries.filter(entry => {
      const age = now - new Date(entry.timestamp).getTime();
      if (age < KEEP_RECENT_MS) return true;
      if (PERMANENT_TYPES.includes(entry.type)) return true;
      return age < PRUNE_AGE_MS;
    });

    const pruned = entries.length - kept.length;
    if (pruned > 0) {
      writeFileSync(
        this.filePath,
        kept.map(e => JSON.stringify(e)).join('\n') + '\n',
        'utf-8',
      );
    }

    return pruned;
  }
}
