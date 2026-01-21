/**
 * Agent Types and Interfaces
 * Defines the structure for multi-agent analysis
 *
 * Architecture: Orchestrator-Worker + Evaluator-Optimizer
 * Phase 1: Planning Orchestrator (creates analysis plan)
 * Phase 2: Parallel Workers (context enricher + tech researchers)
 * Phase 3: Synthesis (merge results + MCP detection)
 * Phase 4: Evaluator-Optimizer (QA loop)
 */

import type { ScanResult, DetectedStack } from '../../scanner/types.js';

// ============================================================
// Phase 1: Planning Orchestrator Types
// ============================================================

/**
 * Analysis plan created by the Planning Orchestrator
 * Guides the parallel workers in Phase 2
 */
export interface AnalysisPlan {
  /** Key areas to explore in the codebase */
  areasToExplore: string[];
  /** Technologies to research in depth */
  technologiesToResearch: string[];
  /** Specific questions that need answers for implementation guidance */
  questionsToAnswer: string[];
  /** Estimated complexity of the project */
  estimatedComplexity: 'low' | 'medium' | 'high';
}

// ============================================================
// Phase 2: Worker Types
// ============================================================

/**
 * Enriched context from codebase exploration
 * Output from the Context Enricher worker
 */
export interface EnrichedContext {
  /** Key entry point files */
  entryPoints: string[];
  /** Important directories and their purposes */
  keyDirectories: Record<string, string>;
  /** Naming conventions used */
  namingConventions: string;
  /** Detected commands from package.json */
  commands: Record<string, string>;
  /** Answers to the orchestrator's questions */
  answeredQuestions: Record<string, string>;
  /** The primary project type detected */
  projectType: string;
}

/**
 * Research result for a single technology
 * Output from a Tech Researcher worker
 */
export interface TechResearchResult {
  /** Technology that was researched */
  technology: string;
  /** Best practices for this technology */
  bestPractices: string[];
  /** Anti-patterns to avoid */
  antiPatterns: string[];
  /** Testing tips and tools */
  testingTips: string[];
  /** Documentation hints and links */
  documentationHints: string[];
  /** Whether research used tools or knowledge only */
  researchMode: 'full' | 'web-only' | 'docs-only' | 'knowledge-only';
}

// ============================================================
// Phase 3: Synthesis Types
// ============================================================

/**
 * MCP servers focused on ralph loop essentials
 */
export interface RalphMcpServers {
  /** Database MCP server if applicable */
  database?: string;
  /** E2E testing MCP (always playwright for ralph) */
  e2eTesting: string;
  /** Any additional recommended MCPs */
  additional: string[];
}

// ============================================================
// Phase 4: Evaluator-Optimizer Types
// ============================================================

/**
 * Evaluation result from the QA evaluator
 */
export interface EvaluationResult {
  /** Quality score from 1-10 */
  qualityScore: number;
  /** Whether entry points were identified */
  hasEntryPoints: boolean;
  /** Whether implementation guidelines were provided */
  hasImplementationGuidelines: boolean;
  /** Whether relevant MCP servers were recommended */
  hasRelevantMcpServers: boolean;
  /** Specific issues found */
  specificIssues: string[];
  /** Suggestions for improvement */
  improvementSuggestions: string[];
}

// ============================================================
// Legacy Types (kept for backward compatibility)
// ============================================================

/**
 * Codebase analysis result from the Codebase Analyst agent
 * @deprecated Use EnrichedContext for new code
 */
export interface CodebaseAnalysis {
  /** Project structure and context */
  projectContext: {
    /** Key entry point files */
    entryPoints: string[];
    /** Important directories and their purposes */
    keyDirectories: Record<string, string>;
    /** Naming conventions used */
    namingConventions?: string;
    /** The primary project type (MCP Server, REST API, React SPA, CLI, Library) */
    projectType: string;
  };
  /** Detected commands from package.json */
  commands: {
    test?: string;
    lint?: string;
    typecheck?: string;
    build?: string;
    dev?: string;
    format?: string;
  };
  /** Short, actionable implementation guidelines */
  implementationGuidelines: string[];
  /** Additional technologies that may have been missed */
  possibleMissedTechnologies?: string[];
}

