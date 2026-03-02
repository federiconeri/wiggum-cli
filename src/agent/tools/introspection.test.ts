import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const { mockSyncProjectContext } = vi.hoisted(() => ({
  mockSyncProjectContext: vi.fn(),
}));

vi.mock('../../commands/sync.js', () => ({
  syncProjectContext: mockSyncProjectContext,
}));

import { createIntrospectionTools } from './introspection.js';

describe('createIntrospectionTools', () => {
  const tools = createIntrospectionTools('/fake/root');
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };
  const testLogPath = join('/tmp', 'ralph-loop-intro-test.log');

  afterEach(() => {
    vi.clearAllMocks();
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

    it('returns error with attempted path when log does not exist', async () => {
      const result = await tools.readLoopLog.execute(
        { featureName: 'nonexistent-xyz' },
        execCtx,
      );
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('ralph-loop-nonexistent-xyz.log');
    });
  });

  describe('syncContext', () => {
    it('returns success with context path', async () => {
      mockSyncProjectContext.mockResolvedValue('/fake/root/.ralph/.context.json');

      const result = await tools.syncContext.execute({}, execCtx);

      expect(result.success).toBe(true);
      expect(result.contextPath).toBe('/fake/root/.ralph/.context.json');
      expect(mockSyncProjectContext).toHaveBeenCalledWith('/fake/root');
    });

    it('returns error when sync fails', async () => {
      mockSyncProjectContext.mockRejectedValue(new Error('No provider'));

      const result = await tools.syncContext.execute({}, execCtx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No provider');
    });
  });
});
