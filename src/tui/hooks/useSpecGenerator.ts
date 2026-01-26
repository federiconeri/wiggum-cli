/**
 * useSpecGenerator - Event-based SpecGenerator wrapper for React/Ink TUI
 *
 * Wraps the existing SpecGenerator to emit events and manage state:
 * - phase_change -> update PhaseHeader
 * - tool_start / tool_end -> show ToolCallCard
 * - text_delta -> stream to StreamingText
 * - question -> prompt user input
 * - done -> complete flow
 */

import { useState, useCallback, useRef } from 'react';
import type { Message, ToolCall } from '../components/MessageList.js';
import type { ToolCallStatus } from '../components/ToolCallCard.js';

/**
 * Generator phases matching SpecGenerator
 */
export type GeneratorPhase = 'context' | 'goals' | 'interview' | 'generation' | 'complete';

/**
 * Phase configuration for display
 */
export interface PhaseConfig {
  /** Phase number (1-based) */
  number: number;
  /** Human-readable phase name */
  name: string;
  /** Description of what happens in this phase */
  description: string;
}

/**
 * Phase configurations for display
 */
export const PHASE_CONFIGS: Record<GeneratorPhase, PhaseConfig> = {
  context: {
    number: 1,
    name: 'Context',
    description: 'Share reference URLs or files',
  },
  goals: {
    number: 2,
    name: 'Goals',
    description: 'Describe what you want to build',
  },
  interview: {
    number: 3,
    name: 'Interview',
    description: 'Answer clarifying questions',
  },
  generation: {
    number: 4,
    name: 'Generation',
    description: 'Generate specification',
  },
  complete: {
    number: 5,
    name: 'Complete',
    description: 'Spec generated',
  },
};

/**
 * Total number of display phases (excludes 'complete' in progress bar)
 */
export const TOTAL_DISPLAY_PHASES = 4;

/**
 * State managed by the useSpecGenerator hook
 */
export interface SpecGeneratorState {
  /** Current phase of the generation process */
  phase: GeneratorPhase;
  /** Conversation history for MessageList */
  messages: Message[];
  /** Whether the AI is currently working (thinking/executing) */
  isWorking: boolean;
  /** Status message for working indicator ("Thinking...", "Reading files...", etc.) */
  workingStatus: string;
  /** Current AI question waiting for user answer */
  currentQuestion: string;
  /** Whether waiting for user input */
  awaitingInput: boolean;
  /** Final generated spec when done */
  generatedSpec: string | null;
  /** Error message if something went wrong */
  error: string | null;
  /** Number of interview questions completed */
  questionCount: number;
  /** References added during context phase */
  references: Array<{ source: string; content: string }>;
}

/**
 * Options for initializing the spec generator
 */
export interface SpecGeneratorOptions {
  /** Name of the feature being specified */
  featureName: string;
  /** Project root directory path */
  projectRoot: string;
  /** AI provider to use */
  provider?: string;
  /** Model ID to use */
  model?: string;
}

/**
 * Return value from useSpecGenerator hook
 */
export interface UseSpecGeneratorReturn {
  /** Current state */
  state: SpecGeneratorState;

  // Actions

  /**
   * Submit user's answer to the current question
   * Used during interview phase
   */
  submitAnswer: (answer: string) => Promise<void>;

  /**
   * Add a reference URL or file path during context phase
   */
  addReference: (refUrl: string) => Promise<void>;

  /**
   * Skip context/interview and go directly to generation
   */
  skipToGeneration: () => Promise<void>;

  /**
   * Move to the next phase
   */
  advancePhase: () => void;

  /**
   * Reset to initial state
   */
  reset: () => void;

  /**
   * Initialize the generator with options
   */
  initialize: (options: SpecGeneratorOptions) => void;

  // Helpers

  /**
   * Add a message to the conversation
   */
  addMessage: (role: 'user' | 'assistant' | 'system', content: string, toolCalls?: ToolCall[]) => void;

  /**
   * Add a streaming message (assistant) that will be updated
   */
  addStreamingMessage: (initialContent?: string, toolCalls?: ToolCall[]) => string;

  /**
   * Update the streaming message content
   */
  updateStreamingMessage: (content: string) => void;

