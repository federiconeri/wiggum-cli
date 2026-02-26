import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const FEATURE_NAME_SCHEMA = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).max(100)
  .describe('Feature name (alphanumeric, hyphens, underscores)');

export function createIntrospectionTools(projectRoot: string) {
  const readLoopLog = tool({
    description: 'Read the stdout/stderr log of a development loop (running or completed).',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
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
