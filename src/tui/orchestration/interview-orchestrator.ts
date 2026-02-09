/**
 * Interview Orchestrator
 * Bridges the event-based TUI hook to ConversationManager
 *
 * This class manages the interview flow for spec generation,
 * translating ConversationManager events into TUI-friendly callbacks.
 */

import { ConversationManager } from '../../ai/conversation/conversation-manager.js';
import { fetchContent } from '../../ai/conversation/url-fetcher.js';
import { createInterviewTools } from '../../ai/conversation/interview-tools.js';
import { createTavilySearchTool, canUseTavily } from '../../ai/tools/tavily.js';
import { createContext7Tools, canUseContext7 } from '../../ai/tools/context7.js';
import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { isUrl } from '../../ai/conversation/url-fetcher.js';
import type { AIProvider } from '../../ai/providers.js';
import type { ScanResult } from '../../scanner/types.js';
import type { GeneratorPhase } from '../hooks/useSpecGenerator.js';
import { resolveOptionLabels, type InterviewQuestion, type InterviewOption, type InterviewAnswer } from '../types/interview.js';

/** Maximum number of interview questions before auto-completing */
const MAX_INTERVIEW_QUESTIONS = 10;

/** Minimum number of questions before AI can indicate "enough information" */
const MIN_INTERVIEW_QUESTIONS = 2;

/**
 * Session context from /init analysis
 */
export interface SessionContext {
  entryPoints?: string[];
  keyDirectories?: Record<string, string>;
  commands?: { build?: string; dev?: string; test?: string };
  namingConventions?: string;
  implementationGuidelines?: string[];
  keyPatterns?: string[];
}

/**
 * Options for the InterviewOrchestrator
 */
export interface InterviewOrchestratorOptions {
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
  /** Rich session context from /init */
  sessionContext?: SessionContext;
  /** Tavily API key for web search */
  tavilyApiKey?: string;
  /** Context7 API key for docs lookup */
  context7ApiKey?: string;

  // Event callbacks for TUI
  /** Called when a message should be added to the conversation */
  onMessage: (role: 'user' | 'assistant' | 'system', content: string) => void;
  /** Called when streaming text should be appended */
  onStreamChunk: (chunk: string) => void;
  /** Called when streaming is complete */
  onStreamComplete: () => void;
  /** Called when a tool starts executing */
  onToolStart: (toolName: string, input: Record<string, unknown>) => string;
  /** Called when a tool completes */
  onToolEnd: (toolId: string, output?: string, error?: string) => void;
  /** Called when the phase changes */
  onPhaseChange: (phase: GeneratorPhase) => void;
  /** Called when spec generation is complete */
  onComplete: (spec: string) => void;
  /** Called when an error occurs */
  onError: (error: string) => void;
  /** Called when working state changes */
  onWorkingChange: (isWorking: boolean, status: string) => void;
  /** Called when ready for user input */
  onReady: () => void;
  /** Called when a structured interview question is received */
  onQuestion?: (question: InterviewQuestion) => void;
}

/**
 * Build enhanced system prompt with project context and tool awareness
 * @internal Exported for testing
 */
