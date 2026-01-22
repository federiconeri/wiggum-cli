/**
 * Session State Management
 * Maintains state for the interactive REPL session
 */

import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/types.js';
import type { RalphConfig } from '../utils/config.js';

/**
 * Session state for the REPL
 */
export interface SessionState {
  /** Root directory of the project */
  projectRoot: string;
  /** Loaded Ralph configuration */
  config: RalphConfig | null;
  /** AI provider being used */
  provider: AIProvider;
  /** Model to use for AI operations */
  model: string;
  /** Cached scan result from init */
  scanResult?: ScanResult;
  /** Whether we're in a conversation mode (e.g., spec generation) */
  conversationMode: boolean;
  /** Current conversation context (e.g., 'spec-generation') */
  conversationContext?: string;
}

/**
 * Create a new session state
 */
export function createSessionState(
  projectRoot: string,
  provider: AIProvider,
  model: string,
  scanResult?: ScanResult,
  config?: RalphConfig | null
): SessionState {
  return {
    projectRoot,
    config: config ?? null,
    provider,
    model,
    scanResult,
    conversationMode: false,
    conversationContext: undefined,
  };
}

/**
 * Update session state immutably
 */
export function updateSessionState(
  state: SessionState,
  updates: Partial<SessionState>
): SessionState {
  return { ...state, ...updates };
}
