import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createIntrospectionTools } from './introspection.js';

describe('createIntrospectionTools', () => {
  const tools = createIntrospectionTools('/fake/root');
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };
  const testLogPath = join(tmpdir(), 'ralph-loop-intro-test.log');

  afterEach(() => {
    if (existsSync(testLogPath)) unlinkSync(testLogPath);
  });

  describe('readLoopLog', () => {
    it('reads the last N lines of a loop log', async () => {
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(testLogPath, lines.join('\n'));

      const result = await tools.readLoopLog.execute(
        { featureName: 'intro-test', tailLines: 5 },
        execCtx,
      );
      expect(result.lines).toHaveLength(5);
      expect(result.lines[4]).toBe('Line 200');
    });

    it('returns error when log does not exist', async () => {
      const result = await tools.readLoopLog.execute(
        { featureName: 'nonexistent-xyz' },
        execCtx,
      );
      expect(result).toHaveProperty('error');
    });
  });
});