export function buildSystemPrompt(
  sessionContext?: SessionContext,
  hasTools?: { codebase: boolean; tavily: boolean; context7: boolean }
): string {
  const parts: string[] = [];

  // Base prompt
  parts.push(`You are an expert product manager and technical writer helping to create detailed feature specifications.

Your role is to:
1. Understand the user's feature goals through targeted questions
2. Identify edge cases and potential issues
3. Generate a comprehensive, actionable specification

When interviewing:
- Ask one focused question at a time
- Acknowledge answers before asking the next question
- Stop asking when you have enough information (usually 3-5 questions)
- Say "I have enough information to generate the spec" when ready

IMPORTANT: Structured Options for Interview Questions
For each question, provide 3-6 pre-written answer options in a fenced code block:

\`\`\`options
[
  {"id": "opt1", "label": "Option text here"},
  {"id": "opt2", "label": "Another option"},
  {"id": "opt3", "label": "Yet another option"}
]
\`\`\`

Guidelines for options:
- Keep labels concise and actionable (under 60 characters)
- Cover common scenarios but don't try to be exhaustive
- Use clear, specific language
- You can include natural language context before or after the options block
- The user can still provide free-text if the options don't fit`);

  // Add tool awareness
  if (hasTools) {
    const toolList: string[] = [];
    if (hasTools.codebase) {
      toolList.push('- read_file: Read project files to understand existing code');
      toolList.push('- search_codebase: Search for patterns, functions, or imports');
      toolList.push('- list_directory: Explore project structure');
    }
    if (hasTools.tavily) {
      toolList.push('- tavily_search: Search the web for best practices and documentation');
    }
    if (hasTools.context7) {
      toolList.push('- resolveLibraryId/queryDocs: Look up library documentation');
    }

    if (toolList.length > 0) {
      parts.push(`
## Available Tools
You have access to the following tools to help understand the project and gather information:
${toolList.join('\n')}

USE THESE TOOLS PROACTIVELY:
- When the user describes a feature, read relevant files to understand existing patterns
- When unsure about implementation, search the codebase for similar code
- When discussing best practices, search the web for current recommendations
- Don't ask the user to paste code - read it yourself`);
    }

    // Add emphatic web search guidance when Tavily is available
    if (hasTools.tavily) {
      parts.push(`
## IMPORTANT: Web Search Available
You have tavily_search to look up current best practices and documentation.

WHEN YOU MUST USE WEB SEARCH:
- User mentions a library, framework, or API you should verify
- User asks about "best practices" or "how to" patterns
- You need current (2026+) information not in your training data
- Discussing implementation approaches for modern libraries`);
    }
  }

  // Add project context from /init
  if (sessionContext) {
    const contextParts: string[] = ['## Project Context (from analysis)'];

    if (sessionContext.entryPoints && sessionContext.entryPoints.length > 0) {
      contextParts.push(`\nEntry Points:\n${sessionContext.entryPoints.map(e => `- ${e}`).join('\n')}`);
    }

    if (sessionContext.keyDirectories && Object.keys(sessionContext.keyDirectories).length > 0) {
      contextParts.push(`\nKey Directories:`);
      for (const [dir, purpose] of Object.entries(sessionContext.keyDirectories)) {
        contextParts.push(`- ${dir}: ${purpose}`);
      }
    }

    if (sessionContext.commands) {
      const cmds = sessionContext.commands;
      const cmdList = Object.entries(cmds).filter(([_, v]) => v);
      if (cmdList.length > 0) {
        contextParts.push(`\nCommands:`);
        for (const [name, cmd] of cmdList) {
          contextParts.push(`- ${name}: ${cmd}`);
        }
      }
    }

    if (sessionContext.namingConventions) {
      contextParts.push(`\nNaming Conventions:\n${sessionContext.namingConventions}`);
    }

    if (sessionContext.implementationGuidelines && sessionContext.implementationGuidelines.length > 0) {
      contextParts.push(`\nImplementation Guidelines:`);
      for (const guideline of sessionContext.implementationGuidelines) {
        contextParts.push(`- ${guideline}`);
      }
    }

    if (sessionContext.keyPatterns && sessionContext.keyPatterns.length > 0) {
      contextParts.push(`\nKey Patterns:`);
      for (const pattern of sessionContext.keyPatterns) {
        contextParts.push(`- ${pattern}`);
      }
    }

    if (contextParts.length > 1) {
      parts.push(contextParts.join('\n'));
    }
  }

  // Spec format
  parts.push(`
## Spec Format
When generating the spec, use this format:

# [Feature Name] Feature Specification

**Status:** Planned
**Version:** 1.0
**Last Updated:** [date]

## Purpose
[Brief description]

## User Stories
- As a [user], I want [action] so that [benefit]

## Requirements

### Functional Requirements
- [ ] Requirement with clear acceptance criteria

### Non-Functional Requirements
- [ ] Performance, security, accessibility requirements

## Technical Notes
- Implementation approach
- Key dependencies
- Database changes if needed

## Acceptance Criteria
- [ ] Specific, testable conditions

## Out of Scope
- Items explicitly not included`);

  return parts.join('\n\n');
}

