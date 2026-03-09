/**
 * Global test setup
 *
 * Auto-mocks the tracing module so no Braintrust API key is needed in CI.
 * Individual test files can still override with their own vi.mock calls.
 */

import { vi } from 'vitest';

vi.mock('../utils/tracing.js', async () => {
  const { ToolLoopAgent } = await vi.importActual<typeof import('ai')>('ai');
  return {
    initTracing: vi.fn(),
    flushTracing: vi.fn().mockResolvedValue(undefined),
    isTracingEnabled: vi.fn().mockReturnValue(false),
    getTracedAI: vi.fn().mockReturnValue({
      generateText: vi.fn(),
      streamText: vi.fn(),
      ToolLoopAgent,
    }),
    maybeTraced: vi.fn(<T>(fn: T) => fn),
    traced: vi.fn((fn: (...args: unknown[]) => unknown) => fn()),
    currentSpan: vi.fn().mockReturnValue({ log: vi.fn(), id: 'mock-span-id' }),
    wrapTraced: vi.fn(<T>(fn: T) => fn),
  };
});
