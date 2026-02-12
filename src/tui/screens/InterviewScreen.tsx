/**
 * InterviewScreen - Main screen for the /new command interview flow
 *
 * The complete TUI for the spec generation interview process.
 * Orchestrates user input and AI responses through multiple phases:
 * 1. Context - Gather reference URLs/files
 * 2. Goals - Understand what to build
 * 3. Interview - Clarifying questions
 * 4. Generation - Generate the specification
 * 5. Complete - Show summary and return to shell
 *
 * Wrapped in AppShell for consistent layout. On completion,
 * shows SpecCompletionSummary inline before returning to shell.
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AIProvider } from '../../ai/providers.js';
import { logger } from '../../utils/logger.js';
import type { ScanResult } from '../../scanner/types.js';
import { MessageList } from '../components/MessageList.js';
import { ChatInput } from '../components/ChatInput.js';
import { MultiSelect } from '../components/MultiSelect.js';
import { AppShell } from '../components/AppShell.js';
import { SpecCompletionSummary } from '../components/SpecCompletionSummary.js';
import {
  useSpecGenerator,
  PHASE_CONFIGS,
  TOTAL_DISPLAY_PHASES,
  type GeneratorPhase,
} from '../hooks/useSpecGenerator.js';
import { InterviewOrchestrator, type SessionContext } from '../orchestration/interview-orchestrator.js';
import { theme, phase } from '../theme.js';
import {
  loadContext,
  toScanResultFromPersisted,
  getContextAge,
} from '../../context/index.js';
import { join } from 'node:path';
import { initTracing, flushTracing } from '../../utils/tracing.js';
import { resolveOptionLabels, type InterviewQuestion, type InterviewAnswer } from '../types/interview.js';
import type { Message } from '../components/MessageList.js';

/**
 * Props for the InterviewScreen component
 */
export interface InterviewScreenProps {
  /** Pre-built header element from App */
  header: React.ReactNode;
  /** Name of the feature being specified */
  featureName: string;
  /** Project root directory path */
  projectRoot: string;
  /** AI provider to use */
  provider: AIProvider;
  /** Model ID to use */
  model: string;
  /** Optional scan result with detected tech stack */
  scanResult?: ScanResult;
  /** Path to specs directory (relative to project root, defaults to '.ralph/specs') */
  specsPath?: string;
  /** Called when spec generation is complete - receives spec, messages, and specPath */
  onComplete: (spec: string, messages: Message[], specPath: string) => void;
  /** Called when user cancels the interview */
  onCancel: () => void;
}

/**
 * InterviewScreen component
 *
 * The main screen for the /new command interview flow. Combines all TUI
 * components within an AppShell layout.
 */