/**
 * Parse an AI response to extract a structured interview question with options
 * @param response The AI response text
 * @returns InterviewQuestion object if parsing succeeds, null otherwise
 * @internal Exported for testing
 */
export function parseInterviewResponse(response: string): InterviewQuestion | null {
  // Look for the ```options fenced block
  const optionsBlockRegex = /```options\s*\n([\s\S]*?)\n```/;
  const match = response.match(optionsBlockRegex);

  if (!match) {
    return null;
  }

  const jsonContent = match[1].trim();

  let parsedOptions: unknown;
  try {
    parsedOptions = JSON.parse(jsonContent);
  } catch {
    return null;
  }

  if (!Array.isArray(parsedOptions)) {
    return null;
  }

  // Validate each option has non-empty id and label
  const options: InterviewOption[] = [];
  for (const option of parsedOptions) {
    if (
      typeof option === 'object' &&
      option !== null &&
      typeof option.id === 'string' &&
      option.id !== '' &&
      typeof option.label === 'string' &&
      option.label !== ''
    ) {
      options.push({
        id: option.id,
        label: option.label,
      });
    } else {
      return null;
    }
  }

  if (options.length === 0) {
    return null;
  }

  // Reject duplicate IDs
  const ids = new Set(options.map(o => o.id));
  if (ids.size !== options.length) {
    return null;
  }

  // Extract question text (everything before the options block, trimmed)
  const questionText = response.substring(0, match.index).trim();

  if (!questionText) {
    return null;
  }

  // Generate a question ID (using timestamp + random for uniqueness)
  const questionId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    id: questionId,
    text: questionText,
    options,
  };
}

/**
 * Extract session context from EnhancedScanResult
 * @internal Exported for testing
 */
export function extractSessionContext(scanResult: ScanResult): SessionContext | undefined {
  // Check if this is an EnhancedScanResult with aiAnalysis
  const enhanced = scanResult as ScanResult & {
    aiAnalysis?: {
      projectContext?: {
        entryPoints?: string[];
        keyDirectories?: Record<string, string>;
        namingConventions?: string;
      };
      commands?: SessionContext['commands'];
      implementationGuidelines?: string[];
      technologyPractices?: { practices?: string[] };
    };
  };
  if (!enhanced.aiAnalysis) {
    return undefined;
  }

  const ai = enhanced.aiAnalysis;
  return {
    entryPoints: ai.projectContext?.entryPoints,
    keyDirectories: ai.projectContext?.keyDirectories,
    commands: ai.commands,
    namingConventions: ai.projectContext?.namingConventions,
    implementationGuidelines: ai.implementationGuidelines,
    keyPatterns: ai.technologyPractices?.practices,
  };
}

/**
 * InterviewOrchestrator
 *
 * Manages the interview flow for spec generation, bridging
 * the ConversationManager to TUI callbacks.
 */
export class InterviewOrchestrator {
  private conversation: ConversationManager;
  private phase: GeneratorPhase = 'context';
  private readonly featureName: string;
  private readonly projectRoot: string;
  private generatedSpec: string = '';
  private questionCount: number = 0;
  private readonly hasTools: { codebase: boolean; tavily: boolean; context7: boolean };
  private readonly sessionContext?: SessionContext;
  private currentQuestion: InterviewQuestion | null = null;

