/**
 * Synthesis Agent (Phase 3)
 * Merges results from parallel workers and generates implementation guidelines
 */

import { type LanguageModel } from 'ai';
import { z } from 'zod';
import type {
  SynthesisInput,
  MultiAgentAnalysis,
  CodebaseAnalysis,
  StackResearch,
  McpRecommendations,
} from './types.js';
import { convertToLegacyMcpRecommendations } from './mcp-detector.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';
import { getTracedAI } from '../../utils/tracing.js';

/**
 * Schema for synthesis output (implementation guidelines)
 */
const synthesisOutputSchema = z.object({
  implementationGuidelines: z.array(z.string()).describe('Short, actionable implementation guidelines'),
  possibleMissedTechnologies: z.array(z.string()).optional().describe('Technologies that may have been missed'),
});

/**
 * System prompt for the Synthesis Agent
 */
const SYNTHESIS_AGENT_SYSTEM_PROMPT = `You are a Synthesis Agent that merges analysis results into actionable implementation guidelines.

## Your Mission
Based on the enriched context and technology research, generate:
1. Short, actionable implementation guidelines (5-10 words each)
2. List any technologies that may have been missed

## Guidelines Style
- Start with action verbs: "Run", "Use", "Follow", "Avoid"
- Be specific to the detected stack
- Include testing commands
- Mention key patterns from the research
- Max 7 guidelines, prioritize the most important

## Example Output
{
  "implementationGuidelines": [
    "Run npm test after changes",
    "Use App Router for new pages",
    "Follow existing component patterns in src/components",
    "Use Zod for API validation",
    "Run npx playwright test for E2E"
  ],
  "possibleMissedTechnologies": ["Redis caching"]
}`;

/**
 * Run the Synthesis Agent to merge results and generate guidelines
 */
