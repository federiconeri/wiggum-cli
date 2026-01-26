/**
 * Init Command Types
 *
 * The init workflow is now handled by the TUI (InitScreen.tsx).
 * This file provides type exports for backward compatibility.
 */

import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/index.js';
import type { RalphConfig } from '../utils/config.js';

export interface InitOptions {
  provider?: AIProvider;
}

/**
 * Result of the init workflow
 */
export interface InitResult {
  success: boolean;
  provider: AIProvider;
  model: string;
  scanResult: ScanResult;
  config: RalphConfig | null;
}
