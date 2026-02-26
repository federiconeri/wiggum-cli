/**
 * Tracing mock factory
 *
 * Returns a mock module object for vi.mock('…/utils/tracing.js').
 * The global setup already mocks tracing, but this is useful when
 * a test needs direct access to the mock functions.
 */

import { vi } from 'vitest';
import { ToolLoopAgent } from 'ai';

export function mockTracing() {
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
}