export async function runSynthesisAgent(
  model: LanguageModel,
  modelId: string,
  input: SynthesisInput,
  verbose: boolean = false
): Promise<MultiAgentAnalysis> {
  // Build context summary for the LLM
  const techSummary = input.techResearch
    .map(r => `### ${r.technology}\nBest practices: ${r.bestPractices.slice(0, 3).join(', ')}\nAnti-patterns: ${r.antiPatterns.slice(0, 2).join(', ')}`)
    .join('\n\n');

  const prompt = `Synthesize these analysis results into implementation guidelines.

## Project Context
- Type: ${input.enrichedContext.projectType}
- Entry Points: ${input.enrichedContext.entryPoints.join(', ')}
- Key Directories: ${Object.entries(input.enrichedContext.keyDirectories).map(([k, v]) => `${k} (${v})`).join(', ')}

## Commands Available
${Object.entries(input.enrichedContext.commands).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Technology Research
${techSummary || 'No specific technology research available.'}

## MCP Servers
- E2E Testing: ${input.mcpServers.e2eTesting}
- Database: ${input.mcpServers.database || 'None detected'}
- Additional: ${input.mcpServers.additional.join(', ') || 'None'}

## Analysis Plan Questions & Answers
${Object.entries(input.enrichedContext.answeredQuestions).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n') || 'No questions answered.'}

Generate concise, actionable implementation guidelines based on this analysis.`;

  try {
    const { generateObject } = getTracedAI();

    const { object: synthesis } = await generateObject({
      model,
      schema: synthesisOutputSchema,
      system: SYNTHESIS_AGENT_SYSTEM_PROMPT,
      prompt,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'synthesis-agent',
          projectType: input.enrichedContext.projectType,
          techCount: input.techResearch.length,
        },
      },
    });

    if (verbose) {
      logger.info(`Synthesis Agent: Generated ${synthesis.implementationGuidelines.length} guidelines`);
    }

    // Convert to MultiAgentAnalysis format for backward compatibility
    return buildMultiAgentAnalysis(input, synthesis.implementationGuidelines, synthesis.possibleMissedTechnologies);
  } catch (error) {
    if (verbose) {
      logger.error(`Synthesis Agent error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return with default guidelines
    return buildMultiAgentAnalysis(input, getDefaultGuidelines(input), []);
  }
}

/**
 * Build MultiAgentAnalysis from synthesis input and generated guidelines
 */
function buildMultiAgentAnalysis(
  input: SynthesisInput,
  implementationGuidelines: string[],
  possibleMissedTechnologies?: string[]
): MultiAgentAnalysis {
  // Convert EnrichedContext to CodebaseAnalysis format
  const codebaseAnalysis: CodebaseAnalysis = {
    projectContext: {
      entryPoints: input.enrichedContext.entryPoints,
      keyDirectories: input.enrichedContext.keyDirectories,
      namingConventions: input.enrichedContext.namingConventions,
      projectType: input.enrichedContext.projectType,
    },
    commands: {
      test: input.enrichedContext.commands.test,
      lint: input.enrichedContext.commands.lint,
      typecheck: input.enrichedContext.commands.typecheck,
      build: input.enrichedContext.commands.build,
      dev: input.enrichedContext.commands.dev,
      format: input.enrichedContext.commands.format,
    },
    implementationGuidelines,
    possibleMissedTechnologies,
  };

  // Merge tech research into StackResearch format
  const stackResearch: StackResearch = mergeTechResearch(input.techResearch);

  // Convert MCP servers to legacy format
  const mcpServers: McpRecommendations = convertToLegacyMcpRecommendations(input.mcpServers);

  return {
    codebaseAnalysis,
    stackResearch,
    mcpServers,
  };
}

/**
 * Merge multiple TechResearchResult into a single StackResearch
 */
function mergeTechResearch(techResearch: SynthesisInput['techResearch']): StackResearch {
  if (techResearch.length === 0) {
    return {
      bestPractices: ['Follow project conventions'],
      antiPatterns: ['Avoid skipping tests'],
      testingTools: ['npm test'],
      debuggingTools: ['console.log'],
      documentationHints: ['Check official docs'],
      researchMode: 'knowledge-only',
    };
  }

  // Merge all research results
  const bestPractices: string[] = [];
  const antiPatterns: string[] = [];
  const testingTips: string[] = [];
  const documentationHints: string[] = [];
  let researchMode: StackResearch['researchMode'] = 'knowledge-only';

  for (const research of techResearch) {
    bestPractices.push(...research.bestPractices);
    antiPatterns.push(...research.antiPatterns);
    testingTips.push(...research.testingTips);
    documentationHints.push(...research.documentationHints);

    // Use the most complete research mode
    if (research.researchMode === 'full') researchMode = 'full';
    else if (research.researchMode === 'web-only' && researchMode !== 'full') researchMode = 'web-only';
    else if (research.researchMode === 'docs-only' && researchMode === 'knowledge-only') researchMode = 'docs-only';
  }

  // Deduplicate and limit
  return {
    bestPractices: [...new Set(bestPractices)].slice(0, 10),
    antiPatterns: [...new Set(antiPatterns)].slice(0, 10),
    testingTools: [...new Set(testingTips)].slice(0, 5),
    debuggingTools: [], // Not collected in new format
    documentationHints: [...new Set(documentationHints)].slice(0, 5),
    researchMode,
  };
}

/**
 * Get default implementation guidelines when synthesis fails
 */
function getDefaultGuidelines(input: SynthesisInput): string[] {
  const guidelines: string[] = [];

  // Add test command if available
  if (input.enrichedContext.commands.test) {
    guidelines.push(`Run ${input.enrichedContext.commands.test} after changes`);
  }

  // Add build command if available
  if (input.enrichedContext.commands.build) {
    guidelines.push(`Run ${input.enrichedContext.commands.build} before committing`);
  }

  // Add E2E testing
  guidelines.push(`Run npx playwright test for E2E testing`);

  // Add generic guidelines
  guidelines.push('Follow existing code patterns');
  guidelines.push('Use TypeScript strict mode');

  return guidelines.slice(0, 7);
}
