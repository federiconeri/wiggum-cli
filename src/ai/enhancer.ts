/**
 * AI Enhancer Module
 * Uses AI to analyze the codebase for deeper insights
 */

import { generateText } from 'ai';
import type { ScanResult, DetectedStack, DetectionResult } from '../scanner/types.js';
import { getModel, type AIProvider, hasApiKey, getApiKeyEnvVar } from './providers.js';
import { SYSTEM_PROMPT, createAnalysisPrompt } from './prompts.js';
import { logger } from '../utils/logger.js';

/**
 * Framework insights from AI analysis
 */
export interface FrameworkInsights {
  variant?: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

/**
 * Architectural pattern detected by AI
 */
export interface ArchitecturalPattern {
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

/**
 * Coding convention detected by AI
 */
export interface CodingConvention {
  convention: string;
  suggestion: string;
}

/**
 * MCP server recommendation
 */
export interface McpRecommendation {
  name: string;
  reason: string;
}

/**
 * Additional detection suggestions
 */
export interface AdditionalDetections {
  possibleMissed?: string[];
  refinements?: string[];
}

/**
 * AI analysis result
 */
export interface AIAnalysisResult {
  frameworkInsights?: FrameworkInsights;
  architecturalPatterns?: ArchitecturalPattern[];
  codingConventions?: CodingConvention[];
  recommendedMcpServers?: McpRecommendation[];
  customPromptSuggestions?: string[];
  additionalDetections?: AdditionalDetections;
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
  verbose?: boolean;
}

/**
 * Parse AI response JSON safely
 */
function parseAIResponse(text: string): AIAnalysisResult | null {
  try {
    // Try to extract JSON from the response
    // The AI might wrap it in markdown code blocks
    let jsonText = text;

    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // Try to find JSON object
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonText = objectMatch[0];
    }

    return JSON.parse(jsonText) as AIAnalysisResult;
  } catch (error) {
    logger.warn('Failed to parse AI response as JSON');
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

  // Enhance framework detection with AI insights
  if (analysis.frameworkInsights && enhanced.framework) {
    // If AI detected a more specific variant with high confidence
    if (
      analysis.frameworkInsights.variant &&
      analysis.frameworkInsights.confidence === 'high'
    ) {
      enhanced.framework = {
        ...enhanced.framework,
        variant: analysis.frameworkInsights.variant,
        evidence: [
          ...enhanced.framework.evidence,
          `AI: ${analysis.frameworkInsights.notes || 'variant detected'}`,
        ],
      };
    }
  }

  // Enhance MCP recommendations
  if (analysis.recommendedMcpServers && analysis.recommendedMcpServers.length > 0) {
    const aiRecommended = analysis.recommendedMcpServers.map(r => r.name);

    enhanced.mcp = {
      ...enhanced.mcp,
      recommended: [
        ...(enhanced.mcp?.recommended || []),
        ...aiRecommended.filter(r => !enhanced.mcp?.recommended?.includes(r)),
      ],
    };
  }

  return enhanced;
}

/**
 * AI Enhancer class
 * Provides AI-powered analysis to enhance scan results
 */
export class AIEnhancer {
  private provider: AIProvider;
  private verbose: boolean;

  constructor(options: EnhancerOptions = {}) {
    this.provider = options.provider || 'anthropic';
    this.verbose = options.verbose || false;
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
      const { model, provider, modelId } = getModel(this.provider);

      if (this.verbose) {
        logger.info(`Using AI provider: ${provider} (${modelId})`);
      }

      // Create the analysis prompt
      const prompt = createAnalysisPrompt(scanResult);

      // Call the AI model
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 2000,
        temperature: 0.3, // Lower temperature for more consistent output
      });

      // Parse the response
      const analysis = parseAIResponse(text);

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

  lines.push('=== AI Analysis ===');
  lines.push('');

  // Framework insights
  if (analysis.frameworkInsights) {
    lines.push('Framework Insights:');
    if (analysis.frameworkInsights.variant) {
      lines.push(`  Variant: ${analysis.frameworkInsights.variant}`);
    }
    lines.push(`  Confidence: ${analysis.frameworkInsights.confidence}`);
    if (analysis.frameworkInsights.notes) {
      lines.push(`  Notes: ${analysis.frameworkInsights.notes}`);
    }
    lines.push('');
  }

  // Architectural patterns
  if (analysis.architecturalPatterns && analysis.architecturalPatterns.length > 0) {
    lines.push('Architectural Patterns:');
    for (const pattern of analysis.architecturalPatterns) {
      lines.push(`  - ${pattern.pattern} [${pattern.confidence}]`);
      lines.push(`    Evidence: ${pattern.evidence}`);
    }
    lines.push('');
  }

  // Coding conventions
  if (analysis.codingConventions && analysis.codingConventions.length > 0) {
    lines.push('Coding Conventions:');
    for (const convention of analysis.codingConventions) {
      lines.push(`  - ${convention.convention}`);
      lines.push(`    Suggestion: ${convention.suggestion}`);
    }
    lines.push('');
  }

  // MCP recommendations
  if (analysis.recommendedMcpServers && analysis.recommendedMcpServers.length > 0) {
    lines.push('Recommended MCP Servers:');
    for (const server of analysis.recommendedMcpServers) {
      lines.push(`  - ${server.name}`);
      lines.push(`    Reason: ${server.reason}`);
    }
    lines.push('');
  }

  // Custom prompt suggestions
  if (analysis.customPromptSuggestions && analysis.customPromptSuggestions.length > 0) {
    lines.push('Custom Prompt Suggestions:');
    for (const suggestion of analysis.customPromptSuggestions) {
      lines.push(`  - ${suggestion}`);
    }
    lines.push('');
  }

  // Additional detections
  if (analysis.additionalDetections) {
    if (
      analysis.additionalDetections.possibleMissed &&
      analysis.additionalDetections.possibleMissed.length > 0
    ) {
      lines.push('Possibly Missed Technologies:');
      for (const tech of analysis.additionalDetections.possibleMissed) {
        lines.push(`  - ${tech}`);
      }
      lines.push('');
    }

    if (
      analysis.additionalDetections.refinements &&
      analysis.additionalDetections.refinements.length > 0
    ) {
      lines.push('Detection Refinements:');
      for (const refinement of analysis.additionalDetections.refinements) {
        lines.push(`  - ${refinement}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
