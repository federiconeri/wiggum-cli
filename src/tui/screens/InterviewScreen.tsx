/**
 * InterviewScreen - Main screen for the /new command interview flow
 *
 * The complete TUI for the spec generation interview process.
 * Orchestrates user input and AI responses through multiple phases:
 * 1. Context - Gather reference URLs/files
 * 2. Goals - Understand what to build
 * 3. Interview - Clarifying questions
 * 4. Generation - Generate the specification
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AIProvider } from '../../ai/providers.js';
import type { ScanResult } from '../../scanner/types.js';
import { FooterStatusBar } from '../components/FooterStatusBar.js';
import { MessageList } from '../components/MessageList.js';
import { WorkingIndicator } from '../components/WorkingIndicator.js';
import { ChatInput } from '../components/ChatInput.js';
import { MultiSelect } from '../components/MultiSelect.js';
import {
  useSpecGenerator,
  PHASE_CONFIGS,
  TOTAL_DISPLAY_PHASES,
  type GeneratorPhase,
} from '../hooks/useSpecGenerator.js';
import { InterviewOrchestrator, type SessionContext } from '../orchestration/interview-orchestrator.js';
import { colors, theme } from '../theme.js';
import {
  loadContext,
  toScanResultFromPersisted,
  getContextAge,
} from '../../context/index.js';
import { initTracing, flushTracing } from '../../utils/tracing.js';
import { resolveOptionLabels, type InterviewQuestion, type InterviewAnswer } from '../types/interview.js';

/**
 * Props for the InterviewScreen component
 */
export interface InterviewScreenProps {
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
  /** Called when spec generation is complete - receives spec and conversation messages */
  onComplete: (spec: string, messages: import('../components/MessageList.js').Message[]) => void;
  /** Called when user cancels the interview */
  onCancel: () => void;
}

/**
 * InterviewScreen component
 *
 * The main screen for the /new command interview flow. Combines all TUI
 * components (MessageList, WorkingIndicator, ChatInput, MultiSelect,
 * FooterStatusBar) to create the complete interview experience.
 *
 * Uses the useSpecGenerator hook for state and InterviewOrchestrator
 * to bridge to the AI conversation.
 */
