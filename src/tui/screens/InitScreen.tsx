/**
 * InitScreen - Full Ink-based init workflow
 *
 * Handles the complete project initialization flow within the TUI:
 * 1. Scanning project structure
 * 2. API key collection (if needed)
 * 3. Model selection
 * 4. AI analysis
 * 5. File generation
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';
import { useInit, INIT_PHASE_CONFIGS, INIT_TOTAL_PHASES } from '../hooks/useInit.js';
import { PhaseHeader } from '../components/PhaseHeader.js';
import { WorkingIndicator } from '../components/WorkingIndicator.js';
import { Select, type SelectOption } from '../components/Select.js';
import { PasswordInput } from '../components/PasswordInput.js';
import { Confirm } from '../components/Confirm.js';
import { Scanner } from '../../scanner/index.js';
import {
  AIEnhancer,
  formatAIAnalysis,
  type EnhancedScanResult,
} from '../../ai/index.js';
import {
  hasApiKey,
  getApiKeyEnvVar,
  getAvailableProvider,
  AVAILABLE_MODELS,
  type AIProvider,
} from '../../ai/providers.js';
import { Generator } from '../../generator/index.js';
import { loadConfigWithDefaults } from '../../utils/config.js';
import { initTracing, flushTracing, traced } from '../../utils/tracing.js';
import fs from 'node:fs';
import path from 'node:path';
import type { SessionState } from '../../repl/session-state.js';
import { updateSessionState } from '../../repl/session-state.js';

/**
 * Props for the InitScreen component
 */
