/**
 * useInit - State management hook for the init workflow
 *
 * Manages the initialization flow phases:
 * 1. scanning - Scan project structure
 * 2. provider-select - Select AI provider (if no key available)
 * 3. key-input - Enter API key
 * 4. key-save - Confirm saving key to .env.local
 * 5. model-select - Select model
 * 6. ai-analysis - Run AI analysis
 * 7. confirm - Confirm file generation
 * 8. generating - Generate configuration files
 * 9. complete - Done
 */

import { useState, useCallback, useRef } from 'react';
import type { AIProvider } from '../../ai/providers.js';
import type { ScanResult } from '../../scanner/types.js';
import type { EnhancedScanResult } from '../../ai/index.js';

/**
 * Init workflow phases
 */
export type InitPhase =
  | 'scanning'
  | 'provider-select'
  | 'key-input'
  | 'key-save'
  | 'model-select'
  | 'ai-analysis'
  | 'confirm'
  | 'generating'
  | 'complete'
  | 'error';

/**
 * Phase configuration for display
 */
export interface InitPhaseConfig {
  /** Phase number for progress display */
  number: number;
  /** Human-readable phase name */
  name: string;
  /** Description of what happens in this phase */
  description: string;
}

/**
 * Phase configurations for display
 */
export const INIT_PHASE_CONFIGS: Record<InitPhase, InitPhaseConfig> = {
  scanning: {
    number: 1,
    name: 'Scanning',
    description: 'Analyzing project structure',
  },
  'provider-select': {
    number: 2,
    name: 'Provider',
    description: 'Select AI provider',
  },
  'key-input': {
    number: 2,
    name: 'API Key',
    description: 'Enter API key',
  },
  'key-save': {
    number: 2,
    name: 'Save Key',
    description: 'Save API key to .env.local',
  },
  'model-select': {
    number: 3,
    name: 'Model',
    description: 'Select AI model',
  },
  'ai-analysis': {
    number: 4,
    name: 'Analysis',
    description: 'AI-powered codebase analysis',
  },
  confirm: {
    number: 5,
    name: 'Confirm',
    description: 'Confirm file generation',
  },
  generating: {
    number: 5,
    name: 'Generating',
    description: 'Creating configuration files',
  },
  complete: {
    number: 6,
    name: 'Complete',
    description: 'Initialization complete',
  },
  error: {
    number: 0,
    name: 'Error',
    description: 'An error occurred',
  },
};

/**
 * Total display phases for progress bar
 */
export const INIT_TOTAL_PHASES = 5;

/**
 * State managed by the useInit hook
 */
export interface InitState {
  /** Current phase of the init workflow */
  phase: InitPhase;
  /** Project root directory */
  projectRoot: string;
  /** Scan result from project analysis */
  scanResult: ScanResult | null;
  /** Enhanced scan result after AI analysis */
  enhancedResult: EnhancedScanResult | null;
  /** Selected AI provider */
  provider: AIProvider | null;
  /** Selected model */
  model: string | null;
  /** API key entered (not persisted in state for security) */
  hasApiKey: boolean;
  /** Whether API key was entered this session (needs save prompt) */
  apiKeyEnteredThisSession: boolean;
  /** Whether user wants to save key to .env.local */
  saveKeyToEnv: boolean;
  /** Whether AI analysis is in progress */
  isWorking: boolean;
  /** Status message for working indicator */
  workingStatus: string;
  /** Error message if something went wrong */
  error: string | null;
  /** Generated files list */
  generatedFiles: string[];
  /** Token usage from AI analysis */
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
}

/**
 * Initial state
 */
const initialState: InitState = {
  phase: 'scanning',
  projectRoot: '',
  scanResult: null,
  enhancedResult: null,
  provider: null,
  model: null,
  hasApiKey: false,
  apiKeyEnteredThisSession: false,
  saveKeyToEnv: false,
  isWorking: false,
  workingStatus: '',
  error: null,
  generatedFiles: [],
  tokenUsage: null,
};

/**
 * Return value from useInit hook
 */
export interface UseInitReturn {
  /** Current state */
  state: InitState;

  /** Initialize with project root */
  initialize: (projectRoot: string) => void;

  /** Set scan result and advance to next phase */
  setScanResult: (result: ScanResult) => void;

  /** Set that an existing API key is available */
  setExistingProvider: (provider: AIProvider) => void;

  /** Set selected provider */
  selectProvider: (provider: AIProvider) => void;

  /** Set API key (marks as entered this session) */
  setApiKey: (key: string) => void;

  /** Set whether to save key to .env.local */
  setSaveKey: (save: boolean) => void;

  /** Select model and advance to AI analysis */
  selectModel: (model: string) => void;

  /** Set AI analysis progress */
  setAiProgress: (status: string) => void;

