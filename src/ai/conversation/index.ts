/**
 * Conversation Module
 * AI-powered conversation and spec generation
 */

export {
  ConversationManager,
  type ConversationMessage,
  type ConversationContext,
  type ConversationManagerOptions,
  type ToolUseCallback,
} from './conversation-manager.js';

export {
  SpecGenerator,
  type SpecGeneratorOptions,
  type SessionContext,
} from './spec-generator.js';

export {
  createInterviewTools,
  type InterviewTools,
} from './interview-tools.js';

export {
  fetchContent,
  fetchMultipleSources,
  isUrl,
  type FetchedContent,
} from './url-fetcher.js';
