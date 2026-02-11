/**
 * InitScreen - Full Ink-based init workflow
 *
 * Handles the complete project initialization flow within the TUI:
 * 1. Scanning project structure
 * 2. API key collection (if needed)
 * 3. Model selection
 * 4. AI analysis
 * 5. File generation
 *
 * Wrapped in AppShell for consistent layout.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, theme, phase } from '../theme.js';
import { useInit, INIT_PHASE_CONFIGS, INIT_TOTAL_PHASES } from '../hooks/useInit.js';
import { AppShell } from '../components/AppShell.js';
import { Select, type SelectOption } from '../components/Select.js';
import { PasswordInput } from '../components/PasswordInput.js';
import { Confirm } from '../components/Confirm.js';
import { ToolCallCard } from '../components/ToolCallCard.js';
import { Scanner } from '../../scanner/index.js';
import {
  AIEnhancer,
  type EnhancedScanResult,
} from '../../ai/index.js';
import {
  getApiKeyEnvVar,
  getAvailableProvider,
  AVAILABLE_MODELS,
  type AIProvider,
} from '../../ai/providers.js';
import { Generator } from '../../generator/index.js';
import { loadConfigWithDefaults } from '../../utils/config.js';
import { initTracing, flushTracing, traced } from '../../utils/tracing.js';
import { writeKeysToEnvFile } from '../../utils/env.js';
import { saveContext, toPersistedScanResult, toPersistedAIAnalysis, getGitMetadata } from '../../context/index.js';
import { logger } from '../../utils/logger.js';
import path from 'node:path';
import type { SessionState } from '../../repl/session-state.js';
import { updateSessionState } from '../../repl/session-state.js';

/**
 * Props for the InitScreen component
 */
