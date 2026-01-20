/**
 * AI Enhancer Module
 * Uses AI to analyze the codebase for deeper insights
 */

import { generateText, stepCountIs } from 'ai';
import type { ScanResult, DetectedStack, DetectionResult } from '../scanner/types.js';
import { getModel, type AIProvider, hasApiKey, getApiKeyEnvVar, isReasoningModel } from './providers.js';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_AGENTIC, createAnalysisPrompt } from './prompts.js';
import { createExplorationTools } from './tools.js';
import { logger } from '../utils/logger.js';

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

  try {
    // Try to extract JSON from the response
    // The AI might wrap it in markdown code blocks
    let jsonText = text;

    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // Try to find JSON object - use greedy match for the outermost braces
    // This handles cases where there's text before/after the JSON
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonText = objectMatch[0];
    }

    // Try to parse JSON
    const result = JSON.parse(jsonText) as AIAnalysisResult;

    // Validate that we got the expected structure
    if (!result || typeof result !== 'object') {
      if (verbose) {
        logger.warn('AI response parsed but is not an object');
      }
      return null;
    }

    return result;
  } catch (error) {
    if (verbose) {
      logger.warn(`Failed to parse AI response as JSON: ${error instanceof Error ? error.message : String(error)}`);
      // Log first 500 chars of response for debugging
      logger.warn(`Response preview: ${text.substring(0, 500)}...`);
    } else {
      logger.warn('Failed to parse AI response as JSON');
    }
    return null;
  }
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

  constructor(options: EnhancerOptions = {}) {
    this.provider = options.provider || 'anthropic';
    this.model = options.model;
    this.verbose = options.verbose || false;
    this.agentic = options.agentic || false;
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

    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 2000,
      // Reasoning models don't support temperature
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
    });

    return parseAIResponse(text);
  }

  /**
   * Agentic enhancement mode - use tools to explore codebase
   */
  private async enhanceAgentic(
    model: ReturnType<typeof getModel>['model'],
    modelId: string,
    scanResult: ScanResult
  ): Promise<AIAnalysisResult | null> {
    const tools = createExplorationTools(scanResult.projectRoot);

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
    // stopWhen: stepCountIs(10) allows up to 10 tool-calling steps
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT_AGENTIC,
      prompt,
      tools,
      stopWhen: stepCountIs(10),
      maxOutputTokens: 4000,
      // Reasoning models don't support temperature
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
    });

    // Try to get text from the result
    let textToParse = result.text;

    // If text is empty, try to extract from steps
    if (!textToParse || textToParse.trim() === '') {
      if (this.verbose) {
        logger.info(`No direct text output, checking ${result.steps?.length || 0} steps...`);
      }

      // Look through steps for text content (from last to first)
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

    if (ctx.entryPoints && ctx.entryPoints.length > 0) {
      lines.push('Entry Points:');
      for (const entry of ctx.entryPoints) {
        lines.push(`  ${entry}`);
      }
      lines.push('');
    }

    if (ctx.keyDirectories && Object.keys(ctx.keyDirectories).length > 0) {
      lines.push('Key Directories:');
      for (const [dir, purpose] of Object.entries(ctx.keyDirectories)) {
        lines.push(`  ${dir} → ${purpose}`);
      }
      lines.push('');
    }

    if (ctx.namingConventions) {
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
