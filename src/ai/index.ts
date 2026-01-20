/**
 * AI Module
 * Main export for AI-enhanced analysis functionality
 */

// Provider configuration
export {
  type AIProvider,
  type ProviderConfig,
  type OptionalService,
  getModel,
  hasApiKey,
  getAvailableProvider,
  getApiKeyEnvVar,
  OPTIONAL_SERVICE_ENV_VARS,
  hasTavilyKey,
  getTavilyKey,
  hasContext7Key,
  getContext7Key,
  getOptionalServicesStatus,
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

// New tools (Tavily, Context7)
export {
  createTavilySearchTool,
  canUseTavily,
  createContext7Tool,
  canUseContext7,
} from './tools/index.js';

// Agents
export {
  runMultiAgentAnalysis,
  runCodebaseAnalyst,
  runStackResearcher,
  runOrchestrator,
  mergeAgentResults,
  type CodebaseAnalysis,
  type StackResearch,
  type McpRecommendations,
  type MultiAgentAnalysis,
  type AgentCapabilities,
  type AgentOptions,
} from './agents/index.js';

// AI enhancer
export {
  type ProjectContext,
  type DetectedCommands,
  type McpRecommendations as McpRecommendationsLegacy,
  type AIAnalysisResult,
  type EnhancedScanResult,
  type EnhancerOptions,
  AIEnhancer,
  enhanceWithAI,
  formatAIAnalysis,
} from './enhancer.js';