  /** Set enhanced result from AI analysis */
  setEnhancedResult: (result: EnhancedScanResult, tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;

  /** Set AI analysis error */
  setAiError: (error: string) => void;

  /** Confirm file generation */
  confirmGeneration: (confirmed: boolean) => void;

  /** Set generation in progress */
  setGenerating: (status: string) => void;

  /** Set generation complete */
  setGenerationComplete: (files: string[]) => void;

  /** Set error state */
  setError: (error: string) => void;

  /** Reset to initial state */
  reset: () => void;

  /** Go back to previous phase */
  goBack: () => void;
}

/**
 * useInit - React hook for managing init workflow state
 */
export function useInit(): UseInitReturn {
  const [state, setState] = useState<InitState>(initialState);

  // Store API key in ref (not in state for security)
  const apiKeyRef = useRef<string | null>(null);

  /**
   * Initialize with project root
   */
  const initialize = useCallback((projectRoot: string) => {
    setState({
      ...initialState,
      projectRoot,
      phase: 'scanning',
      isWorking: true,
      workingStatus: 'Scanning project structure...',
    });
  }, []);

  /**
   * Set scan result and determine next phase
   */
  const setScanResult = useCallback((result: ScanResult) => {
    setState((prev) => ({
      ...prev,
      scanResult: result,
      isWorking: false,
      workingStatus: '',
      // Will be set to correct phase by setExistingProvider or continue to provider-select
    }));
  }, []);

  /**
   * Set that an existing API key is available
   */
  const setExistingProvider = useCallback((provider: AIProvider) => {
    setState((prev) => ({
      ...prev,
      provider,
      hasApiKey: true,
      apiKeyEnteredThisSession: false,
      phase: 'model-select',
    }));
  }, []);

  /**
   * Set selected provider (when no existing key)
   */
  const selectProvider = useCallback((provider: AIProvider) => {
    setState((prev) => ({
      ...prev,
      provider,
      phase: 'key-input',
    }));
  }, []);

  /**
   * Set API key
   */
  const setApiKey = useCallback((key: string) => {
    apiKeyRef.current = key;
    setState((prev) => ({
      ...prev,
      hasApiKey: true,
      apiKeyEnteredThisSession: true,
      phase: 'key-save',
    }));
  }, []);

  /**
   * Set whether to save key to .env.local
   */
  const setSaveKey = useCallback((save: boolean) => {
    setState((prev) => ({
      ...prev,
      saveKeyToEnv: save,
      phase: 'model-select',
    }));
  }, []);

  /**
   * Select model and advance to AI analysis
   */
  const selectModel = useCallback((model: string) => {
    setState((prev) => ({
      ...prev,
      model,
      phase: 'ai-analysis',
      isWorking: true,
      workingStatus: 'Initializing AI analysis...',
    }));
  }, []);

  /**
   * Set AI analysis progress
   */
  const setAiProgress = useCallback((status: string) => {
    setState((prev) => ({
      ...prev,
      workingStatus: status,
    }));
  }, []);

  /**
   * Set enhanced result from AI analysis
   */
  const setEnhancedResult = useCallback(
    (result: EnhancedScanResult, tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }) => {
      setState((prev) => ({
        ...prev,
        enhancedResult: result,
        tokenUsage: tokenUsage || null,
        isWorking: false,
        workingStatus: '',
        phase: 'confirm' as const,
      }));
    },
    []
  );

  /**
   * Set AI analysis error
   */
  const setAiError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      error,
      isWorking: false,
      workingStatus: '',
      // Continue to confirm even with AI error (will use non-enhanced scan result)
      phase: 'confirm',
    }));
  }, []);

  /**
   * Confirm file generation
   */
  const confirmGeneration = useCallback((confirmed: boolean) => {
    if (confirmed) {
      setState((prev) => ({
        ...prev,
        phase: 'generating',
        isWorking: true,
        workingStatus: 'Generating configuration files...',
      }));
    } else {
      // User cancelled
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: 'Cancelled by user',
      }));
    }
  }, []);

  /**
   * Set generation in progress
   */
  const setGenerating = useCallback((status: string) => {
    setState((prev) => ({
      ...prev,
      workingStatus: status,
    }));
  }, []);

  /**
   * Set generation complete
   */
  const setGenerationComplete = useCallback((files: string[]) => {
    setState((prev) => ({
      ...prev,
      generatedFiles: files,
      isWorking: false,
      workingStatus: '',
      phase: 'complete',
    }));
  }, []);

  /**
   * Set error state
   */
  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      error,
      isWorking: false,
      phase: 'error',
    }));
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    apiKeyRef.current = null;
    setState(initialState);
  }, []);

  /**
   * Go back to previous phase
   */
  const goBack = useCallback(() => {
    setState((prev) => {
      // Define phase transitions for going back
      const backTransitions: Partial<Record<InitPhase, InitPhase>> = {
        'provider-select': 'scanning', // Can't really go back from provider select
        'key-input': 'provider-select',
        'key-save': 'key-input',
        'model-select': prev.apiKeyEnteredThisSession ? 'key-save' : 'provider-select',
        'ai-analysis': 'model-select',
        confirm: 'ai-analysis',
        generating: 'confirm',
      };

      const prevPhase = backTransitions[prev.phase];
      if (prevPhase) {
        return { ...prev, phase: prevPhase };
      }
      return prev;
    });
  }, []);

  return {
    state,
    initialize,
    setScanResult,
    setExistingProvider,
    selectProvider,
    setApiKey,
    setSaveKey,
    selectModel,
    setAiProgress,
    setEnhancedResult,
    setAiError,
    confirmGeneration,
    setGenerating,
    setGenerationComplete,
    setError,
    reset,
    goBack,
  };
}

/**
 * Get API key from the ref (for use in the screen component)
 * This is a workaround since we don't store API key in state
 */
export function getApiKeyFromRef(): string | null {
  // This will be managed by the screen component directly
  return null;
}
