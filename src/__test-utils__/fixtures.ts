/**
 * Data factories for test fixtures
 *
 * Provides factory functions to build typed test data with sensible defaults.
 * Use the `overrides` parameter to customize specific fields per test.
 */

import type { SessionState } from '../repl/session-state.js';
import type { ScanResult } from '../scanner/types.js';

/**
 * Create a SessionState with sensible defaults.
 */
export function createTestSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    projectRoot: '/tmp/test-project',
    config: null,
    provider: 'anthropic',
    model: 'sonnet',
    conversationMode: false,
    initialized: true,
    ...overrides,
  };
}

/**
 * Create a ScanResult with sensible defaults.
 */
export function createTestScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    projectRoot: '/tmp/test-project',
    stack: {},
    scanTime: 42,
    ...overrides,
  };
}
