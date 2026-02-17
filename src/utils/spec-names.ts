import { readdir } from 'fs/promises';
import { join } from 'path';

/**
 * Reads top-level .md files from the given directory and returns their names
 * without the .md extension, sorted alphabetically.
 * Returns an empty array if the directory does not exist or is unreadable.
 */
export async function listSpecNames(specsDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.slice(0, -3))
    .sort();
}
