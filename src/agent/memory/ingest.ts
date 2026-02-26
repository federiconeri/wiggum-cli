import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryEntry } from './types.js';
import type { MemoryStore } from './store.js';

const SUMMARY_LENGTH = 300;

/**
 * Extract the first heading and opening lines as a summary.
 */
function summarize(content: string): string {
  const lines = content.split('\n').filter(l => l.trim());
  const summary = lines.slice(0, 8).join('\n');
  return summary.length > SUMMARY_LENGTH
    ? summary.slice(0, SUMMARY_LENGTH) + '…'
    : summary;
}

/**
 * Ingest strategic docs as lightweight catalog entries (filename + summary).
 * Full content is read on-demand via the readStrategicDoc tool.
 */
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
    const summary = summarize(content);

    const entry = createMemoryEntry({
      type: 'strategic_context',
      content: `[${file}] ${summary}`,
      tags: [`source:${file}`],
    });

    await store.append(entry);
    count++;
  }

  return count;
}

/**
 * List available strategic doc filenames.
 */
export async function listStrategicDocs(projectRoot: string): Promise<string[]> {
  const docsDir = join(projectRoot, '.ralph', 'strategic');
  try {
    const allFiles = await readdir(docsDir);
    return allFiles.filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Read the full content of a strategic doc.
 */
export async function readStrategicDoc(
  projectRoot: string,
  filename: string,
): Promise<string | null> {
  const docsDir = join(projectRoot, '.ralph', 'strategic');
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  try {
    return await readFile(join(docsDir, safeName), 'utf-8');
  } catch {
    return null;
  }
}
