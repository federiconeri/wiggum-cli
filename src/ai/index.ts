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
  createAnalysisPrompt,
  createValidationPrompt,
  createRecommendationsPrompt,
} from './prompts.js';

// AI enhancer
export {
  type FrameworkInsights,
  type ArchitecturalPattern,
  type CodingConvention,
  type McpRecommendation,
  type AdditionalDetections,
  type AIAnalysisResult,
  type EnhancedScanResult,
  type EnhancerOptions,
  AIEnhancer,
  enhanceWithAI,
  formatAIAnalysis,
} from './enhancer.js';
