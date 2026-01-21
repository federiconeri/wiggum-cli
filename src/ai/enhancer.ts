/**
 * AI Enhancer Module
 * Uses AI to analyze the codebase for deeper insights
 */

import { stepCountIs } from 'ai';
import type { ScanResult, DetectedStack, DetectionResult } from '../scanner/types.js';
import { getModel, type AIProvider, hasApiKey, getApiKeyEnvVar, isReasoningModel } from './providers.js';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_AGENTIC, createAnalysisPrompt } from './prompts.js';
import { createExplorationTools } from './tools.js';
import { runMultiAgentAnalysis, type MultiAgentAnalysis, type ProgressCallback } from './agents/index.js';
import { logger } from '../utils/logger.js';
import { parseJsonSafe } from '../utils/json-repair.js';
import { getTracedAI, traced } from '../utils/tracing.js';

/**
 * Project context from AI analysis - key structure information
 */
export interface ProjectContext {
  /** Key entry point files */
  entryPoints?: string[];
  /** Important directories and their purposes */
  keyDirectories?: Record<string, string>;
  /** Naming conventions used in the project */
  namingConventions?: string;
}

/**
 * Detected commands from package.json scripts or common patterns
 */
export interface DetectedCommands {
  test?: string;
  lint?: string;
  typecheck?: string;
  build?: string;
  dev?: string;
  format?: string;
}

/**
 * MCP server recommendations (categorized)
 */
export interface McpRecommendations {
  /** Essential MCP servers for this stack */
  essential?: string[];
  /** Recommended but optional MCP servers */
  recommended?: string[];
}

/**
 * Technology-specific testing and debugging tools
 */
export interface TechnologyTools {
  /** Testing commands specific to the detected technologies */
  testing?: string[];
  /** Debugging/inspection tools for the stack */
  debugging?: string[];
  /** Linting/validation tools beyond the standard ones */
  validation?: string[];
}

/**
 * Technology-specific best practices
 */
export interface TechnologyPractices {
  /** The primary project type (e.g., "MCP Server", "REST API", "React SPA") */
  projectType?: string;
  /** Practices specific to the detected technologies */
  practices?: string[];
  /** Anti-patterns to avoid for this stack */
  antiPatterns?: string[];
  /** Links to relevant documentation (optional) */
  documentationHints?: string[];
}

/**
 * AI analysis result - focused on actionable outputs
 */
export interface AIAnalysisResult {
  /** Project structure and context */
  projectContext?: ProjectContext;
  /** Detected commands from package.json */
  commands?: DetectedCommands;
  /** Short, actionable implementation guidelines */
  implementationGuidelines?: string[];
  /** MCP server recommendations */
  mcpServers?: McpRecommendations;
  /** Additional technologies that may have been missed */
  possibleMissedTechnologies?: string[];
  /** Technology-specific tools for testing/debugging */
  technologyTools?: TechnologyTools;
  /** Technology-specific best practices based on detected stack */
  technologyPractices?: TechnologyPractices;
}

/**
 * Enhanced scan result with AI insights
 */
export interface EnhancedScanResult extends ScanResult {
  aiAnalysis?: AIAnalysisResult;
  aiEnhanced: boolean;
  aiProvider?: AIProvider;
  aiError?: string;
}

/**
 * Options for the AI enhancer
 */
export interface EnhancerOptions {
  provider?: AIProvider;
  model?: string;
  verbose?: boolean;
  /** Use agentic mode with tools for deeper codebase exploration */
  agentic?: boolean;
  /** Tavily API key for web search (optional) */
  tavilyApiKey?: string;
  /** Context7 API key for documentation lookup (optional) */
  context7ApiKey?: string;
  /** Progress callback for phase updates */
  onProgress?: ProgressCallback;
}

/**
 * Parse AI response JSON safely
 */
