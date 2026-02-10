/**
 * Global test setup
 *
 * Auto-mocks the tracing module so no Braintrust API key is needed in CI.
 * Individual test files can still override with their own vi.mock calls.
 */

import { vi } from 'vitest';

vi.mock('../utils/tracing.js', () => ({
  initTracing: vi.fn(),
  flushTracing: vi.fn().mockResolvedValue(undefined),
  isTracingEnabled: vi.fn().mockReturnValue(false),
  getTracedAI: vi.fn().mockReturnValue({
    generateText: vi.fn(),
    streamText: vi.fn(),
  }),
  maybeTraced: vi.fn(<T>(fn: T) => fn),
  traced: vi.fn(<T>(fn: T) => fn),
  currentSpan: vi.fn().mockReturnValue({}),
  wrapTraced: vi.fn(<T>(fn: T) => fn),
}));
