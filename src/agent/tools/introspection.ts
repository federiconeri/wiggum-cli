import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function createIntrospectionTools(projectRoot: string) {
  const readLoopLog = tool({
    description: 'Read the stdout/stderr log of a development loop (running or completed).',
    inputSchema: zodSchema(z.object({
      featureName: z.string().describe('Feature name whose log to read'),
      tailLines: z.number().int().min(1).max(500).default(100).describe('Number of lines from the end'),
    })),
    execute: async ({ featureName, tailLines }) => {
      const logPath = join(tmpdir(), `ralph-loop-${featureName}.log`);
      if (!existsSync(logPath)) {
        return { error: `No log found at ${logPath}` };
      }

      const content = readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n');
      const lines = allLines.slice(-tailLines);
      return { lines, totalLines: allLines.length };
    },
  });

  const syncContext = tool({
    description: 'Refresh project context by scanning the codebase and running AI analysis. Call before planning if context is stale.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const { syncCommand } = await import('../../commands/sync.js');
      try {
        await syncCommand();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  return { readLoopLog, syncContext };
}