function parseAIResponse(text: string, verbose: boolean = false): AIAnalysisResult | null {
  if (!text || text.trim() === '') {
    if (verbose) {
      logger.warn('AI response text is empty');
    }
    return null;
  }

  // Use safe JSON parser with repair capabilities
  const result = parseJsonSafe<AIAnalysisResult>(text);

  if (!result) {
    if (verbose) {
      logger.warn('Failed to parse AI response as JSON');
      logger.warn(`Response preview: ${text.substring(0, 500)}...`);
    }
    return null;
  }

  // Validate that we got the expected structure
  if (typeof result !== 'object') {
    if (verbose) {
      logger.warn('AI response parsed but is not an object');
    }
    return null;
  }

  return result;
}

/**
 * Apply AI insights to enhance the detected stack
 */
function applyEnhancements(
  stack: DetectedStack,
  analysis: AIAnalysisResult
): DetectedStack {
  const enhanced = { ...stack };

  // Enhance MCP recommendations from AI analysis
  if (analysis.mcpServers) {
    const aiRecommended = [
      ...(analysis.mcpServers.essential || []),
      ...(analysis.mcpServers.recommended || []),
    ];

    if (aiRecommended.length > 0) {
      enhanced.mcp = {
        ...enhanced.mcp,
        recommended: [
          ...(enhanced.mcp?.recommended || []),
          ...aiRecommended.filter(r => !enhanced.mcp?.recommended?.includes(r)),
        ],
      };
    }
  }

  return enhanced;
}

/**
 * AI Enhancer class
 * Provides AI-powered analysis to enhance scan results
 */
export class AIEnhancer {
  private provider: AIProvider;
  private model?: string;
  private verbose: boolean;
  private agentic: boolean;
  private tavilyApiKey?: string;
  private context7ApiKey?: string;
  private onProgress?: ProgressCallback;

  constructor(options: EnhancerOptions = {}) {
    this.provider = options.provider || 'anthropic';
    this.model = options.model;
    this.verbose = options.verbose || false;
    this.agentic = options.agentic || false;
    this.tavilyApiKey = options.tavilyApiKey;
    this.context7ApiKey = options.context7ApiKey;
    this.onProgress = options.onProgress;
  }

  /**
   * Check if AI enhancement is available
   */
  isAvailable(): boolean {
    return hasApiKey(this.provider);
  }

  /**
   * Get the required environment variable for the current provider
   */
  getRequiredEnvVar(): string {
    return getApiKeyEnvVar(this.provider);
  }

  /**
   * Enhance scan results with AI analysis
   */
  async enhance(scanResult: ScanResult): Promise<EnhancedScanResult> {
    // Check if API key is available
    if (!this.isAvailable()) {
      const envVar = this.getRequiredEnvVar();
      return {
        ...scanResult,
        aiEnhanced: false,
        aiError: `API key not found. Set ${envVar} to enable AI enhancement.`,
      };
    }

    try {
      // Get the configured model
      const { model, provider, modelId } = getModel(this.provider, this.model);

      if (this.verbose) {
        logger.info(`Using AI provider: ${provider} (${modelId})`);
        if (this.agentic) {
          logger.info('Agentic mode enabled - AI will explore the codebase with tools');
        }
      }

      let analysis: AIAnalysisResult | null;

      if (this.agentic) {
        // Agentic mode: use tools to explore codebase
        analysis = await this.enhanceAgentic(model, modelId, scanResult);
      } else {
        // Simple mode: just analyze detected stack
        analysis = await this.enhanceSimple(model, modelId, scanResult);
      }

      if (!analysis) {
        return {
          ...scanResult,
          aiEnhanced: false,
          aiProvider: this.provider,
          aiError: 'Failed to parse AI analysis response',
        };
      }

      // Apply enhancements to the stack
      const enhancedStack = applyEnhancements(scanResult.stack, analysis);

      return {
        ...scanResult,
        stack: enhancedStack,
        aiAnalysis: analysis,
        aiEnhanced: true,
        aiProvider: this.provider,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`AI enhancement failed: ${errorMessage}`);

      return {
        ...scanResult,
        aiEnhanced: false,
        aiProvider: this.provider,
        aiError: errorMessage,
      };
    }
  }