export interface InitScreenProps {
  /** Project root directory */
  projectRoot: string;
  /** Current session state */
  sessionState: SessionState;
  /** Called when initialization is complete */
  onComplete: (newState: SessionState) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

/**
 * Provider options for the select component
 */
const PROVIDER_OPTIONS: SelectOption<AIProvider>[] = [
  { value: 'anthropic', label: 'Anthropic', hint: 'recommended' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter', hint: 'multiple providers' },
];

/**
 * Get model options for a provider
 */
function getModelOptions(provider: AIProvider): SelectOption<string>[] {
  return AVAILABLE_MODELS[provider].map((m) => ({
    value: m.value,
    label: m.label,
    hint: m.hint,
  }));
}

/**
 * Save API keys to .env.local file
 */
function saveKeysToEnvLocal(projectRoot: string, keys: Record<string, string>): void {
  const envLocalPath = path.join(projectRoot, '.env.local');
  let envContent = '';

  if (fs.existsSync(envLocalPath)) {
    envContent = fs.readFileSync(envLocalPath, 'utf-8');
  }

  for (const [envVar, value] of Object.entries(keys)) {
    if (!value) continue;

    const keyRegex = new RegExp(`^${envVar}=.*$`, 'm');
    if (keyRegex.test(envContent)) {
      envContent = envContent.replace(keyRegex, `${envVar}=${value}`);
    } else {
      envContent = envContent.trimEnd() + (envContent ? '\n' : '') + `${envVar}=${value}\n`;
    }
  }

  fs.writeFileSync(envLocalPath, envContent);
}

/**
 * InitScreen component
 *
 * The complete Ink-based init workflow. Replaces the readline-based
 * init flow with native Ink components.
 */
export function InitScreen({
  projectRoot,
  sessionState,
  onComplete,
  onCancel,
}: InitScreenProps): React.ReactElement {
  const {
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
  } = useInit();

  // Store API key in ref (not in state for security)
  const apiKeyRef = useRef<string | null>(null);

  // Track if AI analysis has started
  const aiAnalysisStarted = useRef(false);

  // Track if generation has started
  const generationStarted = useRef(false);

  // Handle Escape to cancel
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  // Initialize on mount
  useEffect(() => {
    initialize(projectRoot);
  }, [projectRoot, initialize]);

  // Run scan when in scanning phase
  useEffect(() => {
    if (state.phase !== 'scanning' || state.scanResult) return;

    const runScan = async () => {
      try {
        const scanner = new Scanner();
        const result = await scanner.scan(projectRoot);
        setScanResult(result);

        // Check for existing API key
        const existingProvider = getAvailableProvider();
        if (existingProvider) {
          setExistingProvider(existingProvider);
        } else {
          // Need to collect API key - go to provider select
          // This is done by checking state.hasApiKey in render
        }
      } catch (error) {
        setError(`Failed to scan project: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    runScan();
  }, [state.phase, state.scanResult, projectRoot, setScanResult, setExistingProvider, setError]);

  // Transition from scan to provider select if no API key
  useEffect(() => {
    if (state.phase === 'scanning' && state.scanResult && !state.hasApiKey) {
      // Check one more time for available provider (in case env was set after initial check)
      const existingProvider = getAvailableProvider();
      if (existingProvider) {
        setExistingProvider(existingProvider);
      }
      // Otherwise stay at scanning which will show provider-select
    }
  }, [state.phase, state.scanResult, state.hasApiKey, setExistingProvider]);

  // Run AI analysis when in ai-analysis phase
  useEffect(() => {
    if (state.phase !== 'ai-analysis' || aiAnalysisStarted.current) return;
    if (!state.scanResult || !state.provider || !state.model) return;

    aiAnalysisStarted.current = true;

    const runAnalysis = async () => {
      initTracing();

      const aiEnhancer = new AIEnhancer({
        provider: state.provider!,
        model: state.model!,
        verbose: false,
        agentic: true,
        onProgress: (phase, detail) => {
          if (detail) {
            setAiProgress(`${phase} - ${detail}`);
          } else {
            setAiProgress(phase);
          }
        },
      });

      try {
        const enhancedResult = await traced(
          async () => {
            return await aiEnhancer.enhance(state.scanResult!);
          },
          {
            name: 'ai-analysis',
            type: 'task',
          }
        );

        if (enhancedResult.aiEnhanced && enhancedResult.aiAnalysis) {
          setEnhancedResult(enhancedResult, enhancedResult.tokenUsage);
        } else if (enhancedResult.aiError) {
          setAiError(enhancedResult.aiError);
        } else {
          setEnhancedResult(enhancedResult);
        }
      } catch (error) {
        setAiError(error instanceof Error ? error.message : String(error));
      } finally {
        await flushTracing();
      }
    };

    runAnalysis();
  }, [state.phase, state.scanResult, state.provider, state.model, setAiProgress, setEnhancedResult, setAiError]);

  // Run generation when in generating phase
  useEffect(() => {
    if (state.phase !== 'generating' || generationStarted.current) return;
    if (!state.scanResult || !state.model) return;

    generationStarted.current = true;

    const runGeneration = async () => {
      // Use enhanced result if available, otherwise use scan result
      const sourceResult = state.enhancedResult || state.scanResult;

      const generator = new Generator({
        existingFiles: 'backup',
        generateConfig: true,
        verbose: false,
        customVariables: {
          defaultModel: state.model!,
          planningModel: state.model!,
        },
      });

      try {
        setGenerating('Writing configuration files...');
        const generationResult = await generator.generate(sourceResult as EnhancedScanResult);

        // Extract generated file paths
        const generatedFiles = generationResult.writeSummary.results
          .filter((f: { action: string }) =>
            f.action === 'created' || f.action === 'backed_up' || f.action === 'overwritten'
          )
          .map((f: { path: string }) => {
            const relativePath = path.relative(projectRoot, f.path);
            return relativePath.replace(/^\.ralph[\\/]/, '');
          });

        // Save API key to .env.local if requested
        if (state.apiKeyEnteredThisSession && state.saveKeyToEnv && state.provider && apiKeyRef.current) {
          const envVar = getApiKeyEnvVar(state.provider);
          saveKeysToEnvLocal(projectRoot, { [envVar]: apiKeyRef.current });
        }

        setGenerationComplete(generatedFiles);

        // Load config and update session state
        const config = await loadConfigWithDefaults(projectRoot);
        const newSessionState = updateSessionState(sessionState, {
          provider: state.provider ?? undefined,
          model: state.model ?? undefined,
          scanResult: sourceResult ?? undefined,
          config,
          initialized: true,
        });

        onComplete(newSessionState);
      } catch (error) {
        setError(`Failed to generate files: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    runGeneration();
  }, [
    state.phase,
    state.scanResult,
    state.enhancedResult,
    state.model,
    state.provider,
    state.apiKeyEnteredThisSession,
    state.saveKeyToEnv,
    projectRoot,
    sessionState,
    setGenerating,
    setGenerationComplete,
    setError,
    onComplete,
  ]);

  // Handle provider selection
  const handleProviderSelect = useCallback(
    (provider: AIProvider) => {
      selectProvider(provider);
    },
    [selectProvider]
  );

  // Handle API key input
  const handleApiKeySubmit = useCallback(
    (key: string) => {
      if (!state.provider) return;

      // Store key in ref
      apiKeyRef.current = key;

      // Set key in environment for this session
      const envVar = getApiKeyEnvVar(state.provider);
      process.env[envVar] = key;

      setApiKey(key);
    },
    [state.provider, setApiKey]
  );

  // Handle save key confirmation
  const handleSaveKeyConfirm = useCallback(
    (save: boolean) => {
      setSaveKey(save);
    },
    [setSaveKey]
  );

  // Handle model selection
  const handleModelSelect = useCallback(
    (model: string) => {
      selectModel(model);
    },
    [selectModel]
  );

  // Handle generation confirmation
  const handleConfirmGeneration = useCallback(
    (confirmed: boolean) => {
      confirmGeneration(confirmed);
    },
    [confirmGeneration]
  );

  // Get current phase config
  const phaseConfig = INIT_PHASE_CONFIGS[state.phase];

  // Render based on current phase
  const renderPhaseContent = () => {
    switch (state.phase) {
      case 'scanning':
        if (state.scanResult && !state.hasApiKey) {
          // Scan done but no API key - show provider select
          return (
            <Select
              message="Select your AI provider:"
              options={PROVIDER_OPTIONS}
              onSelect={handleProviderSelect}
              onCancel={onCancel}
            />
          );
        }
        // Still scanning
        return (
          <WorkingIndicator
            state={{
              isWorking: true,
              status: state.workingStatus || 'Scanning project structure...',
              hint: 'esc to cancel',
            }}
          />
        );

      case 'provider-select':
        return (
          <Select
            message="Select your AI provider:"
            options={PROVIDER_OPTIONS}
            onSelect={handleProviderSelect}
            onCancel={onCancel}
          />
        );

      case 'key-input':
        return (
          <PasswordInput
            message={`Enter your ${state.provider ? getApiKeyEnvVar(state.provider) : 'API key'}:`}
            onSubmit={handleApiKeySubmit}
            onCancel={onCancel}
          />
        );

      case 'key-save':
        return (
          <Confirm
            message="Save API key to .env.local?"
            onConfirm={handleSaveKeyConfirm}
            onCancel={onCancel}
            initialValue={true}
          />
        );

      case 'model-select':
        if (!state.provider) return null;
        return (
          <Select
            message="Select model:"
            options={getModelOptions(state.provider)}
            onSelect={handleModelSelect}
            onCancel={onCancel}
          />
        );

      case 'ai-analysis':
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text>
                Running AI analysis with{' '}
                <Text color={colors.blue}>
                  {state.provider}/{state.model}
                </Text>
              </Text>
            </Box>
            <WorkingIndicator
              state={{
                isWorking: true,
                status: state.workingStatus || 'Analyzing codebase...',
                hint: 'esc to cancel',
              }}
            />
          </Box>
        );

      case 'confirm':
        return (
          <Box flexDirection="column">
            {/* Show AI analysis results if available */}
            {state.enhancedResult?.aiAnalysis && (
              <Box marginBottom={1} flexDirection="column">
                <Text color={colors.green}>AI Analysis Complete</Text>
                {state.tokenUsage && (
                  <Text dimColor>
                    Tokens: {state.tokenUsage.inputTokens} in / {state.tokenUsage.outputTokens} out
                  </Text>
                )}
              </Box>
            )}
            {state.error && (
              <Box marginBottom={1}>
                <Text color={colors.orange}>Warning: {state.error}</Text>
              </Box>
            )}
            <Confirm
              message="Generate Ralph configuration files?"
              onConfirm={handleConfirmGeneration}
              onCancel={onCancel}
              initialValue={true}
            />
          </Box>
        );

      case 'generating':
        return (
          <WorkingIndicator
            state={{
              isWorking: true,
              status: state.workingStatus || 'Generating configuration files...',
              hint: 'please wait',
            }}
          />
        );

      case 'complete':
        return (
          <Box flexDirection="column">
            <Text color={colors.green} bold>
              Initialization Complete!
            </Text>
            <Box marginTop={1} flexDirection="column">
              <Text>Generated files in .ralph/:</Text>
              {state.generatedFiles.map((file) => (
                <Text key={file} dimColor>
                  {'  '}
                  {file}
                </Text>
              ))}
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Press any key to continue...</Text>
            </Box>
          </Box>
        );

      case 'error':
        return (
          <Box flexDirection="column">
            <Text color={colors.pink} bold>
              Error
            </Text>
            <Text color={colors.pink}>{state.error}</Text>
            <Box marginTop={1}>
              <Text dimColor>Press Esc to go back</Text>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  // Show scan result summary when available
  const renderScanSummary = () => {
    if (!state.scanResult || state.phase === 'scanning') return null;

    const { stack } = state.scanResult;
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text color={colors.yellow} bold>
          Detected Stack
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          {stack.framework && (
            <Text>
              Framework:{' '}
              <Text color={colors.blue}>
                {stack.framework.name}
                {stack.framework.version ? ` ${stack.framework.version}` : ''}
              </Text>
            </Text>
          )}
          <Text>
            Language: <Text color={colors.blue}>TypeScript</Text>
          </Text>
          {stack.testing?.unit && (
            <Text>
              Testing: <Text color={colors.blue}>{stack.testing.unit.name}</Text>
            </Text>
          )}
          <Text>
            Package Manager:{' '}
            <Text color={colors.blue}>{stack.packageManager?.name || 'npm'}</Text>
          </Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={colors.yellow} bold>
          Initialize Project
        </Text>
        <Text dimColor> │ {projectRoot}</Text>
      </Box>

      {/* Phase progress */}
      <PhaseHeader
        currentPhase={phaseConfig.number}
        totalPhases={INIT_TOTAL_PHASES}
        phaseName={phaseConfig.name}
      />

      {/* Scan summary */}
      {renderScanSummary()}

      {/* Phase-specific content */}
      <Box marginTop={1}>{renderPhaseContent()}</Box>
    </Box>
  );
}