  /**
   * Mark the current streaming message as complete
   */
  completeStreamingMessage: () => void;

  /**
   * Clear working state and re-enable input
   * Call this when AI response is complete and ready for next user input
   */
  setReady: () => void;

  /**
   * Start a tool execution (shows ToolCallCard)
   */
  startToolCall: (toolName: string, input: Record<string, unknown>) => string;

  /**
   * Complete a tool execution
   */
  completeToolCall: (toolId: string, output?: string, error?: string) => void;

  // Orchestrator-specific actions

  /**
   * Set the current phase (used by orchestrator)
   */
  setPhase: (phase: GeneratorPhase) => void;

  /**
   * Set the generated spec (used by orchestrator on completion)
   */
  setGeneratedSpec: (spec: string) => void;

  /**
   * Set an error state (used by orchestrator on error)
   */
  setError: (error: string) => void;

  /**
   * Set working state with status message (used by orchestrator)
   */
  setWorking: (isWorking: boolean, status: string) => void;
}

/**
 * Generate a unique ID for messages and tool calls
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format tool input for display
 */
function formatToolInput(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return String(args.path || '');
    case 'search_codebase':
      return `"${args.pattern || ''}"${args.directory ? ` in ${args.directory}/` : ''}`;
    case 'list_directory':
      return String(args.path || '.');
    case 'tavily_search':
      return `"${args.query || ''}"`;
    case 'resolveLibraryId':
      return String(args.libraryName || '');
    case 'queryDocs':
      return `${args.libraryId} - "${String(args.query || '').slice(0, 40)}..."`;
    default:
      return JSON.stringify(args).slice(0, 50);
  }
}

/**
 * Initial state for the generator
 */
const initialState: SpecGeneratorState = {
  phase: 'context',
  messages: [],
  isWorking: false,
  workingStatus: '',
  currentQuestion: '',
  awaitingInput: false,
  generatedSpec: null,
  error: null,
  questionCount: 0,
  references: [],
};

/**
 * useSpecGenerator - React hook wrapping SpecGenerator for TUI use
 *
 * This hook manages the state and provides actions for running the
 * spec generation flow in a React/Ink application.
 *
 * The hook does not directly instantiate SpecGenerator; instead, it
 * provides the state management and action handlers that a screen
 * component can use to orchestrate the flow.
 *
 * @example
 * ```tsx
 * function SpecGeneratorScreen({ featureName }: Props) {
 *   const { state, submitAnswer, addReference, initialize } = useSpecGenerator();
 *
 *   useEffect(() => {
 *     initialize({ featureName, projectRoot: process.cwd() });
 *   }, []);
 *
 *   return (
 *     <Box flexDirection="column">
 *       <PhaseHeader
 *         currentPhase={PHASE_CONFIGS[state.phase].number}
 *         totalPhases={TOTAL_DISPLAY_PHASES}
 *         phaseName={PHASE_CONFIGS[state.phase].name}
 *       />
 *       <MessageList messages={state.messages} />
 *       {state.isWorking && <WorkingIndicator state="thinking" status={state.workingStatus} />}
 *       {state.awaitingInput && <ChatInput onSubmit={submitAnswer} />}
 *     </Box>
 *   );
 * }
 * ```
 */