export function InterviewScreen({
  header,
  featureName,
  projectRoot,
  provider,
  model,
  scanResult,
  specsPath = '.ralph/specs',
  onComplete,
  onCancel,
}: InterviewScreenProps): React.ReactElement {
  const {
    state,
    initialize,
    addMessage,
    addStreamingMessage,
    updateStreamingMessage,
    completeStreamingMessage,
    startToolCall,
    completeToolCall,
    setPhase,
    setGeneratedSpec,
    setError,
    setWorking,
    setReady,
  } = useSpecGenerator();

  const orchestratorRef = useRef<InterviewOrchestrator | null>(null);
  const isStreamingRef = useRef(false);
  const streamContentRef = useRef('');
  const isGeneratingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);

  // Completion state: when spec is done, show summary inline
  const [completionData, setCompletionData] = useState<{
    spec: string;
    specPath: string;
  } | null>(null);

  useEffect(() => {
    initTracing();
    return () => {
      void flushTracing();
    };
  }, []);

  // Initialize the orchestrator when the component mounts
  useEffect(() => {
    isCancelledRef.current = false;

    initialize({
      featureName,
      projectRoot,
      provider,
      model,
    });

    (async () => {
      let resolvedScanResult = scanResult;
      let resolvedSessionContext: SessionContext | undefined;

      if (!scanResult) {
        try {
          const persisted = await loadContext(projectRoot);
          if (persisted) {
            resolvedSessionContext = {
              entryPoints: persisted.aiAnalysis.projectContext?.entryPoints,
              keyDirectories: persisted.aiAnalysis.projectContext?.keyDirectories,
              commands: persisted.aiAnalysis.commands as SessionContext['commands'],
              namingConventions: persisted.aiAnalysis.projectContext?.namingConventions,
              implementationGuidelines: persisted.aiAnalysis.implementationGuidelines,
              keyPatterns: persisted.aiAnalysis.technologyPractices?.practices,
            };

            resolvedScanResult = toScanResultFromPersisted(
              persisted.scanResult,
              projectRoot,
            );

            const { human } = getContextAge(persisted);
            addMessage(
              'system',
              `Using cached project context from .ralph/.context.json (updated ${human} ago). Run /sync to refresh.`,
            );
          }
        } catch (err) {
          if (!isCancelledRef.current) {
            const reason = err instanceof Error ? err.message : String(err);
            addMessage(
              'system',
              `Unable to load cached project context (${reason}); continuing without it.`,
            );
          }
        }
      }

      if (isCancelledRef.current) return;

      const orchestrator = new InterviewOrchestrator({
        featureName,
        projectRoot,
        provider,
        model,
        scanResult: resolvedScanResult,
        sessionContext: resolvedSessionContext,
        onMessage: (role, content) => {
          if (isCancelledRef.current) return;
          addMessage(role, content);
        },
        onStreamChunk: (chunk) => {
          if (isCancelledRef.current) return;
          if (isGeneratingRef.current) return;
          if (!isStreamingRef.current) {
            isStreamingRef.current = true;
            streamContentRef.current = chunk;
            addStreamingMessage(chunk);
          } else {
            streamContentRef.current += chunk;
            updateStreamingMessage(streamContentRef.current);
          }
        },
        onStreamComplete: () => {
          if (isCancelledRef.current) return;
          if (isStreamingRef.current) {
            completeStreamingMessage();
            isStreamingRef.current = false;
            streamContentRef.current = '';
          }
        },
        onToolStart: (toolName, input) => {
          if (isCancelledRef.current) return '';
          return startToolCall(toolName, input);
        },
        onToolEnd: (toolId, output, error) => {
          if (isCancelledRef.current) return;
          completeToolCall(toolId, output, error);
        },
        onPhaseChange: (phase: GeneratorPhase) => {
          if (isCancelledRef.current) return;
          isGeneratingRef.current = phase === 'generation';
          setPhase(phase);
        },
        onComplete: (spec) => {
          if (isCancelledRef.current) return;
          setGeneratedSpec(spec);
          // Show completion summary inline instead of navigating away immediately
          const specFilePath = join(projectRoot, specsPath, `${featureName}.md`);
          setCompletionData({ spec, specPath: specFilePath });
        },
        onError: (error) => {
          if (isCancelledRef.current) return;
          setError(error);
        },
        onWorkingChange: (isWorking, status) => {
          if (isCancelledRef.current) return;
          setWorking(isWorking, status);
        },
        onReady: () => {
          if (isCancelledRef.current) return;
          setReady();
        },
        onQuestion: (question) => {
          if (isCancelledRef.current) return;
          setCurrentQuestion(question);
        },
      });

      orchestratorRef.current = orchestrator;
      orchestrator.start();
    })();

    return () => {
      isCancelledRef.current = true;
      orchestratorRef.current = null;
    };
  }, [featureName, projectRoot, provider, model, scanResult, specsPath]);

  const handleSubmit = useCallback(
    async (value: string) => {
      try {
        const orchestrator = orchestratorRef.current;
        if (!orchestrator) return;

        if (value) {
          addMessage('user', value);
        }

        const currentPhase = orchestrator.getPhase();

        switch (currentPhase) {
          case 'context':
            if (value) {
              await orchestrator.addReference(value);
            } else {
              await orchestrator.advanceToGoals();
            }
            break;

          case 'goals':
            await orchestrator.submitGoals(value);
            break;

          case 'interview':
            if (value.toLowerCase() === 'done' || value.toLowerCase() === 'skip') {
              await orchestrator.skipToGeneration();
            } else {
              const answer: InterviewAnswer = {
                mode: 'freeText',
                questionId: currentQuestion?.id || '',
                text: value,
              };
              await orchestrator.submitAnswer(answer);
            }
            break;

          default:
            break;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(`Interview submit failed: ${reason}`);
        setError(reason);
      }
    },
    [addMessage, currentQuestion, setError]
  );

  const handleMultiSelectSubmit = useCallback(
    async (selectedValues: string[]) => {
      try {
        const orchestrator = orchestratorRef.current;
        if (!orchestrator || !currentQuestion) return;

        // Capture question before clearing so MultiSelect disappears immediately
        const question = currentQuestion;
        setCurrentQuestion(null);

        if (selectedValues.length === 0) {
          addMessage('user', '(No options selected)');
        } else {
          const labels = resolveOptionLabels(question.options, selectedValues);
          addMessage('user', labels.join(', '));
        }

        const answer: InterviewAnswer = {
          mode: 'multiSelect',
          questionId: question.id,
          selectedOptionIds: selectedValues,
        };
        await orchestrator.submitAnswer(answer);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(`Interview multi-select submit failed: ${reason}`);
        setError(reason);
      }
    },
    [addMessage, currentQuestion, setError]
  );

  const handleChatMode = useCallback(() => {
    setCurrentQuestion(null);
  }, []);

  // Handle completion dismiss (user presses Enter or Esc on summary)
  const handleCompletionDismiss = useCallback(() => {
    if (completionData) {
      onCompleteRef.current(completionData.spec, messagesRef.current, completionData.specPath);
    }
  }, [completionData]);

  useInput((input, key) => {
    // If showing completion summary, Enter or Esc dismisses
    if (completionData) {
      if (key.return || key.escape) {
        handleCompletionDismiss();
      }
      return;
    }

    if (key.escape) {
      if (currentQuestion) {
        setCurrentQuestion(null);
        return;
      }
      onCancel();
    }
    if (key.ctrl && input === 'o') {
      setToolCallsExpanded((prev) => !prev);
    }
  });

  const phaseConfig = PHASE_CONFIGS[state.phase];
  const inputDisabled = !state.awaitingInput || state.isWorking || state.phase === 'complete';

  // Get tips text based on phase
  const getTips = (): string | null => {
    if (completionData) return null;
    switch (state.phase) {
      case 'context':
        return 'Enter URLs or file paths. Empty input to continue.';
      case 'goals':
        return 'Describe what you want to build.';
      case 'interview':
        return currentQuestion
          ? 'Space select, Enter confirm, C to chat, Esc cancel'
          : "Type answer, 'done' to generate, Esc cancel";
      case 'generation':
        return 'Generating specification\u2026 Esc to cancel';
      case 'complete':
        return 'Enter to return to shell';
      default:
        return null;
    }
  };

  const getPlaceholder = () => {
    switch (state.phase) {
      case 'context':
        return 'Enter URL, file path, or paste text (prefix with "text:" to force inline)...';
      case 'goals':
        return 'Describe what you want to build...';
      case 'interview':
        return 'Type your response (or "done" to generate spec)...';
      case 'generation':
        return 'Generating specification...';
      case 'complete':
        return 'Specification complete!';
      default:
        return 'Type your response...';
    }
  };

  const totalPhases = state.phase === 'complete' ? PHASE_CONFIGS.complete.number : TOTAL_DISPLAY_PHASES;
  const phaseString = `${phaseConfig.name} (${phaseConfig.number}/${totalPhases})`;

  // Build input element based on phase
  let inputElement: React.ReactNode = null;
  if (!completionData && state.phase !== 'complete') {
    if (state.phase === 'interview' && currentQuestion) {
      inputElement = (
        <MultiSelect
          key={currentQuestion.id}
          message={currentQuestion.text}
          options={currentQuestion.options.map(opt => ({
            value: opt.id,
            label: opt.label,
          }))}
          onSubmit={handleMultiSelectSubmit}
          onChatMode={handleChatMode}
        />
      );
    } else {
      inputElement = (
        <ChatInput
          onSubmit={handleSubmit}
          disabled={inputDisabled}
          allowEmpty={state.phase === 'context'}
          placeholder={getPlaceholder()}
        />
      );
    }
  }

  return (
    <AppShell
      header={header}
      tips={getTips()}
      isWorking={state.isWorking && !completionData}
      workingStatus={state.workingStatus}
      workingHint="esc to cancel"
      error={state.error}
      input={inputElement}
      footerStatus={{
        action: 'New Spec',
        phase: phaseString,
        path: featureName,
      }}
    >
      {/* Show completion summary when spec is done */}
      {completionData ? (
        <SpecCompletionSummary
          featureName={featureName}
          spec={completionData.spec}
          specPath={completionData.specPath}
          messages={state.messages}
        />
      ) : (
        <>
          {/* Conversation history */}
          <MessageList messages={state.messages} toolCallsExpanded={toolCallsExpanded} />

          {/* Completion message (before summary is shown) */}
          {state.phase === 'complete' && !completionData && (
            <Box flexDirection="row">
              <Text color={theme.colors.success}>{phase.complete} </Text>
              <Text>Specification complete.</Text>
            </Box>
          )}
        </>
      )}
    </AppShell>
  );
}
