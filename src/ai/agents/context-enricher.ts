/**
 * Context Enricher Worker (Phase 2)
 * Explores the codebase to gather enriched context based on the analysis plan
 */

import { stepCountIs, type LanguageModel } from 'ai';
import type { ContextEnricherInput, EnrichedContext } from './types.js';
import { createExplorationTools } from '../tools.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';
import { getTracedAI } from '../../utils/tracing.js';

/**
 * System prompt for the Context Enricher worker
 */
const CONTEXT_ENRICHER_SYSTEM_PROMPT = `You are a Context Enricher worker. Your job is to explore specific areas of a codebase and answer specific questions.

## Your Mission
Based on the analysis plan, explore the codebase to:
1. Identify entry points and key files
2. Understand directory structure and purposes
3. Detect naming conventions
4. Find available commands (from package.json)
5. Answer the specific questions provided

## Tools Available
- searchCode: Search using ripgrep patterns
- readFile: Read file contents
- listDirectory: List directory structure
- getPackageInfo: Get package.json info

## Exploration Strategy
1. List the areas specified in the plan
2. Read package.json to understand scripts and dependencies
3. Search for patterns to answer the specific questions
4. Identify the project type based on structure

## Project Types
- MCP Server: Has @modelcontextprotocol dependencies
- REST API: Express/Fastify/Hono with route handlers
- React SPA: React with components, no server-side rendering
- Next.js App: Next.js with app or pages directory
- CLI Tool: Has bin entry in package.json
- Library: Published package without app entry

## Output Format
After exploration, output ONLY valid JSON:
{
  "entryPoints": ["src/index.ts"],
  "keyDirectories": {"src/routes": "API routes", "src/components": "UI components"},
  "namingConventions": "camelCase files, PascalCase components",
  "commands": {"test": "npm test", "build": "npm run build"},
  "answeredQuestions": {"What is the auth strategy?": "NextAuth with JWT"},
  "projectType": "Next.js App"
}`;

/**
 * Run the Context Enricher worker
 */
export async function runContextEnricher(
  model: LanguageModel,
  modelId: string,
  input: ContextEnricherInput,
  verbose: boolean = false
): Promise<EnrichedContext> {
  const tools = createExplorationTools(input.scanResult.projectRoot);

  const prompt = `Explore this codebase and gather enriched context.

Project: ${input.scanResult.projectRoot}

## Areas to Explore
${input.areasToExplore.map(a => `- ${a}`).join('\n')}

## Questions to Answer
${input.questionsToAnswer.map(q => `- ${q}`).join('\n')}

Start by exploring the specified areas, then answer the questions and produce your analysis as JSON.`;

  try {
    const { generateText } = getTracedAI();

    const result = await generateText({
      model,
      system: CONTEXT_ENRICHER_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(5),
      maxOutputTokens: 3000,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'context-enricher',
          projectRoot: input.scanResult.projectRoot,
          areasCount: input.areasToExplore.length,
          questionsCount: input.questionsToAnswer.length,
        },
      },
    });

    // Parse the response
    const context = parseEnrichedContext(result.text, result.steps, verbose);

    if (verbose) {
      logger.info(`Context Enricher: Found ${context.entryPoints.length} entry points, answered ${Object.keys(context.answeredQuestions).length} questions`);
    }

    return context;
  } catch (error) {
    if (verbose) {
      logger.error(`Context Enricher error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return getDefaultEnrichedContext(input);
  }
}

/**
 * Parse the enriched context from agent response
 */
function parseEnrichedContext(
  text: string,
  steps: Array<{ text?: string }> | undefined,
  verbose: boolean
): EnrichedContext {
  // Try to get text from the result or steps
  let textToParse = text;

  if (!textToParse || textToParse.trim() === '') {
    const stepsList = steps || [];
    for (let i = stepsList.length - 1; i >= 0; i--) {
      const step = stepsList[i];
      if (step.text && step.text.trim() !== '') {
        textToParse = step.text;
        break;
      }
    }
  }

  if (!textToParse || textToParse.trim() === '') {
    if (verbose) {
      logger.warn('Context Enricher: No text output found');
    }
    return getDefaultEnrichedContext();
  }

  // Use safe JSON parser with repair capabilities
  const parsed = parseJsonSafe<Partial<EnrichedContext>>(textToParse);

  if (!parsed) {
    if (verbose) {
      logger.warn('Context Enricher: Failed to parse JSON response');
    }
    return getDefaultEnrichedContext();
  }

  // Build result with defaults for missing fields
  return {
    entryPoints: parsed.entryPoints || ['src/index.ts'],
    keyDirectories: parsed.keyDirectories || { src: 'Source code' },
    namingConventions: parsed.namingConventions || 'camelCase',
    commands: parsed.commands || { build: 'npm run build' },
    answeredQuestions: parsed.answeredQuestions || {},
    projectType: parsed.projectType || 'Unknown',
  };
}

/**
 * Get default enriched context when parsing fails
 */
function getDefaultEnrichedContext(input?: ContextEnricherInput): EnrichedContext {
  // Try to extract project type from scan result
  let projectType = 'Unknown';
  if (input?.scanResult.stack) {
    const stack = input.scanResult.stack;
    if (stack.mcp?.isProject) {
      projectType = 'MCP Server';
    } else if (stack.framework?.name.includes('Next')) {
      projectType = 'Next.js App';
    } else if (stack.framework?.name.includes('React')) {
      projectType = 'React SPA';
    } else if (stack.framework?.name) {
      projectType = `${stack.framework.name} Project`;
    }
  }

  return {
    entryPoints: ['src/index.ts'],
    keyDirectories: { src: 'Source code' },
    namingConventions: 'camelCase',
    commands: {
      test: 'npm test',
      build: 'npm run build',
      dev: 'npm run dev',
    },
    answeredQuestions: {},
    projectType,
  };
}
