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

import React, { useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AIProvider } from '../../ai/providers.js';
import type { ScanResult } from '../../scanner/types.js';
import { PhaseHeader } from '../components/PhaseHeader.js';
import { MessageList } from '../components/MessageList.js';
import { WorkingIndicator } from '../components/WorkingIndicator.js';
import { ChatInput } from '../components/ChatInput.js';
import {
  useSpecGenerator,
  PHASE_CONFIGS,
  TOTAL_DISPLAY_PHASES,
  type GeneratorPhase,
} from '../hooks/useSpecGenerator.js';
import { InterviewOrchestrator } from '../orchestration/interview-orchestrator.js';
import { colors } from '../theme.js';

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
  /** Called when spec generation is complete */
  onComplete: (spec: string) => void;
  /** Called when user cancels the interview */
  onCancel: () => void;
}

/**
 * InterviewScreen component
 *
 * The main screen for the /new command interview flow. Combines all TUI
 * components (PhaseHeader, MessageList, WorkingIndicator, ChatInput) to
 * create the complete interview experience.
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

  // Track if component is unmounted to prevent callbacks after cleanup
  const isCancelledRef = useRef(false);

  // Use refs for callbacks to avoid stale closures and unnecessary effect re-runs
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Initialize the orchestrator when the component mounts
  useEffect(() => {
    // Reset cancelled flag on mount
    isCancelledRef.current = false;

    // Initialize hook state
    initialize({
      featureName,
      projectRoot,
      provider,
      model,
    });

    // Create orchestrator with callbacks that check for cancellation
    const orchestrator = new InterviewOrchestrator({
      featureName,
      projectRoot,
      provider,
      model,
      scanResult,
      onMessage: (role, content) => {
        if (isCancelledRef.current) return;
        addMessage(role, content);
      },
      onStreamChunk: (chunk) => {
        if (isCancelledRef.current) return;
        if (!isStreamingRef.current) {
          // Start a new streaming message
          isStreamingRef.current = true;
          streamContentRef.current = chunk;
          addStreamingMessage(chunk);
        } else {
          // Append to existing streaming content
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
        setPhase(phase);
      },
      onComplete: (spec) => {
        if (isCancelledRef.current) return;
        setGeneratedSpec(spec);
        // Use ref to avoid stale closure
        onCompleteRef.current(spec);
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
    });

    orchestratorRef.current = orchestrator;

    // Start the orchestrator
    orchestrator.start();

    // Cleanup: mark as cancelled to prevent callbacks after unmount
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
            // Submit answer
            await orchestrator.submitAnswer(value);
          }
          break;

        default:
          // In generation or complete phase, ignore input
          break;
      }
    },
    [addMessage]
  );

  // Handle keyboard input for Escape key
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
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
        return 'Enter URL or file path, or press Enter to continue...';
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

  return (
    <Box flexDirection="column" padding={1}>
      {/* Phase header showing current progress */}
      <PhaseHeader
        currentPhase={phaseConfig.number}
        totalPhases={TOTAL_DISPLAY_PHASES}
        phaseName={phaseConfig.name}
      />

      {/* Error display */}
      {state.error && (
        <Box marginY={1}>
          <Text color="red">Error: {state.error}</Text>
        </Box>
      )}

      {/* Conversation history */}
      <Box marginY={1}>
        <MessageList messages={state.messages} />
      </Box>

      {/* Working indicator when AI is processing */}
      {state.isWorking && (
        <Box marginY={1}>
          <WorkingIndicator state={workingState} />
        </Box>
      )}

      {/* Completion message */}
      {state.phase === 'complete' && (
        <Box marginY={1}>
          <Text color={colors.green}>Specification generated successfully!</Text>
        </Box>
      )}

      {/* User input area */}
      {state.phase !== 'complete' && (
        <Box marginTop={1}>
          <ChatInput
            onSubmit={handleSubmit}
            disabled={inputDisabled}
            allowEmpty={state.phase === 'context'}
            placeholder={getPlaceholder()}
          />
        </Box>
      )}
    </Box>
  );
}
