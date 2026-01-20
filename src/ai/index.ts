/**
 * AI Module
 * Main export for AI-enhanced analysis functionality
 */

// Provider configuration
export {
  type AIProvider,
  type ProviderConfig,
  getModel,
  hasApiKey,
  getAvailableProvider,
  getApiKeyEnvVar,
} from './providers.js';

// Analysis prompts
export {
  formatStackForPrompt,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_AGENTIC,
  createAnalysisPrompt,
  createValidationPrompt,
  createRecommendationsPrompt,
} from './prompts.js';

// Tools for agentic exploration
export {
  createExplorationTools,
  RIPGREP_SKILL,
} from './tools.js';

// AI enhancer
export {
  type ProjectContext,
  type DetectedCommands,
  type McpRecommendations,
  type AIAnalysisResult,
  type EnhancedScanResult,
  type EnhancerOptions,
  AIEnhancer,
  enhanceWithAI,
  formatAIAnalysis,
} from './enhancer.js';
