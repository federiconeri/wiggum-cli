import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Reads top-level .md files from the given directory and returns their names
 * without the .md extension, sorted alphabetically.
 * Returns an empty array if the directory does not exist or is unreadable.
 */
export async function listSpecNames(specsDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(specsDir, { withFileTypes: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Log non-ENOENT errors for debugging (ENOENT is expected when no specs dir exists)
      // eslint-disable-next-line no-console
      console.debug(`Failed to list spec names from ${specsDir}: ${err.message}`);
    }
    return [];
  }

  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.slice(0, -3))
    .sort();
}