/**
 * Stack research result from the Stack Researcher agent
 */
export interface StackResearch {
  /** Best practices for the detected stack */
  bestPractices: string[];
  /** Anti-patterns to avoid */
  antiPatterns: string[];
  /** Technology-specific testing tools */
  testingTools: string[];
  /** Technology-specific debugging tools */
  debuggingTools: string[];
  /** Technology-specific validation tools (linting, type checking) */
  validationTools: string[];
  /** Documentation hints and links */
  documentationHints: string[];
  /** Whether research was performed with tools or knowledge-only */
  researchMode: 'full' | 'web-only' | 'docs-only' | 'knowledge-only';
}

/**
 * MCP server recommendations
 */
export interface McpRecommendations {
  /** Essential MCP servers for this stack */
  essential: string[];
  /** Recommended but optional MCP servers */
  recommended: string[];
}

/**
 * Combined result from all agents
 */
export interface MultiAgentAnalysis {
  /** Codebase analysis from the Codebase Analyst */
  codebaseAnalysis: CodebaseAnalysis;
  /** Stack research from the Stack Researcher */
  stackResearch: StackResearch;
  /** MCP server recommendations (merged from both agents) */
  mcpServers: McpRecommendations;
}

/**
 * Agent capabilities based on available API keys
 */
export interface AgentCapabilities {
  /** Tavily web search available */
  hasTavily: boolean;
  /** Context7 documentation lookup available */
  hasContext7: boolean;
}

/**
 * Callback for reporting progress during multi-agent analysis
 */
export type ProgressCallback = (phase: string, detail?: string) => void;

/**
 * Options for running agents
 */
export interface AgentOptions {
  /** Tavily API key (optional) */
  tavilyApiKey?: string;
  /** Context7 API key (optional) */
  context7ApiKey?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Progress callback for phase updates */
  onProgress?: ProgressCallback;
}

/**
 * Input for the Codebase Analyst agent
 */
export interface CodebaseAnalystInput {
  /** The scan result from the scanner */
  scanResult: ScanResult;
  /** Project root directory */
  projectRoot: string;
}

/**
 * Input for the Stack Researcher agent
 */
export interface StackResearcherInput {
  /** The detected stack */
  stack: DetectedStack;
  /** The identified project type */
  projectType: string;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
}

/**
 * Input for the Orchestrator agent
 * @deprecated Use new agent architecture
 */
export interface OrchestratorInput {
  /** Codebase analysis result */
  codebaseAnalysis: CodebaseAnalysis;
  /** Stack research result */
  stackResearch: StackResearch;
  /** The detected stack */
  stack: DetectedStack;
}

// ============================================================
// New Agent Input Types
// ============================================================

/**
 * Input for the Context Enricher worker
 */
export interface ContextEnricherInput {
  /** The scan result from the scanner */
  scanResult: ScanResult;
  /** Areas to explore from the analysis plan */
  areasToExplore: string[];
  /** Questions to answer from the analysis plan */
  questionsToAnswer: string[];
}

/**
 * Input for a Tech Researcher worker
 */
export interface TechResearcherInput {
  /** Technology to research */
  technology: string;
  /** Agent capabilities (determines which tools are available) */
  capabilities: AgentCapabilities;
}

/**
 * Input for the Synthesis agent
 */
export interface SynthesisInput {
  /** Enriched context from codebase exploration */
  enrichedContext: EnrichedContext;
  /** Research results for each technology */
  techResearch: TechResearchResult[];
  /** Detected MCP servers */
  mcpServers: RalphMcpServers;
  /** The original analysis plan */
  plan: AnalysisPlan;
  /** The detected stack from scanner */
  stack: DetectedStack;
}
