/**
 * Evaluator-Optimizer Agent (Phase 4)
 * QA loop that validates and improves the analysis result
 * Max 2 iterations to ensure quality without endless loops
 *
 * @deprecated v0.5.0 - No longer used in main pipeline.
 * Quality is now handled by fallback derivation from package.json.
 * Kept for backward compatibility and reference.
 */

import { type LanguageModel } from 'ai';
import { z } from 'zod';
import type { ScanResult } from '../../scanner/types.js';
import type { MultiAgentAnalysis, EvaluationResult } from './types.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { getTracedAI } from '../../utils/tracing.js';

/**
 * Quality threshold for passing evaluation (1-10 scale)
 * Results with score >= this value skip optimization
 */
const QUALITY_THRESHOLD = 7;

/**
 * Schema for evaluation output
 */
const evaluationSchema = z.object({
  qualityScore: z.number().min(1).max(10).describe('Overall quality score from 1-10'),
  hasEntryPoints: z.boolean().describe('Whether entry points are identified'),
  hasImplementationGuidelines: z.boolean().describe('Whether implementation guidelines are provided'),
  hasRelevantMcpServers: z.boolean().describe('Whether relevant MCP servers are recommended'),
  specificIssues: z.array(z.string()).describe('Specific issues found in the analysis'),
  improvementSuggestions: z.array(z.string()).describe('Suggestions for improving the analysis'),
});

/**
 * Schema for optimizer output
 */
const optimizerOutputSchema = z.object({
  improvedGuidelines: z.array(z.string()).describe('Improved implementation guidelines'),
  additionalEntryPoints: z.array(z.string()).describe('Additional entry points to add (empty array if none)'),
  additionalMcpServers: z.array(z.string()).describe('Additional MCP servers to recommend (empty array if none)'),
});

/**
 * Patterns that indicate an entry point is an instruction, not a real path
 */
const INVALID_ENTRY_POINT_PATTERNS = [
  /^check /i,
  /^if /i,
  /^open /i,
  /^look /i,
  /^search /i,
  /^find /i,
  /^inspect /i,
  /^run /i,
  /^see /i,
  /^review /i,
];

/**
 * Check if a single entry point looks like an actual file path (not an instruction)
 */
function isValidEntryPoint(ep: string): boolean {
  // Has a known file extension (ts, js, tsx, jsx, mjs, cjs, py, go, rs)
  const hasExtension = /\.(ts|js|tsx|jsx|mjs|cjs|py|go|rs)$/.test(ep);
  // Looks like a path with directory separator (e.g., bin/cli, src/index)
  const hasPathSeparator = ep.includes('/');
  // Must not start with instruction words
  const isNotInstruction = !INVALID_ENTRY_POINT_PATTERNS.some(pattern => pattern.test(ep));

  // Valid if: (has extension) OR (has path separator for extensionless like bin/wiggum)
  // AND doesn't look like an instruction
  return (hasExtension || hasPathSeparator) && isNotInstruction;
}

/**
 * Check if entry points look like actual file paths (not instructions)
 */
function hasValidEntryPoints(entryPoints: string[]): boolean {
  if (entryPoints.length === 0) return false;
  return entryPoints.every(isValidEntryPoint);
}

/**
 * Filter entry points to only include valid file paths
 */
function filterValidEntryPoints(entryPoints: string[]): string[] {
  return entryPoints.filter(isValidEntryPoint);
}

/**
 * Normalize MCP names (strip parenthetical explanations)
 */
function normalizeMcpName(name: string): string {
  return name.split('(')[0].trim().toLowerCase();
}

/**
 * System prompt for the Evaluator
 */