  // Callbacks
  private readonly onMessage: InterviewOrchestratorOptions['onMessage'];
  private readonly onStreamChunk: InterviewOrchestratorOptions['onStreamChunk'];
  private readonly onStreamComplete: InterviewOrchestratorOptions['onStreamComplete'];
  private readonly onToolStart: InterviewOrchestratorOptions['onToolStart'];
  private readonly onToolEnd: InterviewOrchestratorOptions['onToolEnd'];
  private readonly onPhaseChange: InterviewOrchestratorOptions['onPhaseChange'];
  private readonly onComplete: InterviewOrchestratorOptions['onComplete'];
  private readonly onError: InterviewOrchestratorOptions['onError'];
  private readonly onWorkingChange: InterviewOrchestratorOptions['onWorkingChange'];
  private readonly onReady: InterviewOrchestratorOptions['onReady'];
  private readonly onQuestion?: InterviewOrchestratorOptions['onQuestion'];

  // Track active tool calls for result mapping
  // Uses a queue per tool name to handle multiple calls of the same tool
  private activeToolCalls: Map<string, string[]> = new Map();

  constructor(options: InterviewOrchestratorOptions) {
    this.featureName = options.featureName;
    this.projectRoot = options.projectRoot;

    // Store callbacks
    this.onMessage = options.onMessage;
    this.onStreamChunk = options.onStreamChunk;
    this.onStreamComplete = options.onStreamComplete;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
    this.onPhaseChange = options.onPhaseChange;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
    this.onWorkingChange = options.onWorkingChange;
    this.onReady = options.onReady;
    this.onQuestion = options.onQuestion;

    // Get API keys from options or environment
    const tavilyApiKey = options.tavilyApiKey || process.env.TAVILY_API_KEY;
    const context7ApiKey = options.context7ApiKey || process.env.CONTEXT7_API_KEY;

    // Track which tools are available
    this.hasTools = {
      codebase: true, // Always available
      tavily: canUseTavily(tavilyApiKey),
      context7: canUseContext7(context7ApiKey),
    };

    // Build tools object
    const tools: Record<string, unknown> = {};

    // Add codebase tools
    const codebaseTools = createInterviewTools(options.projectRoot);
    Object.assign(tools, codebaseTools);

    // Add Tavily search if available
    if (this.hasTools.tavily && tavilyApiKey) {
      tools.tavily_search = createTavilySearchTool(tavilyApiKey);
    }

    // Add Context7 tools if available
    if (this.hasTools.context7 && context7ApiKey) {
      const context7Tools = createContext7Tools(context7ApiKey);
      Object.assign(tools, context7Tools);
    }

    // Extract session context from scan result or use provided
    this.sessionContext = options.sessionContext || (
      options.scanResult ? extractSessionContext(options.scanResult) : undefined
    );

    // Build enhanced system prompt
    const systemPrompt = buildSystemPrompt(this.sessionContext, this.hasTools);

    // Create conversation manager with tools
    this.conversation = new ConversationManager({
      provider: options.provider,
      model: options.model,
      systemPrompt,
      tools: tools as Record<string, never>,
      onToolUse: (toolName, args) => {
        // Create tool ID and notify TUI
        const toolId = this.onToolStart(toolName, args);
        // Store in queue for this tool name (handles multiple concurrent calls)
        const queue = this.activeToolCalls.get(toolName) || [];
        queue.push(toolId);
        this.activeToolCalls.set(toolName, queue);
      },
      onToolResult: (toolName, result) => {
        const queue = this.activeToolCalls.get(toolName);
        // Get the first (oldest) tool ID from the queue (FIFO order)
        const toolId = queue?.shift();
        if (toolId) {
          // Format result for display
          const output = typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2).slice(0, 200);
          this.onToolEnd(toolId, output);
          // Clean up empty queues
          if (queue && queue.length === 0) {
            this.activeToolCalls.delete(toolName);
          }
        }
      },
      maxToolSteps: 8,
    });