export function useSpecGenerator(): UseSpecGeneratorReturn {
  const [state, setState] = useState<SpecGeneratorState>(initialState);

  // Track options for potential re-initialization
  const optionsRef = useRef<SpecGeneratorOptions | null>(null);

  // Track current streaming message ID for updates
  const streamingMessageIdRef = useRef<string | null>(null);

  // Track active tool calls by ID
  const activeToolCallsRef = useRef<Map<string, { messageId: string; index: number }>>(new Map());

  /**
   * Initialize with options
   */
  const initialize = useCallback((options: SpecGeneratorOptions) => {
    optionsRef.current = options;

    // Add initial system message
    const systemMessage: Message = {
      id: generateId(),
      role: 'system',
      content: `Spec Generator initialized for feature: ${options.featureName}`,
    };

    setState({
      ...initialState,
      messages: [systemMessage],
      // Enable input immediately so users can enter context/goals
      awaitingInput: true,
    });
  }, []);

  /**
   * Add a message to the conversation
   */
  const addMessage = useCallback(
    (role: 'user' | 'assistant' | 'system', content: string, toolCalls?: ToolCall[]) => {
      const message: Message = {
        id: generateId(),
        role,
        content,
        toolCalls,
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
        // Clear awaiting input when assistant responds
        awaitingInput: role === 'assistant' ? false : prev.awaitingInput,
      }));
    },
    []
  );

  /**
   * Add a streaming message (assistant) that will be updated
   */
  const addStreamingMessage = useCallback((initialContent: string = '', toolCalls?: ToolCall[]) => {
    const messageId = generateId();
    streamingMessageIdRef.current = messageId;

    const message: Message = {
      id: messageId,
      role: 'assistant',
      content: initialContent,
      toolCalls,
      isStreaming: true,
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
    }));

    return messageId;
  }, []);

  /**
   * Update the streaming message content
   */
  const updateStreamingMessage = useCallback((content: string) => {
    const messageId = streamingMessageIdRef.current;
    if (!messageId) return;

    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === messageId ? { ...msg, content } : msg
      ),
    }));
  }, []);

  /**
   * Mark the current streaming message as complete
   */
  const completeStreamingMessage = useCallback(() => {
    const messageId = streamingMessageIdRef.current;
    if (!messageId) return;

    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === messageId ? { ...msg, isStreaming: false } : msg
      ),
    }));

    streamingMessageIdRef.current = null;
  }, []);

  /**
   * Clear working state and re-enable input
   * Call this when AI response is complete and ready for next user input
   */
  const setReady = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isWorking: false,
      workingStatus: '',
      awaitingInput: true,
    }));
  }, []);

  /**
   * Start a tool execution
   */
  const startToolCall = useCallback((toolName: string, input: Record<string, unknown>): string => {
    const toolId = generateId();
    const formattedInput = formatToolInput(toolName, input);

    const toolCall: ToolCall = {
      toolName,
      status: 'running' as ToolCallStatus,
      input: formattedInput,
    };

    // If there's a streaming message, add tool call to it
    // Otherwise, create a new assistant message with the tool call
    setState((prev) => {
      const streamingId = streamingMessageIdRef.current;

      if (streamingId) {
        // Add to existing streaming message
        const updatedMessages = prev.messages.map((msg) => {
          if (msg.id === streamingId) {
            const existingToolCalls = msg.toolCalls || [];
            activeToolCallsRef.current.set(toolId, {
              messageId: streamingId,
              index: existingToolCalls.length,
            });
            return {
              ...msg,
              toolCalls: [...existingToolCalls, toolCall],
            };
          }
          return msg;
        });
        return { ...prev, messages: updatedMessages };
      } else {
        // Create new message with tool call
        const messageId = generateId();
        streamingMessageIdRef.current = messageId;
        activeToolCallsRef.current.set(toolId, {
          messageId,
          index: 0,
        });

        const newMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: '',
          toolCalls: [toolCall],
          isStreaming: true,
        };

        return {
          ...prev,
          messages: [...prev.messages, newMessage],
          isWorking: true,
          workingStatus: `Using ${toolName}...`,
        };
      }
    });

    return toolId;
  }, []);

  /**
   * Complete a tool execution
   */
  const completeToolCall = useCallback((toolId: string, output?: string, error?: string) => {
    const toolInfo = activeToolCallsRef.current.get(toolId);
    if (!toolInfo) return;

    const newStatus: ToolCallStatus = error ? 'error' : 'complete';

    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => {
        if (msg.id === toolInfo.messageId && msg.toolCalls) {
          const updatedToolCalls = [...msg.toolCalls];
          if (updatedToolCalls[toolInfo.index]) {
            updatedToolCalls[toolInfo.index] = {
              ...updatedToolCalls[toolInfo.index],
              status: newStatus,
              output,
              error,
            };
          }
          // If this message was only for tool calls and has no content, stop streaming
          const allDone = updatedToolCalls.every(tc => tc.status !== 'running');
          const shouldStopStreaming = msg.isStreaming && allDone && msg.content.trim() === '';
          if (shouldStopStreaming && streamingMessageIdRef.current === msg.id) {
            streamingMessageIdRef.current = null;
          }
          return {
            ...msg,
            toolCalls: updatedToolCalls,
            isStreaming: shouldStopStreaming ? false : msg.isStreaming,
          };
        }
        return msg;
      }),
    }));

    activeToolCallsRef.current.delete(toolId);
  }, []);

  /**
   * Advance to the next phase
   */
  const advancePhase = useCallback(() => {
    setState((prev) => {
      const phaseOrder: GeneratorPhase[] = ['context', 'goals', 'interview', 'generation', 'complete'];
      const currentIndex = phaseOrder.indexOf(prev.phase);
      const nextPhase = phaseOrder[currentIndex + 1] || 'complete';

      // Add system message for phase change
      const phaseConfig = PHASE_CONFIGS[nextPhase];
      const systemMessage: Message = {
        id: generateId(),
        role: 'system',
        content: `Phase ${phaseConfig.number}: ${phaseConfig.name} - ${phaseConfig.description}`,
      };

      return {
        ...prev,
        phase: nextPhase,
        messages: [...prev.messages, systemMessage],
        awaitingInput: nextPhase === 'context' || nextPhase === 'goals' || nextPhase === 'interview',
      };
    });
  }, []);

  /**
   * Submit user's answer
   */
  const submitAnswer = useCallback(async (answer: string) => {
    // Add user message
    addMessage('user', answer);

    // Update state
    setState((prev) => ({
      ...prev,
      awaitingInput: false,
      isWorking: true,
      workingStatus: 'Thinking...',
      questionCount: prev.phase === 'interview' ? prev.questionCount + 1 : prev.questionCount,
    }));

    // The actual AI processing would be handled by the screen component
    // that orchestrates the SpecGenerator or conversation manager
  }, [addMessage]);

  /**
   * Add a reference during context phase
   */
  const addReference = useCallback(async (refUrl: string) => {
    // Add user message showing the reference
    addMessage('user', refUrl);

    setState((prev) => ({
      ...prev,
      isWorking: true,
      workingStatus: 'Fetching reference...',
    }));

    // The actual fetching would be handled by the screen component
  }, [addMessage]);

  /**
   * Skip to generation phase
   */
  const skipToGeneration = useCallback(async () => {
    setState((prev) => {
      const systemMessage: Message = {
        id: generateId(),
        role: 'system',
        content: 'Skipping to specification generation...',
      };

      return {
        ...prev,
        phase: 'generation',
        messages: [...prev.messages, systemMessage],
        awaitingInput: false,
        isWorking: true,
        workingStatus: 'Generating specification...',
      };
    });
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    streamingMessageIdRef.current = null;
    activeToolCallsRef.current.clear();
    optionsRef.current = null;
    setState(initialState);
  }, []);

  /**
   * Set the current phase (used by orchestrator)
   */
  const setPhase = useCallback((phase: GeneratorPhase) => {
    setState((prev) => ({
      ...prev,
      phase,
    }));
  }, []);

  /**
   * Set the generated spec (used by orchestrator on completion)
   */
  const setGeneratedSpec = useCallback((spec: string) => {
    setState((prev) => ({
      ...prev,
      generatedSpec: spec,
      phase: 'complete',
      isWorking: false,
      awaitingInput: false,
    }));
  }, []);

  /**
   * Set an error state (used by orchestrator on error)
   */
  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      error,
      isWorking: false,
    }));
  }, []);

  /**
   * Set working state with status message (used by orchestrator)
   */
  const setWorking = useCallback((isWorking: boolean, status: string) => {
    setState((prev) => ({
      ...prev,
      isWorking,
      workingStatus: status,
      awaitingInput: !isWorking && prev.phase !== 'complete',
    }));
  }, []);

  return {
    state,
    submitAnswer,
    addReference,
    skipToGeneration,
    advancePhase,
    reset,
    initialize,
    addMessage,
    addStreamingMessage,
    updateStreamingMessage,
    completeStreamingMessage,
    setReady,
    startToolCall,
    completeToolCall,
    // Orchestrator-specific actions
    setPhase,
    setGeneratedSpec,
    setError,
    setWorking,
  };
}