export function InterviewScreen({
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

  // Track orchestrator instance
  const orchestratorRef = useRef<InterviewOrchestrator | null>(null);

  // Track if we're in streaming mode for the current message
  const isStreamingRef = useRef(false);
  const streamContentRef = useRef('');

  // Track if we're in generation phase (more reliable than checking orchestrator)
  const isGeneratingRef = useRef(false);

  // Track if component is unmounted to prevent callbacks after cleanup
  const isCancelledRef = useRef(false);

  // Use refs for callbacks and state to avoid stale closures
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Track messages in ref for access in callbacks
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  // State for tool call expansion (Ctrl+O toggle)
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);

  // State for multi-select interview questions (null = free-text mode)
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);

  // Initialize Braintrust tracing for this interview session.
  // flushTracing is fire-and-forget (void) to avoid blocking TUI shutdown.
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

    // Async IIFE to allow loading persisted context
    (async () => {
      // Determine session context: use scanResult prop if available,
      // otherwise try loading persisted context from disk
      let resolvedScanResult = scanResult;
      let resolvedSessionContext: SessionContext | undefined;

      if (!scanResult) {
        try {
          const persisted = await loadContext(projectRoot);
          if (persisted) {
            // Map persisted AI analysis to SessionContext
            resolvedSessionContext = {
              entryPoints: persisted.aiAnalysis.projectContext?.entryPoints,
              keyDirectories: persisted.aiAnalysis.projectContext?.keyDirectories,
              commands: persisted.aiAnalysis.commands as SessionContext['commands'],
              namingConventions: persisted.aiAnalysis.projectContext?.namingConventions,
              implementationGuidelines: persisted.aiAnalysis.implementationGuidelines,
              keyPatterns: persisted.aiAnalysis.technologyPractices?.practices,
            };

            // Rehydrate a minimal scan result for Project Tech Stack context
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
          // Show error but continue without context
          if (!isCancelledRef.current) {
            addMessage(
              'system',
              `Unable to load cached project context; continuing without it.`,
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
          onCompleteRef.current(spec, messagesRef.current);
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
  }, [featureName, projectRoot, provider, model, scanResult]);

  // Handle user input submission based on current phase
  const handleSubmit = useCallback(
    async (value: string) => {
      const orchestrator = orchestratorRef.current;
      if (!orchestrator) return;

      // Add user message to display
      if (value) {
        addMessage('user', value);
      }

      const currentPhase = orchestrator.getPhase();

      switch (currentPhase) {
        case 'context':
          if (value) {
            // User entered a reference URL/path
            await orchestrator.addReference(value);
          } else {
            // Empty input = done with context, advance to goals
            await orchestrator.advanceToGoals();
          }
          break;

        case 'goals':
          // User entered their goals
          await orchestrator.submitGoals(value);
          break;

        case 'interview':
          if (value.toLowerCase() === 'done' || value.toLowerCase() === 'skip') {
            // Skip to generation
            await orchestrator.skipToGeneration();
          } else {
            // Submit free-text answer
            const answer: InterviewAnswer = {
              mode: 'freeText',
              questionId: currentQuestion?.id || '',
              text: value,
            };
            await orchestrator.submitAnswer(answer);
          }
          break;

        default:
          // In generation or complete phase, ignore input
          break;
      }
    },
    [addMessage, currentQuestion]
  );

  // Handle multi-select answer submission
  const handleMultiSelectSubmit = useCallback(
    async (selectedValues: string[]) => {
      try {
        const orchestrator = orchestratorRef.current;
        if (!orchestrator || !currentQuestion) return;

        // Add user message to display
        if (selectedValues.length === 0) {
          addMessage('user', '(No options selected)');
        } else {
          const labels = resolveOptionLabels(currentQuestion.options, selectedValues);
          addMessage('user', labels.join(', '));
        }

        // Submit multi-select answer
        const answer: InterviewAnswer = {
          mode: 'multiSelect',
          questionId: currentQuestion.id,
          selectedOptionIds: selectedValues,
        };
        await orchestrator.submitAnswer(answer);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    },
    [addMessage, currentQuestion, setError]
  );

  // Handle "Chat about this" mode switch
  const handleChatMode = useCallback(() => {
    setCurrentQuestion(null);
  }, []);

  // Handle keyboard input for Escape key and Ctrl+O
  useInput((input, key) => {
    if (key.escape) {
      // When in multiSelect mode, Escape switches back to free-text instead of cancelling
      if (currentQuestion) {
        setCurrentQuestion(null);
        return;
      }
      onCancel();
    }
    // Ctrl+O to toggle tool call expansion
    if (key.ctrl && input === 'o') {
      setToolCallsExpanded((prev) => !prev);
    }
  });

  // Get current phase configuration
  const phaseConfig = PHASE_CONFIGS[state.phase];

  // Determine if input should be disabled
  const inputDisabled = !state.awaitingInput || state.isWorking || state.phase === 'complete';

  // Build the working indicator state
  const workingState = {
    isWorking: state.isWorking,
    status: state.workingStatus,
    hint: 'esc to cancel',
  };

  // Get placeholder text based on phase
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

  // Build phase string for status line
  const totalPhases = state.phase === 'complete' ? PHASE_CONFIGS.complete.number : TOTAL_DISPLAY_PHASES;
  const phaseString = `${phaseConfig.name} (${phaseConfig.number}/${totalPhases})`;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Error display */}
      {state.error && (
        <Box marginY={1}>
          <Text color={theme.colors.error}>Error: {state.error}</Text>
        </Box>
      )}

      {/* Conversation history - inline, conversational flow */}
      <Box marginY={1}>
        <MessageList messages={state.messages} toolCallsExpanded={toolCallsExpanded} />
      </Box>

      {/* Working indicator when AI is processing - always yellow */}
      {state.isWorking && (
        <Box marginY={1}>
          <WorkingIndicator
            state={workingState}
            variant="active"
          />
        </Box>
      )}

      {/* Completion message - full summary added to thread by App */}
      {state.phase === 'complete' && (
        <Box flexDirection="row">
          <Text color={theme.colors.success}>{theme.chars.bullet} </Text>
          <Text>Specification complete.</Text>
        </Box>
      )}

      {/* User input area */}
      {state.phase !== 'complete' && (
        <Box marginTop={1}>
          {/* Multi-select mode for interview questions with options */}
          {state.phase === 'interview' && currentQuestion ? (
            <>
              <Box><Text dimColor>{'─'.repeat(50)}</Text></Box>
              <Box marginTop={1}>
                <MultiSelect
                  message={currentQuestion.text}
                  options={currentQuestion.options.map(opt => ({
                    value: opt.id,
                    label: opt.label,
                  }))}
                  onSubmit={handleMultiSelectSubmit}
                  onChatMode={handleChatMode}
                />
              </Box>
            </>
          ) : (
            // Free-text mode (default for all phases)
            <ChatInput
              onSubmit={handleSubmit}
              disabled={inputDisabled}
              allowEmpty={state.phase === 'context'}
              placeholder={getPlaceholder()}
            />
          )}
        </Box>
      )}

      {/* Footer status bar */}
      <FooterStatusBar
        action="New Spec"
        phase={phaseString}
        path={featureName}
      />
    </Box>
  );
}
