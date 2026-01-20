/**
 * Agent Types and Interfaces
 * Defines the structure for multi-agent analysis
 */

import type { ScanResult, DetectedStack } from '../../scanner/types.js';

/**
 * Codebase analysis result from the Codebase Analyst agent
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
 * Options for running agents
 */
export interface AgentOptions {
  /** Tavily API key (optional) */
  tavilyApiKey?: string;
  /** Context7 API key (optional) */
  context7ApiKey?: string;
  /** Enable verbose logging */
  verbose?: boolean;
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
 */
export interface OrchestratorInput {
  /** Codebase analysis result */
  codebaseAnalysis: CodebaseAnalysis;
  /** Stack research result */
  stackResearch: StackResearch;
  /** The detected stack */
  stack: DetectedStack;
}