export interface InitScreenProps {
  /** Pre-built header element from App */
  header: React.ReactNode;
  /** Project root directory */
  projectRoot: string;
  /** Current session state */
  sessionState: SessionState;
  /** Called when initialization is complete (with optional generated files list) */
  onComplete: (newState: SessionState, generatedFiles?: string[]) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

const PROVIDER_OPTIONS: SelectOption<AIProvider>[] = [
  { value: 'anthropic', label: 'Anthropic', hint: 'recommended' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter', hint: 'multiple providers' },
];

function getModelOptions(provider: AIProvider): SelectOption<string>[] {
  return AVAILABLE_MODELS[provider].map((m) => ({
    value: m.value,
    label: m.label,
    hint: m.hint,
  }));
}

/**
 * InitScreen component
 *
 * The complete Ink-based init workflow wrapped in AppShell.
 */
export function InitScreen({
  header,
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
    updateToolCall,
    setEnhancedResult,
    setAiError,
    confirmGeneration,
    setGenerating,
    setGenerationComplete,
    setError,
  } = useInit();

  const apiKeyRef = useRef<string | null>(null);
  const aiAnalysisStarted = useRef(false);
  const generationStarted = useRef(false);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

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

        const existingProvider = getAvailableProvider();
        if (existingProvider) {
          setExistingProvider(existingProvider);
        }
      } catch (error) {
        setError(`Failed to scan project: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    runScan();
  }, [state.phase, state.scanResult, projectRoot, setScanResult, setExistingProvider, setError]);

  useEffect(() => {
    if (state.phase === 'scanning' && state.scanResult && !state.hasApiKey) {
      const existingProvider = getAvailableProvider();
      if (existingProvider) {
        setExistingProvider(existingProvider);
      }
    }
  }, [state.phase, state.scanResult, state.hasApiKey, setExistingProvider]);

  // Run AI analysis
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
        onToolCall: (event) => {
          updateToolCall(event);
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

        try {
          const git = await getGitMetadata(projectRoot);
          await saveContext(
            {
              lastAnalyzedAt: new Date().toISOString(),
              gitCommitHash: git.gitCommitHash,
              gitBranch: git.gitBranch,
              scanResult: toPersistedScanResult(enhancedResult),
              aiAnalysis: toPersistedAIAnalysis(enhancedResult.aiAnalysis),
            },
            projectRoot,
          );
        } catch (saveErr) {
          logger.error(
            `Failed to save project context: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
          );
        }
      } catch (error) {
        setAiError(error instanceof Error ? error.message : String(error));
      } finally {
        await flushTracing();
      }
    };

    runAnalysis();
  }, [state.phase, state.scanResult, state.provider, state.model, setAiProgress, updateToolCall, setEnhancedResult, setAiError]);

  // Run generation
  useEffect(() => {
    if (state.phase !== 'generating' || generationStarted.current) return;
    if (!state.scanResult || !state.model) return;

    generationStarted.current = true;

    const runGeneration = async () => {
      const sourceResult = state.enhancedResult || state.scanResult;

      const generator = new Generator({
        existingFiles: 'backup',
        generateConfig: true,
        verbose: false,
      });

      try {
        setGenerating('Writing configuration files...');
        const generationResult = await generator.generate(sourceResult as EnhancedScanResult);

        const generatedFiles = generationResult.writeSummary.results
          .filter((f: { action: string }) =>
            f.action === 'created' || f.action === 'backed_up' || f.action === 'overwritten'
          )
          .map((f: { path: string }) => path.relative(projectRoot, f.path));

        if (state.apiKeyEnteredThisSession && state.saveKeyToEnv && state.provider && apiKeyRef.current) {
          const envVar = getApiKeyEnvVar(state.provider);
          const envLocalPath = path.join(projectRoot, '.ralph', '.env.local');
          writeKeysToEnvFile(envLocalPath, { [envVar]: apiKeyRef.current });
        }

        setGenerationComplete(generatedFiles);

        const config = await loadConfigWithDefaults(projectRoot);
        const newSessionState = updateSessionState(sessionState, {
          provider: state.provider ?? undefined,
          model: state.model ?? undefined,
          scanResult: sourceResult ?? undefined,
          config,
          initialized: true,
        });

        onComplete(newSessionState, generatedFiles);
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

  const handleProviderSelect = useCallback(
    (provider: AIProvider) => {
      selectProvider(provider);
    },
    [selectProvider]
  );

  const handleApiKeySubmit = useCallback(
    (key: string) => {
      if (!state.provider) return;
      apiKeyRef.current = key;
      const envVar = getApiKeyEnvVar(state.provider);
      process.env[envVar] = key;
      setApiKey(key);
    },
    [state.provider, setApiKey]
  );

  const handleSaveKeyConfirm = useCallback(
    (save: boolean) => {
      setSaveKey(save);
    },
    [setSaveKey]
  );

  const handleModelSelect = useCallback(
    (model: string) => {
      selectModel(model);
    },
    [selectModel]
  );

  const handleConfirmGeneration = useCallback(
    (confirmed: boolean) => {
      confirmGeneration(confirmed);
    },
    [confirmGeneration]
  );

  const phaseConfig = INIT_PHASE_CONFIGS[state.phase];
  const phaseString = `${phaseConfig.name} (${phaseConfig.number}/${INIT_TOTAL_PHASES})`;

  // Determine if we're in a "working" state (show spinner)
  const isWorking =
    (state.phase === 'scanning' && !state.scanResult) ||
    state.phase === 'ai-analysis' ||
    state.phase === 'generating';

  const workingStatus =
    state.phase === 'scanning' ? (state.workingStatus || 'Scanning project structure...')
    : state.phase === 'ai-analysis' ? (state.workingStatus || 'Analyzing codebase...')
    : state.phase === 'generating' ? (state.workingStatus || 'Generating configuration files...')
    : '';

  // Build the input element based on phase
  const renderInput = (): React.ReactNode => {
    switch (state.phase) {
      case 'scanning':
        if (state.scanResult && !state.hasApiKey) {
          return (
            <Select
              message="Select your AI provider:"
              options={PROVIDER_OPTIONS}
              onSelect={handleProviderSelect}
              onCancel={onCancel}
            />
          );
        }
        return null;

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
            message="Save API key to .ralph/.env.local?"
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

      case 'confirm':
        return (
          <Confirm
            message="Generate Ralph configuration files?"
            onConfirm={handleConfirmGeneration}
            onCancel={onCancel}
            initialValue={true}
          />
        );

      default:
        return null;
    }
  };

  // Scan summary display
  const renderScanSummary = () => {
    if (!state.scanResult || state.phase === 'scanning') return null;

    const { stack } = state.scanResult;
    return (
      <Box flexDirection="column">
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

  // Phase-specific content (displayed in content area)
  const renderPhaseContent = () => {
    switch (state.phase) {
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
            {state.toolCalls.length > 0 && (
              <Box flexDirection="column">
                {state.toolCalls.map((tc) => (
                  <ToolCallCard
                    key={tc.id}
                    toolName={tc.actionName}
                    status={tc.status === 'running' ? 'running' : tc.status === 'success' ? 'complete' : tc.status === 'error' ? 'error' : 'pending'}
                    input={tc.description}
                    output={tc.output}
                    error={tc.error}
                  />
                ))}
              </Box>
            )}
          </Box>
        );

      case 'confirm':
        return (
          <Box flexDirection="column">
            {state.enhancedResult?.aiAnalysis && (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Text color={colors.green}>{phase.complete} </Text>
                  <Text>AI Analysis Complete</Text>
                </Box>
                {state.tokenUsage && (
                  <Text dimColor>
                    Tokens: {state.tokenUsage.inputTokens} in / {state.tokenUsage.outputTokens} out
                  </Text>
                )}
              </Box>
            )}
            {state.error && (
              <Text color={colors.orange}>Warning: {state.error}</Text>
            )}
          </Box>
        );

      case 'complete':
        return (
          <Box flexDirection="row">
            <Text color={colors.green}>{phase.complete} </Text>
            <Text>Initialization complete.</Text>
          </Box>
        );

      case 'error':
        return (
          <Box flexDirection="column">
            <Text color={colors.pink} bold>Error</Text>
            <Text color={colors.pink}>{state.error}</Text>
            <Text dimColor>Press Esc to go back</Text>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <AppShell
      header={header}
      tips={state.phase === 'error' ? 'Esc to go back' : 'Esc to cancel'}
      isWorking={isWorking}
      workingStatus={workingStatus}
      workingHint="esc to cancel"
      error={state.phase === 'error' ? state.error : null}
      input={renderInput()}
      footerStatus={{
        action: 'Initialize Project',
        phase: phaseString,
        path: projectRoot,
      }}
    >
      {/* Scan summary */}
      {renderScanSummary()}

      {/* Phase-specific content */}
      {renderPhaseContent()}
    </AppShell>
  );
}
