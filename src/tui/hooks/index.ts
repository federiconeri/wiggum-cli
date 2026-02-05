/**
 * Custom React hooks for the Wiggum TUI
 */

export { useSpecGenerator } from './useSpecGenerator.js';
export type {
  GeneratorPhase,
  PhaseConfig,
  SpecGeneratorState,
  SpecGeneratorOptions,
  UseSpecGeneratorReturn,
} from './useSpecGenerator.js';
export { PHASE_CONFIGS, TOTAL_DISPLAY_PHASES } from './useSpecGenerator.js';

export { useInit } from './useInit.js';
export type {
  InitPhase,
  InitPhaseConfig,
  InitState,
  UseInitReturn,
} from './useInit.js';
export { INIT_PHASE_CONFIGS, INIT_TOTAL_PHASES } from './useInit.js';

export { useCommandHistory } from './useCommandHistory.js';
export type { UseCommandHistoryReturn } from './useCommandHistory.js';

export { useSync } from './useSync.js';
export type { SyncStatus, UseSyncReturn } from './useSync.js';
