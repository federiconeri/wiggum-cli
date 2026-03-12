import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const { mockSyncProjectContext, mockOpen } = vi.hoisted(() => ({
  mockSyncProjectContext: vi.fn(),
  mockOpen: vi.fn<Parameters<typeof import('node:fs/promises').open>, ReturnType<typeof import('node:fs/promises').open>>(),
}));

vi.mock('../../commands/sync.js', () => ({
  syncProjectContext: mockSyncProjectContext,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: (...args: Parameters<typeof actual.open>) => {
      if (mockOpen.mock.calls.length > 0 && mockOpen.mock.results.length === 0) {
        return mockOpen(...args);
      }
      // Use mockOpen when it has an implementation set
      const impl = mockOpen.getMockImplementation();
      if (impl) return mockOpen(...args);
      return actual.open(...args);
    },
  };
});

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

    it('uses readFile path for small files and returns correct tail', async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `SmallLine ${i + 1}`);
      writeFileSync(testLogPath, lines.join('\n'));

      const result = await tools.readLoopLog.execute(
        { featureName: 'intro-test', tailLines: 3 },
        execCtx,
      );
      expect(result.lines).toHaveLength(3);
      expect(result.lines[2]).toBe('SmallLine 10');
      expect(result.totalLines).toBe(10);
    });

    it('uses bounded fd read for large files and returns tail from last chunk', async () => {
      // Create a file just over 1 MB. Fill the first part with dummy content,
      // then append known lines at the end so they fall within the last 1 MB chunk.
      const MAX_BYTES = 1_048_576;
      const knownLines = Array.from({ length: 20 }, (_, i) => `KnownLine ${i + 1}`);
      const knownContent = knownLines.join('\n');
      // Pad to exceed 1 MB: fill with 'x' chars plus a newline prefix
      const paddingSize = MAX_BYTES + 100 - knownContent.length;
      const padding = 'x'.repeat(paddingSize) + '\n';
      writeFileSync(testLogPath, padding + knownContent);

      const result = await tools.readLoopLog.execute(
        { featureName: 'intro-test', tailLines: 5 },
        execCtx,
      );
      // Last 5 lines should come from the known lines at end of file
      expect(result.lines).toHaveLength(5);
      expect(result.lines[4]).toBe('KnownLine 20');
      expect(result.lines[0]).toBe('KnownLine 16');
    });

    it('closes the file descriptor even when read throws', async () => {
      const MAX_BYTES = 1_048_576;
      // Create a file > 1 MB so the fd path is triggered
      writeFileSync(testLogPath, 'x'.repeat(MAX_BYTES + 1));

      const mockFd = {
        read: vi.fn().mockRejectedValue(new Error('read failure')),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockOpen.mockResolvedValueOnce(mockFd as any);

      await expect(
        tools.readLoopLog.execute({ featureName: 'intro-test', tailLines: 10 }, execCtx),
      ).rejects.toThrow('read failure');

      expect(mockFd.close).toHaveBeenCalledOnce();
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
