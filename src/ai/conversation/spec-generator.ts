/**
 * Spec Generator
 * AI-powered feature specification generator with interview flow
 * Enhanced with codebase tools and Claude Code-like UX
 */

import readline from 'node:readline';
import pc from 'picocolors';
import { ConversationManager } from './conversation-manager.js';
import { fetchContent } from './url-fetcher.js';
import { createInterviewTools } from './interview-tools.js';
import { createTavilySearchTool, canUseTavily } from '../tools/tavily.js';
import { createContext7Tools, canUseContext7 } from '../tools/context7.js';
import type { AIProvider } from '../providers.js';
import type { ScanResult } from '../../scanner/types.js';
import type { EnhancedScanResult, AIAnalysisResult } from '../enhancer.js';
import { simpson } from '../../utils/colors.js';
import {
  displayPhaseHeader,
  displayToolUse,
  displaySessionContext,
  displayGarbledInputWarning,
  type Phase,
} from '../../utils/tui.js';

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
 * Spec generator options
 */
export interface SpecGeneratorOptions {
  featureName: string;
  projectRoot: string;
  provider: AIProvider;
  model: string;
  scanResult?: ScanResult;
  /** Rich session context from /init */
  sessionContext?: SessionContext;
  /** Tavily API key for web search */
  tavilyApiKey?: string;
  /** Context7 API key for docs lookup */
  context7ApiKey?: string;
}

/**
 * Generation phases
 */
type GeneratorPhase = 'context' | 'goals' | 'interview' | 'generation' | 'complete';

/**
 * Prompt for user input
 */