    if (options.scanResult) {
      this.conversation.setCodebaseContext(options.scanResult);
    }
  }

  /**
   * Start the interview flow
   * Called after the component mounts
   */
  async start(): Promise<void> {
    try {
      // Set initial phase
      this.onPhaseChange('context');
      this.onMessage('system', `Spec Generator initialized for feature: ${this.featureName}`);

      // Ready for context input
      this.onReady();
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Add a reference URL or file path
   */
  async addReference(refUrl: string): Promise<void> {
    try {
      this.onWorkingChange(true, 'Fetching reference...');

      const trimmed = refUrl.trim();
      if (!trimmed) {
        this.onReady();
        return;
      }

      const forceInline = /^text:\s*/i.test(trimmed);
      const inlinePayload = forceInline
        ? trimmed.replace(/^text:\s*/i, '').trim()
        : trimmed;
      const isInlineCandidate = inlinePayload.length >= 40 || /\s/.test(inlinePayload);
      const isUrlInput = !forceInline && isUrl(trimmed);
      const absolutePath = isAbsolute(trimmed) ? trimmed : resolve(this.projectRoot, trimmed);
      const fileExists = !forceInline && !isUrlInput && existsSync(absolutePath);

      if (forceInline && !inlinePayload) {
        this.onMessage('system', 'Error: Inline context is empty after "text:"');
        this.onReady();
        return;
      }

      if ((forceInline || (!isUrlInput && !fileExists && isInlineCandidate)) && inlinePayload) {
        const MAX_INLINE_LENGTH = 10000;
        const truncated = inlinePayload.length > MAX_INLINE_LENGTH;
        const inlineContent = truncated ? inlinePayload.slice(0, MAX_INLINE_LENGTH) : inlinePayload;
        this.conversation.addReference(inlineContent, 'Inline context');
        const preview = inlineContent.slice(0, 100).replace(/\n/g, ' ').trim();
        const suffix = truncated ? ' (truncated)' : '';
        this.onMessage('system', `Added inline context${suffix}: "${preview}..."`);
        this.onReady();
        return;
      }

      const result = await fetchContent(trimmed, this.projectRoot);

      if (result.error) {
        this.onMessage('system', `Error: ${result.error}`);
      } else {
        this.conversation.addReference(result.content, result.source);
        const preview = result.content.slice(0, 100).replace(/\n/g, ' ').trim();
        this.onMessage('system', `Added reference from ${result.source}: "${preview}..."`);
      }

      this.onReady();
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error));
      this.onReady();
    }
  }

  /**
   * Advance to the goals phase
   * Called when user is done adding context
   */
  async advanceToGoals(): Promise<void> {
    this.phase = 'goals';
    this.onPhaseChange('goals');
    this.onMessage('system', 'Phase 2: Goals - Describe what you want to build');
    this.onReady();
  }

  /**
   * Submit user's goals and start the interview
   */
  async submitGoals(goals: string): Promise<void> {
    try {
      this.onWorkingChange(true, 'Exploring project...');

      // Add user message to conversation
      const userMessage = goals
        ? `I want to create a feature called "${this.featureName}". Here's what I'm thinking:\n\n${goals}`
        : `I want to create a feature called "${this.featureName}".`;

      this.conversation.addToHistory({ role: 'user', content: userMessage });

      // Phase 2a: Explore project silently
      const explorePrompt = `Explore the codebase to understand the project structure for the feature "${this.featureName}".
Use your tools to read key files that are relevant to this feature.
DO NOT ask any questions yet - just gather information silently.
Respond with a VERY brief (1-2 sentence) summary of what you found relevant to this feature.`;

      const summary = await this.conversation.chat(explorePrompt);
      const shortSummary = summary.slice(0, 120).replace(/\n/g, ' ');
      this.onMessage('system', `Context: ${shortSummary}${summary.length > 120 ? '...' : ''}`);

      // Phase 2b: Start interview with first question
      this.onWorkingChange(true, 'Formulating first question based on analysis...');

      const interviewPrompt = `Based on what you learned about the project, briefly acknowledge the user's goals for "${this.featureName}" and ask your FIRST clarifying question.
Ask only ONE question. Be concise.`;

      const response = await this.conversation.chat(interviewPrompt);
      this.emitParsedResponse(response);

      // Transition to interview phase
      this.phase = 'interview';
      this.onPhaseChange('interview');
      this.onReady();
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error));
      this.onReady();
    }
  }

  /**
   * Submit an answer during the interview phase
   */
  async submitAnswer(answer: InterviewAnswer): Promise<void> {
    try {
      this.onWorkingChange(true, 'Thinking...');

      // Format the answer for the AI conversation
      let formattedAnswer: string;
      if (answer.mode === 'multiSelect') {
        if (answer.selectedOptionIds.length === 0) {
          formattedAnswer = 'None of the options fit my needs.';
        } else {
          const labels = this.currentQuestion
            ? resolveOptionLabels(this.currentQuestion.options, answer.selectedOptionIds)
            : [...answer.selectedOptionIds];
          formattedAnswer = labels.join(', ');
        }
      } else {
        formattedAnswer = answer.text;
      }

      const response = await this.conversation.chat(formattedAnswer);

      this.questionCount++;

      // Check if AI indicates it has enough information
      if (this.questionCount >= MIN_INTERVIEW_QUESTIONS) {
        const lowerResponse = response.toLowerCase();
        if (
          lowerResponse.includes('enough information') ||
          lowerResponse.includes('ready to generate') ||
          lowerResponse.includes("let me generate") ||
          lowerResponse.includes("i'll now generate") ||
          lowerResponse.includes("i will now generate")
        ) {
          // Don't show the AI's response - go straight to generation
          // Show a brief acknowledgment instead
          this.onMessage('assistant', 'I have enough information to generate the spec.');
          await this.generateSpec();
          return;
        }
      }

      this.emitParsedResponse(response);

      // Check if max questions reached
      if (this.questionCount >= MAX_INTERVIEW_QUESTIONS) {
        await this.generateSpec();
        return;
      }

      this.onReady();
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error));
      this.onReady();
    }
  }

  /**
   * Parse an AI response and emit as structured question or plain text
   */
  private emitParsedResponse(response: string): void {
    const parsedQuestion = parseInterviewResponse(response);

    if (parsedQuestion && this.onQuestion) {
      this.currentQuestion = parsedQuestion;
      if (parsedQuestion.text) {
        this.onMessage('assistant', parsedQuestion.text);
      }
      this.onQuestion(parsedQuestion);
    } else {
      this.currentQuestion = null;
      this.onMessage('assistant', response);
    }
  }

  /**
   * Skip to generation phase
   */
  async skipToGeneration(): Promise<void> {
    await this.generateSpec();
  }

  /**
   * Generate the specification
   */
  private async generateSpec(): Promise<void> {
    try {
      this.phase = 'generation';
      this.onPhaseChange('generation');
      this.onWorkingChange(true, 'Generating specification...');

      const prompt = `Based on our conversation, generate a complete feature specification for "${this.featureName}".

Use the format from your instructions. Be specific and actionable. Include:
- Clear user stories
- Detailed requirements with acceptance criteria
- Technical notes based on the project's tech stack
- Specific acceptance criteria that can be tested

Today's date is ${new Date().toISOString().split('T')[0]}.`;

      // Use streaming for generation
      const stream = this.conversation.chatStream(prompt);
      let fullSpec = '';

      for await (const chunk of stream) {
        fullSpec += chunk;
        this.onStreamChunk(chunk);
      }

      this.onStreamComplete();
      this.generatedSpec = fullSpec;

      // Complete
      this.phase = 'complete';
      this.onPhaseChange('complete');
      this.onComplete(fullSpec);
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Get current phase
   */
  getPhase(): GeneratorPhase {
    return this.phase;
  }

  /**
   * Get question count
   */
  getQuestionCount(): number {
    return this.questionCount;
  }

  /**
   * Get generated spec
   */
  getSpec(): string {
    return this.generatedSpec;
  }
}
