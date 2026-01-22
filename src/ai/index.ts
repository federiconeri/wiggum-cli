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
  createContext7Tools,
  canUseContext7,
} from './tools/index.js';

// Agents - New 4-phase architecture
export {
  // Main orchestration
  runMultiAgentAnalysis,
  // Phase 1: Planning
  runPlanningOrchestrator,
  // Phase 2: Parallel workers
  runContextEnricher,
  runTechResearcher,
  runTechResearchPool,
  // Phase 3: Synthesis + MCP detection
  runSynthesisAgent,
  detectRalphMcpServers,
  convertToLegacyMcpRecommendations,
  // Phase 4: QA loop
  runEvaluatorOptimizer,
  // New types
  type AnalysisPlan,
  type EnrichedContext,
  type TechResearchResult,
  type RalphMcpServers,
  type EvaluationResult,
  // Legacy types (backward compatibility)
  type CodebaseAnalysis,
  type StackResearch,
  type McpRecommendations,
  type MultiAgentAnalysis,
  type AgentCapabilities,
  type AgentOptions,
  // Legacy agents (deprecated, kept for backward compatibility)
  runCodebaseAnalyst,
  runStackResearcher,
  runOrchestrator,
  mergeAgentResults,
} from './agents/index.js';

// AI enhancer
export {
  type ProjectContext,
  type DetectedCommands,
  type McpRecommendations as McpRecommendationsLegacy,
  type E2ETools,
  type TokenUsage,
  type AIAnalysisResult,
  type EnhancedScanResult,
  type EnhancerOptions,
  AIEnhancer,
  enhanceWithAI,
  formatAIAnalysis,
} from './enhancer.js';
