import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFile, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { FEATURE_NAME_SCHEMA } from './schemas.js';

const MAX_LOG_BYTES = 1_048_576; // 1 MB

export function createIntrospectionTools(projectRoot: string) {
  const readLoopLog = tool({
    description: 'Read the stdout/stderr log of a development loop (running or completed).',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      tailLines: z.number().int().min(1).max(500).default(100).describe('Number of lines from the end'),
    })),
    execute: async ({ featureName, tailLines }) => {
      const logPath = join('/tmp', `ralph-loop-${featureName}.log`);

      let fileSize: number;
      try {
        const fileStat = await stat(logPath);
        fileSize = fileStat.size;
      } catch {
        return { error: `No log found at ${logPath} — verify featureName matches exactly what runLoop used` };
      }

      let content: string;
      if (fileSize <= MAX_LOG_BYTES) {
        content = await readFile(logPath, 'utf-8');
      } else {
        // For large files, read only the last MAX_LOG_BYTES to bound memory usage.
        // totalLines will reflect lines in the chunk, not the full file.
        const offset = fileSize - MAX_LOG_BYTES;
        const fd = await open(logPath, 'r');
        try {
          const buffer = Buffer.allocUnsafe(MAX_LOG_BYTES);
          await fd.read(buffer, 0, MAX_LOG_BYTES, offset);
          content = buffer.toString('utf-8');
        } finally {
          await fd.close();
        }
      }

      const allLines = content.split('\n');
      const lines = allLines.slice(-tailLines);
      return { lines, totalLines: allLines.length };
    },
  });

  const syncContext = tool({
    description: 'Refresh project context by scanning the codebase and running AI analysis. Call before planning if context is stale.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const { syncProjectContext } = await import('../../commands/sync.js');
      try {
        const contextPath = await syncProjectContext(projectRoot);
        return { success: true, contextPath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  return { readLoopLog, syncContext };
}