const EVALUATOR_SYSTEM_PROMPT = `You are a QA Evaluator for AI-generated codebase analysis.

## Your Mission
Evaluate the analysis result for:
1. Completeness - Are all important areas covered?
2. Accuracy - Do the recommendations match the detected stack?
3. Actionability - Are the guidelines specific and useful?
4. MCP relevance - Are the right MCP servers recommended?

## Scoring Guidelines
- 9-10: Excellent, comprehensive, highly actionable
- 7-8: Good, covers main areas, useful guidelines
- 5-6: Adequate but missing some important details
- 3-4: Incomplete, vague, or partially incorrect
- 1-2: Poor, missing critical information

## Quality Checks - IMPORTANT
- Entry points MUST be actual file paths (e.g., "src/index.ts", "src/cli.ts")
  - FAIL if they contain instructions like "Check", "If", "Open", "Look"
  - FAIL if they don't look like file paths (no / or . characters)
- Key directories MUST map actual directories to their purposes
  - FAIL if only generic entries like {"src": "Source code"}
- Guidelines MUST be actionable commands, not exploration tasks
  - Good: "Run npm test", "Check API routes in src/routes"
  - Bad: "Investigate the codebase", "Look for patterns"
- MCP servers MUST be single-word identifiers only (no parenthetical explanations)

Be constructive but honest. If it's good, say so. If it needs work, explain why.`;

/**
 * System prompt for the Optimizer
 */
const OPTIMIZER_SYSTEM_PROMPT = `You are an Optimizer that improves AI-generated codebase analysis based on evaluation feedback.

## Your Mission
Based on the evaluation feedback, improve:
1. Implementation guidelines - make them more specific and actionable
2. Entry points - add any obvious ones that were missed
3. MCP servers - add any that would be useful

## Guidelines for Improvement
- Keep guidelines to 5-10 words
- Start with action verbs
- Be specific to the detected stack
- Don't remove good content, only add or improve

## MCP Server Names
- Use ONLY single-word identifiers: "playwright", "supabase", "postgres"
- NEVER add explanations in parentheses
- NEVER add descriptions after the name
- If unsure, omit rather than guess`;

/**
 * Run the Evaluator-Optimizer QA loop
 */
export async function runEvaluatorOptimizer(
  model: LanguageModel,
  modelId: string,
  result: MultiAgentAnalysis,
  scanResult: ScanResult,
  maxIterations: number = 2,
  verbose: boolean = false
): Promise<MultiAgentAnalysis> {
  let currentResult = result;
  let iterations = 0;

  while (iterations < maxIterations) {
    // Evaluate current result
    const evaluation = await evaluateResult(model, modelId, currentResult, scanResult, verbose);

    if (verbose) {
      logger.info(`Evaluator (iteration ${iterations + 1}): Score ${evaluation.qualityScore}/10`);
      if (evaluation.specificIssues.length > 0) {
        logger.info(`Issues: ${evaluation.specificIssues.join(', ')}`);
      }
    }

    // Check if quality meets threshold (including valid entry point paths)
    if (
      evaluation.qualityScore >= QUALITY_THRESHOLD &&
      evaluation.hasEntryPoints &&
      hasValidEntryPoints(currentResult.codebaseAnalysis.projectContext.entryPoints) &&
      evaluation.hasImplementationGuidelines
    ) {
      if (verbose) {
        logger.info('Evaluator: Quality threshold met, skipping optimization');
      }
      break;
    }

    // Optimize based on feedback
    if (verbose) {
      logger.info('Evaluator: Running optimizer to improve result');
    }

    currentResult = await optimizeResult(model, modelId, currentResult, evaluation, verbose);
    iterations++;
  }

  return currentResult;
}

/**
 * Evaluate the analysis result
 */
