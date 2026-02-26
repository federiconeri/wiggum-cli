import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryEntry } from './types.js';
import type { MemoryStore } from './store.js';

export async function ingestStrategicDocs(
  projectRoot: string,
  store: MemoryStore,
): Promise<number> {
  const docsDir = join(projectRoot, '.ralph', 'strategic');

  let allFiles: string[];
  try {
    allFiles = await readdir(docsDir);
  } catch {
    return 0; // directory does not exist
  }

  const files = allFiles.filter(f => f.endsWith('.md'));
  if (files.length === 0) return 0;

  const existing = await store.read({ type: 'strategic_context' });
  const ingestedFiles = new Set(
    existing.flatMap(e => (e.tags ?? []).filter(t => t.startsWith('source:')).map(t => t.slice(7))),
  );

  let count = 0;
  for (const file of files) {
    if (ingestedFiles.has(file)) continue;

    const content = await readFile(join(docsDir, file), 'utf-8');
    const truncated = content.length > 2000
      ? content.slice(0, 2000) + '\n...(truncated)'
      : content;

    const entry = createMemoryEntry({
      type: 'strategic_context',
      content: truncated,
      tags: [`source:${file}`],
    });

    await store.append(entry);
    count++;
  }

  return count;
}
