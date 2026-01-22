/**
 * Conversation Manager
 * Manages multi-turn AI conversations for spec generation
 */

import { generateText, streamText } from 'ai';
import { getModel, isReasoningModel, type AIProvider } from '../providers.js';
import type { ScanResult } from '../../scanner/types.js';

/**
 * Message type for AI SDK
 */
type AIMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  codebaseSummary?: string;
  references: Array<{ source: string; content: string }>;
}

/**
 * Conversation manager options
 */
export interface ConversationManagerOptions {
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
}

/**
 * Format scan result into a concise codebase summary
 */
function formatCodebaseSummary(scanResult: ScanResult): string {
  const { stack } = scanResult;

  const parts: string[] = [];

  if (stack.framework) {
    parts.push(`Framework: ${stack.framework.name}${stack.framework.version ? ` v${stack.framework.version}` : ''}`);
  }

  if (stack.testing?.unit) {
    parts.push(`Unit Testing: ${stack.testing.unit.name}`);
  }

  if (stack.testing?.e2e) {
    parts.push(`E2E Testing: ${stack.testing.e2e.name}`);
  }

  if (stack.styling) {
    parts.push(`Styling: ${stack.styling.name}`);
  }

  if (stack.packageManager) {
    parts.push(`Package Manager: ${stack.packageManager.name}`);
  }

  return parts.join('\n');
}

/**
 * Manages a multi-turn conversation with an AI model
 */
export class ConversationManager {
  private messages: ConversationMessage[] = [];
  private context: ConversationContext = { references: [] };
  private readonly provider: AIProvider;
  private readonly modelId: string;
  private readonly systemPrompt: string;

  constructor(options: ConversationManagerOptions) {
    this.provider = options.provider;
    this.modelId = options.model;
    this.systemPrompt = options.systemPrompt || this.getDefaultSystemPrompt();
  }

  private getDefaultSystemPrompt(): string {
    return `You are a helpful assistant that helps developers create feature specifications.
You ask clarifying questions to understand the user's requirements and then help generate a detailed specification.
Be concise but thorough. Focus on understanding the user's needs before proposing solutions.`;
  }

  /**
   * Set codebase context from scan result
   */
  setCodebaseContext(scanResult: ScanResult): void {
    this.context.codebaseSummary = formatCodebaseSummary(scanResult);
  }

  /**
   * Add a reference document to the context
   */
  addReference(content: string, source: string): void {
    this.context.references.push({ source, content });
  }

  /**
   * Clear all references
   */
  clearReferences(): void {
    this.context.references = [];
  }

  /**
   * Get the current context as a string for inclusion in prompts
   */
  private getContextString(): string {
    const parts: string[] = [];

    if (this.context.codebaseSummary) {
      parts.push(`## Project Tech Stack\n${this.context.codebaseSummary}`);
    }

    if (this.context.references.length > 0) {
      parts.push('## Reference Documents');
      for (const ref of this.context.references) {
        parts.push(`### ${ref.source}\n${ref.content}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Build the full message array for the AI
   */
  private buildMessages(): AIMessage[] {
    const contextString = this.getContextString();
    const fullSystemPrompt = contextString
      ? `${this.systemPrompt}\n\n${contextString}`
      : this.systemPrompt;

    const aiMessages: AIMessage[] = [
      { role: 'system', content: fullSystemPrompt },
    ];

    for (const msg of this.messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    return aiMessages;
  }

  /**
   * Send a message and get a response
   */
  async chat(userMessage: string): Promise<string> {
    // Add user message to history
    this.messages.push({ role: 'user', content: userMessage });

    const { model } = getModel(this.provider, this.modelId);
    const messages = this.buildMessages();

    const result = await generateText({
      model,
      messages,
      ...(isReasoningModel(this.modelId) ? {} : { temperature: 0.7 }),
    });

    const assistantMessage = result.text;

    // Add assistant response to history
    this.messages.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  }

  /**
   * Send a message and stream the response
   */
  async *chatStream(userMessage: string): AsyncIterable<string> {
    // Add user message to history
    this.messages.push({ role: 'user', content: userMessage });

    const { model } = getModel(this.provider, this.modelId);
    const messages = this.buildMessages();

    const result = streamText({
      model,
      messages,
      ...(isReasoningModel(this.modelId) ? {} : { temperature: 0.7 }),
    });

    let fullResponse = '';

    for await (const textPart of result.textStream) {
      fullResponse += textPart;
      yield textPart;
    }

    // Add assistant response to history
    this.messages.push({ role: 'assistant', content: fullResponse });
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Add a message to history without sending to AI
   */
  addToHistory(message: ConversationMessage): void {
    this.messages.push(message);
  }
}
