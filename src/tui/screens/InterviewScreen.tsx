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

import React, { useEffect, useCallback } from 'react';
import { Box, useInput } from 'ink';
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
} from '../hooks/useSpecGenerator.js';

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
 * Uses the useSpecGenerator hook to manage state and actions.
 *
 * @example
 * ```tsx
 * <InterviewScreen
 *   featureName="user-auth"
 *   projectRoot="/path/to/project"
 *   provider="anthropic"
 *   model="claude-sonnet-4-5-20250514"
 *   onComplete={(spec) => writeSpec(spec)}
 *   onCancel={() => process.exit(0)}
 * />
 * ```
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
    submitAnswer,
    initialize,
  } = useSpecGenerator();

  // Initialize the generator when the component mounts
  useEffect(() => {
    initialize({
      featureName,
      projectRoot,
      provider,
      model,
    });
  }, [featureName, projectRoot, provider, model, initialize]);

  // Call onComplete when spec is generated
  useEffect(() => {
    if (state.generatedSpec) {
      onComplete(state.generatedSpec);
    }
  }, [state.generatedSpec, onComplete]);

  // Handle user input submission
  const handleSubmit = useCallback(
    async (value: string) => {
      await submitAnswer(value);
    },
    [submitAnswer]
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
  // Input is enabled when awaiting input and not working
  const inputDisabled = !state.awaitingInput || state.isWorking;

  // Build the working indicator state
  const workingState = {
    isWorking: state.isWorking,
    status: state.workingStatus,
    hint: 'esc to cancel',
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Phase header showing current progress */}
      <PhaseHeader
        currentPhase={phaseConfig.number}
        totalPhases={TOTAL_DISPLAY_PHASES}
        phaseName={phaseConfig.name}
      />

      {/* Conversation history */}
      <Box marginY={1}>
        <MessageList messages={state.messages} />
      </Box>

      {/* Working indicator when AI is processing */}
      <Box marginY={1}>
        <WorkingIndicator state={workingState} />
      </Box>

      {/* User input area */}
      <Box marginTop={1}>
        <ChatInput
          onSubmit={handleSubmit}
          disabled={inputDisabled}
          placeholder={
            state.phase === 'context'
              ? 'Enter URL or file path, or press Enter to continue...'
              : state.phase === 'goals'
                ? 'Describe what you want to build...'
                : 'Type your response...'
          }
        />
      </Box>
    </Box>
  );
}