async function evaluateResult(
  model: LanguageModel,
  modelId: string,
  result: MultiAgentAnalysis,
  scanResult: ScanResult,
  verbose: boolean
): Promise<EvaluationResult> {
  const prompt = `Evaluate this codebase analysis:

## Analysis Result
Project Type: ${result.codebaseAnalysis.projectContext.projectType}
Entry Points: ${result.codebaseAnalysis.projectContext.entryPoints.join(', ') || 'None'}
Key Directories: ${Object.keys(result.codebaseAnalysis.projectContext.keyDirectories).join(', ') || 'None'}
Guidelines: ${result.codebaseAnalysis.implementationGuidelines.length} items
- ${result.codebaseAnalysis.implementationGuidelines.slice(0, 3).join('\n- ')}
MCP Essential: ${result.mcpServers.essential.join(', ')}
MCP Recommended: ${result.mcpServers.recommended.join(', ') || 'None'}

## Original Project Context
Framework: ${scanResult.stack.framework?.name || 'Unknown'}
Database: ${scanResult.stack.database?.name || 'None detected'}
Testing: ${scanResult.stack.testing?.unit?.name || 'None detected'}

Evaluate the quality and completeness of this analysis.`;

  try {
    const { generateObject } = getTracedAI();

    const { object: evaluation } = await generateObject({
      model,
      schema: evaluationSchema,
      system: EVALUATOR_SYSTEM_PROMPT,
      prompt,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.2 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'evaluator',
          projectType: result.codebaseAnalysis.projectContext.projectType,
        },
      },
    });

    return evaluation;
  } catch (error) {
    if (verbose) {
      logger.error(`Evaluator error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return a passing evaluation on error to avoid blocking
    return {
      qualityScore: 7,
      hasEntryPoints: result.codebaseAnalysis.projectContext.entryPoints.length > 0,
      hasImplementationGuidelines: result.codebaseAnalysis.implementationGuidelines.length > 0,
      hasRelevantMcpServers: result.mcpServers.essential.length > 0,
      specificIssues: [],
      improvementSuggestions: [],
    };
  }
}

/**
 * Optimize the result based on evaluation feedback
 */
async function optimizeResult(
  model: LanguageModel,
  modelId: string,
  result: MultiAgentAnalysis,
  evaluation: EvaluationResult,
  verbose: boolean
): Promise<MultiAgentAnalysis> {
  const prompt = `Improve this codebase analysis based on the evaluation feedback.

## Current Analysis
Project Type: ${result.codebaseAnalysis.projectContext.projectType}
Entry Points: ${result.codebaseAnalysis.projectContext.entryPoints.join(', ')}
Current Guidelines:
${result.codebaseAnalysis.implementationGuidelines.map(g => `- ${g}`).join('\n')}

## Evaluation Feedback
Score: ${evaluation.qualityScore}/10
Issues: ${evaluation.specificIssues.join(', ') || 'None'}
Suggestions: ${evaluation.improvementSuggestions.join(', ') || 'None'}

Provide improved guidelines and any additional entry points or MCP servers.`;

  try {
    const { generateObject } = getTracedAI();

    const { object: improvements } = await generateObject({
      model,
      schema: optimizerOutputSchema,
      system: OPTIMIZER_SYSTEM_PROMPT,
      prompt,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'optimizer',
          previousScore: evaluation.qualityScore,
        },
      },
    });

    // Apply improvements to the result
    const improved: MultiAgentAnalysis = {
      ...result,
      codebaseAnalysis: {
        ...result.codebaseAnalysis,
        implementationGuidelines: improvements.improvedGuidelines.length > 0
          ? improvements.improvedGuidelines
          : result.codebaseAnalysis.implementationGuidelines,
        projectContext: {
          ...result.codebaseAnalysis.projectContext,
          // Filter invalid entry points (instructions) and merge with new ones
          entryPoints: filterValidEntryPoints([
            ...result.codebaseAnalysis.projectContext.entryPoints,
            ...improvements.additionalEntryPoints,
          ]).filter((ep, i, arr) => arr.indexOf(ep) === i), // dedupe
        },
      },
      mcpServers: {
        ...result.mcpServers,
        recommended: improvements.additionalMcpServers.length > 0
          ? [...new Set([
              ...result.mcpServers.recommended.map(normalizeMcpName),
              ...improvements.additionalMcpServers.map(normalizeMcpName)
            ])]
          : result.mcpServers.recommended.map(normalizeMcpName),
      },
    };

    if (verbose) {
      logger.info(`Optimizer: Updated ${improvements.improvedGuidelines.length} guidelines`);
    }

    return improved;
  } catch (error) {
    if (verbose) {
      logger.error(`Optimizer error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return original result on error
    return result;
  }
}
