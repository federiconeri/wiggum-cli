/**
 * Conversation Module
 * AI-powered conversation and spec generation
 */

export {
  ConversationManager,
  type ConversationMessage,
  type ConversationContext,
  type ConversationManagerOptions,
} from './conversation-manager.js';

export {
  SpecGenerator,
  type SpecGeneratorOptions,
} from './spec-generator.js';

export {
  fetchContent,
  fetchMultipleSources,
  isUrl,
  type FetchedContent,
} from './url-fetcher.js';