async function promptUser(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Display streaming text with AI prefix
 */
async function displayStream(stream: AsyncIterable<string>): Promise<string> {
  process.stdout.write(simpson.blue('AI: '));
  let fullText = '';
  for await (const chunk of stream) {
    process.stdout.write(chunk);
    fullText += chunk;
  }
  console.log(''); // New line after stream
  return fullText;
}

/**
 * Check if input looks garbled (common paste issues)
 */
function looksGarbled(input: string): boolean {
  const trimmed = input.trim();

  // Too short to be meaningful
  if (trimmed.length < 3) return false;

  // Common patterns from truncated pastes
  const garbledPatterns = [
    /^[a-z]+';$/i,           // Just "js';" or "ts';"
    /^[,\.\;\{\}\[\]]+$/,    // Just punctuation
    /^\s*['"`]\s*$/,         // Just quotes
    /^[a-z]{1,3}$/i,         // Just 1-3 letters
    /^\d+$/,                 // Just numbers
    /^[^\w\s]+$/,            // Only special characters
  ];

  return garbledPatterns.some(p => p.test(trimmed));
}

/**
 * Build enhanced system prompt with project context and tool awareness
 */
function buildSystemPrompt(
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
- Say "I have enough information to generate the spec" when ready`);

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

    // Add emphatic web search guidance when Tavily is available (Task 4)
    if (hasTools.tavily) {
      parts.push(`
## IMPORTANT: Web Search Available
You have tavily_search to look up current best practices and documentation.

WHEN YOU MUST USE WEB SEARCH:
- User mentions a library, framework, or API you should verify
- User asks about "best practices" or "how to" patterns
- You need current (2026+) information not in your training data
- Discussing implementation approaches for modern libraries

EXAMPLE SEARCHES:
- tavily_search({ query: "React Server Components authentication patterns", timeRange: "year" })
- tavily_search({ query: "Next.js 14 app router middleware", timeRange: "year" })
- tavily_search({ query: "TypeScript strict mode best practices", timeRange: "year" })

DO NOT skip web search when the user discusses implementation approaches or mentions specific libraries.
Use timeRange: "year" to get recent results.`);
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
      contextParts.push(`\nNaming Conventions: ${sessionContext.namingConventions}`);
    }

    if (sessionContext.implementationGuidelines && sessionContext.implementationGuidelines.length > 0) {
      contextParts.push(`\nImplementation Guidelines:`);
      for (const guideline of sessionContext.implementationGuidelines) {
        contextParts.push(`- ${guideline}`);
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
 * Extract session context from EnhancedScanResult
 */
function extractSessionContext(scanResult: ScanResult): SessionContext | undefined {
  // Check if this is an EnhancedScanResult with aiAnalysis
  const enhanced = scanResult as EnhancedScanResult;
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
 * AI-powered spec generator with interview flow
 */
export class SpecGenerator {
  private conversation: ConversationManager;
  private phase: GeneratorPhase = 'context';
  private readonly featureName: string;
  private readonly projectRoot: string;
  private generatedSpec: string = '';
  private questionCount: number = 0;
  private readonly hasTools: { codebase: boolean; tavily: boolean; context7: boolean };
  private readonly sessionContext?: SessionContext;

  constructor(options: SpecGeneratorOptions) {
    this.featureName = options.featureName;
    this.projectRoot = options.projectRoot;

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
        displayToolUse(toolName, args);
      },
      maxToolSteps: 8,
    });

    if (options.scanResult) {
      this.conversation.setCodebaseContext(options.scanResult);
    }
  }

  /**
   * Display the current phase header
   */
  private displayHeader(): void {
    // Only show question count during interview phase (Task 5 fix)
    const questionCount = this.phase === 'interview'
      ? { current: this.questionCount, max: MAX_INTERVIEW_QUESTIONS }
      : undefined;

    displayPhaseHeader(this.featureName, this.phase, questionCount);
  }

  /**
   * Display session context at start
   */
  private displayContext(): void {
    // Build project name from package.json or directory
    const projectName = this.projectRoot.split('/').pop() || 'Project';

    displaySessionContext({
      projectName,
      entryPoints: this.sessionContext?.entryPoints,
      tools: this.hasTools,
    });
  }

  /**
   * Phase 1: Gather context from URLs/files
   */
  private async gatherContext(): Promise<void> {
    this.displayHeader();
    this.displayContext();

    console.log(simpson.yellow('Context Gathering'));
    console.log(pc.dim('Share any reference URLs or files (press Enter to skip):'));
    console.log('');

    while (true) {
      const input = await promptUser(`${simpson.brown('ref>')} `);

      if (!input) {
        break;
      }

      process.stdout.write(pc.dim('    Fetching... '));
      const result = await fetchContent(input, this.projectRoot);

      if (result.error) {
        console.log(pc.red(`Error: ${result.error}`));
      } else {
        this.conversation.addReference(result.content, result.source);
        // Show a preview of what was fetched (Task 3 fix)
        const preview = result.content.slice(0, 150).replace(/\n/g, ' ').trim();
        console.log(pc.green(`✓ Added reference from ${result.source}`));
        console.log(pc.dim(`    "${preview}..."`));
        if (result.truncated) {
          console.log(pc.dim(`    (truncated to ${result.content.length} chars)`));
        }
      }
    }

    this.phase = 'goals';
  }

  /**
   * Phase 2: Discuss goals - collect user goals
   */
  private async discussGoals(): Promise<void> {
    this.displayHeader();

    console.log(simpson.yellow('Feature Goals'));
    console.log(pc.dim('Describe what you want to build:'));
    console.log('');

    const goals = await promptUser(`${simpson.brown('goals>')} `);

    if (!goals) {
      console.log(pc.dim('No goals provided, using feature name as description.'));
      this.conversation.addToHistory({
        role: 'user',
        content: `I want to create a feature called "${this.featureName}".`,
      });
    } else {
      this.conversation.addToHistory({
        role: 'user',
        content: `I want to create a feature called "${this.featureName}". Here's what I'm thinking:\n\n${goals}`,
      });
    }

    // Phase 2a: Explore project silently (separate from interview)
    await this.exploreProject();

    // Phase 2b: Start interview with first question (separate AI turn)
    await this.startInterview();

    this.phase = 'interview';
  }

  /**
   * Phase 2a: Explore project silently
   * AI explores the codebase WITHOUT asking questions - just gathering context
   */
  private async exploreProject(): Promise<void> {
    console.log('');
    console.log(pc.dim('    Exploring project...'));

    // AI explores without asking questions - this prevents "two answers" bug
    const prompt = `Explore the codebase to understand the project structure for the feature "${this.featureName}".
Use your tools to read key files that are relevant to this feature.
DO NOT ask any questions yet - just gather information silently.
Respond with a VERY brief (1-2 sentence) summary of what you found relevant to this feature.`;

    const summary = await this.conversation.chat(prompt);

    // Show a brief summary of exploration
    const shortSummary = summary.slice(0, 120).replace(/\n/g, ' ');
    console.log(pc.dim(`    Context: ${shortSummary}${summary.length > 120 ? '...' : ''}`));
  }

  /**
   * Phase 2b: Start interview - acknowledge goals and ask FIRST question
   * This is a SEPARATE AI turn from exploration to prevent "two answers" bug
   */
  private async startInterview(): Promise<void> {
    console.log('');

    // Now ask the first question - this is a separate turn
    const prompt = `Based on what you learned about the project, briefly acknowledge the user's goals for "${this.featureName}" and ask your FIRST clarifying question.
Ask only ONE question. Be concise.`;

    const response = await this.conversation.chat(prompt);

    console.log(simpson.blue('AI:'), response);
    console.log('');

    // questionCount stays at 0 - it represents completed Q&A cycles
    // Will be incremented in processAnswer() after user responds
  }

  /**
   * Phase 3: Conduct interview
   */
  private async conductInterview(): Promise<void> {
    this.displayHeader();

    console.log(simpson.yellow('Interview'));
    console.log(pc.dim('Answer the questions (type "done" when ready to generate spec):'));
    console.log('');

    while (this.questionCount < MAX_INTERVIEW_QUESTIONS) {
      const answer = await promptUser(`${simpson.brown('you>')} `);

      // Handle exit commands
      if (answer.toLowerCase() === 'done' || answer.toLowerCase() === 'skip') {
        break;
      }

      // Handle empty input
      if (!answer) {
        console.log(pc.dim('(Press Enter again to skip, or type your answer)'));
        const confirm = await promptUser(`${simpson.brown('you>')} `);
        if (!confirm) {
          break;
        }
        // Process the confirmation as the answer
        await this.processAnswer(confirm);
        continue;
      }

      // Check for garbled input
      if (looksGarbled(answer)) {
        displayGarbledInputWarning(answer);
        continue;
      }

      // Process normal answer
      const shouldBreak = await this.processAnswer(answer);
      if (shouldBreak) break;
    }

    this.phase = 'generation';
  }

  /**
   * Process a user answer and get AI response
   */
  private async processAnswer(answer: string): Promise<boolean> {
    console.log('');
    const response = await this.conversation.chat(answer);
    console.log('');
    console.log(simpson.blue('AI:'), response);
    console.log('');

    this.questionCount++;

    // Check if AI indicates it has enough information
    // But ONLY allow this after minimum questions (Task 6 fix)
    if (this.questionCount < MIN_INTERVIEW_QUESTIONS) {
      // Force more questions - AI must ask at least MIN_INTERVIEW_QUESTIONS
      return false;
    }

    const lowerResponse = response.toLowerCase();
    if (
      lowerResponse.includes('enough information') ||
      lowerResponse.includes('ready to generate') ||
      lowerResponse.includes("let me generate") ||
      lowerResponse.includes("i'll now generate") ||
      lowerResponse.includes("i will now generate")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Phase 4: Generate spec
   */
  private async generateSpec(): Promise<string> {
    this.displayHeader();

    console.log(simpson.yellow('Generating Specification...'));
    console.log('');

    const prompt = `Based on our conversation, generate a complete feature specification for "${this.featureName}".

Use the format from your instructions. Be specific and actionable. Include:
- Clear user stories
- Detailed requirements with acceptance criteria
- Technical notes based on the project's tech stack
- Specific acceptance criteria that can be tested

Today's date is ${new Date().toISOString().split('T')[0]}.`;

    const stream = this.conversation.chatStream(prompt);
    this.generatedSpec = await displayStream(stream);

    this.phase = 'complete';
    return this.generatedSpec;
  }

  /**
   * Run the full spec generation flow
   * Returns the generated spec or null if cancelled
   */
  async run(): Promise<string | null> {
    try {
      // Phase 1: Context gathering
      await this.gatherContext();

      // Phase 2: Goals discussion
      await this.discussGoals();

      // Phase 3: Interview
      await this.conductInterview();

      // Phase 4: Generate spec
      const spec = await this.generateSpec();

      return spec;
    } catch (error) {
      // Handle user cancellation (Ctrl+C, Ctrl+D, or readline closed)
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes('readline was closed') ||
          message.includes('aborted') ||
          message.includes('cancel')
        ) {
          console.log('');
          console.log(pc.dim('Spec generation cancelled.'));
          return null;
        }
      }
      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Get the generated spec
   */
  getSpec(): string {
    return this.generatedSpec;
  }

  /**
   * Get current phase
   */
  getPhase(): GeneratorPhase {
    return this.phase;
  }
}