  /**
   * Simple enhancement mode - analyze detected stack without tools
   */
  private async enhanceSimple(
    model: ReturnType<typeof getModel>['model'],
    modelId: string,
    scanResult: ScanResult
  ): Promise<AIAnalysisResult | null> {
    const prompt = createAnalysisPrompt(scanResult);
    const { generateText } = getTracedAI();

    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 2000,
      // Reasoning models don't support temperature
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: { phase: 'simple-analysis', projectRoot: scanResult.projectRoot },
      },
    });

    return parseAIResponse(text);
  }

  /**
   * Agentic enhancement mode - use multi-agent system to explore codebase
   */
  private async enhanceAgentic(
    model: ReturnType<typeof getModel>['model'],
    modelId: string,
    scanResult: ScanResult
  ): Promise<AIAnalysisResult | null> {
    // Use the multi-agent system for deeper analysis
    const multiAgentResult = await runMultiAgentAnalysis(
      model,
      modelId,
      scanResult,
      {
        tavilyApiKey: this.tavilyApiKey,
        context7ApiKey: this.context7ApiKey,
        verbose: this.verbose,
        onProgress: this.onProgress,
      }
    );

    if (!multiAgentResult) {
      // Fall back to simple agentic mode
      return this.enhanceLegacyAgentic(model, modelId, scanResult);
    }

    // Convert MultiAgentAnalysis to AIAnalysisResult for backward compatibility
    return convertMultiAgentToAIAnalysis(multiAgentResult);
  }

  /**
   * Legacy agentic mode (fallback when multi-agent fails)
   */
  private async enhanceLegacyAgentic(
    model: ReturnType<typeof getModel>['model'],
    modelId: string,
    scanResult: ScanResult
  ): Promise<AIAnalysisResult | null> {
    const tools = createExplorationTools(scanResult.projectRoot);
    const { generateText } = getTracedAI();

    const prompt = `Analyze this codebase and produce configuration for AI-assisted development.

Project: ${scanResult.projectRoot}

Start by exploring the codebase structure, then produce your analysis.
When done exploring, output your final analysis as valid JSON matching this structure:

{
  "projectContext": {
    "entryPoints": ["src/index.ts"],
    "keyDirectories": {"src/routes": "API routes"},
    "namingConventions": "camelCase files, PascalCase components"
  },
  "commands": {
    "test": "npm test",
    "lint": "npm run lint",
    "build": "npm run build",
    "dev": "npm run dev"
  },
  "implementationGuidelines": [
    "Run npm test after changes",
    "Use Zod for validation"
  ],
  "mcpServers": {
    "essential": ["filesystem", "git"],
    "recommended": ["docker"]
  },
  "possibleMissedTechnologies": ["Redis"]
}`;

    // Use agentic loop - AI will call tools until it has enough info
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT_AGENTIC,
      prompt,
      tools,
      stopWhen: stepCountIs(10),
      maxOutputTokens: 4000,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: { phase: 'legacy-agentic', projectRoot: scanResult.projectRoot },
      },
    });

    // Try to get text from the result
    let textToParse = result.text;

    // If text is empty, try to extract from steps
    if (!textToParse || textToParse.trim() === '') {
      if (this.verbose) {
        logger.info(`No direct text output, checking ${result.steps?.length || 0} steps...`);
      }

      const steps = result.steps || [];
      for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i];
        if (step.text && step.text.trim() !== '') {
          textToParse = step.text;
          if (this.verbose) {
            logger.info(`Found text in step ${i + 1}`);
          }
          break;
        }
      }
    }

    if (this.verbose && (!textToParse || textToParse.trim() === '')) {
      logger.warn('No text output found in response or steps');
    }

    return parseAIResponse(textToParse, this.verbose);
  }
}

/**
 * Convert MultiAgentAnalysis to AIAnalysisResult for backward compatibility
 */
