import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExecutionTools } from './execution.js';

describe('createExecutionTools', () => {
  const tools = createExecutionTools('/fake/root');
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  const testFinalPath = join(tmpdir(), 'ralph-loop-exec-test-feat.final');

  afterEach(() => {
    if (existsSync(testFinalPath)) unlinkSync(testFinalPath);
  });

  describe('checkLoopStatus', () => {
    it('returns status from .final file', async () => {
      writeFileSync(testFinalPath, '3|10|2026-02-25T12:00:00Z|done');

      const result = await tools.checkLoopStatus.execute(
        { featureName: 'exec-test-feat' },
        execCtx,
      );
      expect(result.status).toBe('done');
      expect(result.iteration).toBe(3);
      expect(result.maxIterations).toBe(10);
    });

    it('returns not_found when no status files exist', async () => {
      const result = await tools.checkLoopStatus.execute(
        { featureName: 'nonexistent-feature-xyz-123' },
        execCtx,
      );
      expect(result.status).toBe('not_found');
    });
  });
});
