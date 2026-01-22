/**
 * Spec Generator
 * AI-powered feature specification generator with interview flow
 */

import readline from 'node:readline';
import pc from 'picocolors';
import { ConversationManager } from './conversation-manager.js';
import { fetchContent, isUrl, type FetchedContent } from './url-fetcher.js';
import type { AIProvider } from '../providers.js';
import type { ScanResult } from '../../scanner/types.js';
import { simpson } from '../../utils/colors.js';

/** Maximum number of interview questions before auto-completing */
const MAX_INTERVIEW_QUESTIONS = 10;

/**
 * Spec generator options
 */
export interface SpecGeneratorOptions {
  featureName: string;
  projectRoot: string;
  provider: AIProvider;
  model: string;
  scanResult?: ScanResult;
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
 * Display streaming text
 */
async function displayStream(stream: AsyncIterable<string>): Promise<string> {
  let fullText = '';
  for await (const chunk of stream) {
    process.stdout.write(chunk);
    fullText += chunk;
  }
  console.log(''); // New line after stream
  return fullText;
}

const SPEC_SYSTEM_PROMPT = `You are an expert product manager and technical writer helping to create detailed feature specifications.

Your role is to:
1. Understand the user's feature goals through targeted questions
2. Identify edge cases and potential issues
3. Generate a comprehensive, actionable specification

When interviewing:
- Ask one focused question at a time
- Acknowledge answers before asking the next question
- Stop asking when you have enough information (usually 3-5 questions)
- Say "I have enough information to generate the spec" when ready

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
- Items explicitly not included
`;

/**
 * AI-powered spec generator with interview flow
 */
export class SpecGenerator {
  private conversation: ConversationManager;
  private phase: GeneratorPhase = 'context';
  private readonly featureName: string;
  private readonly projectRoot: string;
  private generatedSpec: string = '';

  constructor(options: SpecGeneratorOptions) {
    this.featureName = options.featureName;
    this.projectRoot = options.projectRoot;

    this.conversation = new ConversationManager({
      provider: options.provider,
      model: options.model,
      systemPrompt: SPEC_SYSTEM_PROMPT,
    });

    if (options.scanResult) {
      this.conversation.setCodebaseContext(options.scanResult);
    }
  }

  /**
   * Phase 1: Gather context from URLs/files
   */
  private async gatherContext(): Promise<void> {
    console.log('');
    console.log(simpson.yellow('Context Gathering'));
    console.log(pc.dim('Share any reference URLs or files (press Enter to skip):'));
    console.log('');

    while (true) {
      const input = await promptUser(`${simpson.brown('ref>')} `);

      if (!input) {
        break;
      }

      process.stdout.write(pc.dim('Fetching... '));
      const result = await fetchContent(input, this.projectRoot);

      if (result.error) {
        console.log(pc.red(`Error: ${result.error}`));
      } else {
        this.conversation.addReference(result.content, result.source);
        console.log(pc.green(`Added reference from ${result.source}${result.truncated ? ' (truncated)' : ''}`));
      }
    }

    this.phase = 'goals';
  }

  /**
   * Phase 2: Discuss goals
   */
  private async discussGoals(): Promise<void> {
    console.log('');
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

    console.log('');
    const response = await this.conversation.chat(
      `The user wants to create a feature called "${this.featureName}". Acknowledge their goals and ask your first clarifying question to better understand the requirements.`
    );

    console.log(simpson.blue('AI:'), response);
    console.log('');

    this.phase = 'interview';
  }

  /**
   * Phase 3: Conduct interview
   */
  private async conductInterview(): Promise<void> {
    console.log(simpson.yellow('Interview'));
    console.log(pc.dim('Answer the questions (type "done" when ready to generate spec):'));
    console.log('');

    let questionCount = 0;

    while (questionCount < MAX_INTERVIEW_QUESTIONS) {
      const answer = await promptUser(`${simpson.brown('you>')} `);

      if (answer.toLowerCase() === 'done' || answer.toLowerCase() === 'skip') {
        break;
      }

      if (!answer) {
        console.log(pc.dim('(Press Enter again to skip, or type your answer)'));
        const confirm = await promptUser(`${simpson.brown('you>')} `);
        if (!confirm) {
          break;
        }
        // Process the confirmation as the answer
        console.log('');
        const response = await this.conversation.chat(confirm);
        console.log(simpson.blue('AI:'), response);
        console.log('');
      } else {
        console.log('');
        const response = await this.conversation.chat(answer);
        console.log(simpson.blue('AI:'), response);
        console.log('');

        // Check if AI indicates it has enough information
        if (
          response.toLowerCase().includes('enough information') ||
          response.toLowerCase().includes('ready to generate') ||
          response.toLowerCase().includes("let me generate") ||
          response.toLowerCase().includes("i'll now generate")
        ) {
          break;
        }
      }

      questionCount++;
    }

    this.phase = 'generation';
  }

  /**
   * Phase 4: Generate spec
   */
  private async generateSpec(): Promise<string> {
    console.log('');
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