function convertMultiAgentToAIAnalysis(multiAgent: MultiAgentAnalysis): AIAnalysisResult {
  const { codebaseAnalysis, stackResearch, mcpServers } = multiAgent;

  return {
    projectContext: {
      entryPoints: codebaseAnalysis.projectContext.entryPoints,
      keyDirectories: codebaseAnalysis.projectContext.keyDirectories,
      namingConventions: codebaseAnalysis.projectContext.namingConventions,
    },
    commands: codebaseAnalysis.commands,
    implementationGuidelines: codebaseAnalysis.implementationGuidelines,
    mcpServers: {
      essential: mcpServers.essential,
      recommended: mcpServers.recommended,
    },
    possibleMissedTechnologies: codebaseAnalysis.possibleMissedTechnologies,
    technologyTools: {
      testing: stackResearch.testingTools,
      debugging: stackResearch.debuggingTools,
      validation: [],
    },
    technologyPractices: {
      projectType: codebaseAnalysis.projectContext.projectType,
      practices: stackResearch.bestPractices,
      antiPatterns: stackResearch.antiPatterns,
      documentationHints: stackResearch.documentationHints,
    },
  };
}

/**
 * Convenience function to enhance scan results with AI
 */
export async function enhanceWithAI(
  scanResult: ScanResult,
  options?: EnhancerOptions
): Promise<EnhancedScanResult> {
  const enhancer = new AIEnhancer(options);
  return enhancer.enhance(scanResult);
}

/**
 * Format AI analysis result for display
 */
export function formatAIAnalysis(analysis: AIAnalysisResult): string {
  const lines: string[] = [];

  // Project context
  if (analysis.projectContext) {
    const ctx = analysis.projectContext;

    // Entry points with quality indicator
    if (ctx.entryPoints && ctx.entryPoints.length > 0) {
      lines.push('Entry Points:');
      for (const entry of ctx.entryPoints) {
        lines.push(`  ${entry}`);
      }
      lines.push('');
    } else {
      lines.push('Entry Points: (not discovered - check package.json manually)');
      lines.push('');
    }

    // Key directories with quality indicator
    if (ctx.keyDirectories && Object.keys(ctx.keyDirectories).length > 0) {
      lines.push('Key Directories:');
      for (const [dir, purpose] of Object.entries(ctx.keyDirectories)) {
        lines.push(`  ${dir} → ${purpose}`);
      }
      lines.push('');
    } else {
      lines.push('Key Directories: (not discovered - explore src/ manually)');
      lines.push('');
    }

    if (ctx.namingConventions && ctx.namingConventions !== 'unknown') {
      lines.push(`Naming: ${ctx.namingConventions}`);
      lines.push('');
    }
  }

  // Detected commands
  if (analysis.commands) {
    const cmds = analysis.commands;
    const cmdList = Object.entries(cmds).filter(([_, v]) => v);

    if (cmdList.length > 0) {
      lines.push('Commands:');
      for (const [name, cmd] of cmdList) {
        lines.push(`  ${name}: ${cmd}`);
      }
      lines.push('');
    }
  }

  // Implementation guidelines (the most important part)
  if (analysis.implementationGuidelines && analysis.implementationGuidelines.length > 0) {
    lines.push('Implementation Guidelines:');
    for (const guideline of analysis.implementationGuidelines) {
      lines.push(`  • ${guideline}`);
    }
    lines.push('');
  }

  // MCP servers
  if (analysis.mcpServers) {
    if (analysis.mcpServers.essential && analysis.mcpServers.essential.length > 0) {
      lines.push(`MCP (essential): ${analysis.mcpServers.essential.join(', ')}`);
    }
    if (analysis.mcpServers.recommended && analysis.mcpServers.recommended.length > 0) {
      lines.push(`MCP (optional): ${analysis.mcpServers.recommended.join(', ')}`);
    }
    if (analysis.mcpServers.essential?.length || analysis.mcpServers.recommended?.length) {
      lines.push('');
    }
  }

  // Possibly missed technologies (brief)
  if (analysis.possibleMissedTechnologies && analysis.possibleMissedTechnologies.length > 0) {
    lines.push(`May also use: ${analysis.possibleMissedTechnologies.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}
