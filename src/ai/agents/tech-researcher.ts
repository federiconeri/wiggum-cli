/**
 * Tech Researcher Worker (Phase 2)
 * Researches best practices for a specific technology
 * Multiple instances run in parallel via runTechResearchPool
 *
 * @deprecated v0.5.0 - No longer used in main pipeline.
 * Tech research is now handled by the model's built-in knowledge.
 * Kept for backward compatibility and reference.
 */

import { stepCountIs, type LanguageModel, type Tool } from 'ai';
import type { TechResearcherInput, TechResearchResult, AgentCapabilities, AgentOptions } from './types.js';
import { createTavilySearchTool } from '../tools/tavily.js';
import { createContext7Tools } from '../tools/context7.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';
import { getTracedAI } from '../../utils/tracing.js';

/**
 * Documentation hints mapping for common technologies
 * Used to provide useful links when AI research fails or as supplements
 * Exported for testing
 */
export const DOCUMENTATION_HINTS: Record<string, string[]> = {
  // MCP ecosystem
  'MCP': ['https://modelcontextprotocol.io/docs', 'https://modelcontextprotocol.io/docs/tools/inspector'],
  'MCP Server': ['https://modelcontextprotocol.io/docs', 'https://modelcontextprotocol.io/docs/tools/inspector'],
  '@modelcontextprotocol/sdk': ['https://modelcontextprotocol.io/docs/tools/inspector'],

  // Frontend frameworks
  'Next.js': ['https://nextjs.org/docs/app', 'https://nextjs.org/docs/app/building-your-application'],
  'React': ['https://react.dev', 'https://react.dev/learn'],
  'Vue': ['https://vuejs.org/guide', 'https://vuejs.org/api'],
  'Svelte': ['https://svelte.dev/docs', 'https://kit.svelte.dev/docs'],
  'Nuxt': ['https://nuxt.com/docs', 'https://nuxt.com/docs/api'],

  // Backend frameworks
  'Express': ['https://expressjs.com/en/guide', 'https://expressjs.com/en/api.html'],
  'Fastify': ['https://fastify.dev/docs/latest', 'https://fastify.dev/docs/latest/Guides/Getting-Started'],
  'Hono': ['https://hono.dev/docs', 'https://hono.dev/docs/guides'],
  'NestJS': ['https://docs.nestjs.com', 'https://docs.nestjs.com/first-steps'],

  // Testing
  'Vitest': ['https://vitest.dev/guide', 'https://vitest.dev/api'],
  'Jest': ['https://jestjs.io/docs/getting-started', 'https://jestjs.io/docs/api'],
  'Playwright': ['https://playwright.dev/docs/intro', 'https://playwright.dev/docs/api/class-test'],

  // Validation
  'Zod': ['https://zod.dev', 'https://zod.dev/?id=primitives'],
  'Yup': ['https://github.com/jquense/yup#api'],

  // Database
  'Prisma': ['https://www.prisma.io/docs', 'https://www.prisma.io/docs/orm/prisma-client'],
  'Drizzle': ['https://orm.drizzle.team/docs/overview', 'https://orm.drizzle.team/docs/sql-schema-declaration'],
  'Supabase': ['https://supabase.com/docs', 'https://supabase.com/docs/guides/database'],

  // TypeScript
  'TypeScript': ['https://www.typescriptlang.org/docs', 'https://www.typescriptlang.org/docs/handbook'],

  // CLI tools
  'Commander': ['https://github.com/tj/commander.js#readme'],
  'Yargs': ['https://yargs.js.org/docs'],
};

/**
 * Get documentation hints for a technology
 * Exported for testing
 */
export function getDocumentationHints(technology: string): string[] {
  // Direct match
  if (DOCUMENTATION_HINTS[technology]) {
    return DOCUMENTATION_HINTS[technology];
  }

  // Empty string should return generic fallback
  if (!technology.trim()) {
    return [`Check official ${technology} documentation`];
  }

  const lowerTech = technology.toLowerCase();

  // Case-insensitive exact match first
  for (const [key, hints] of Object.entries(DOCUMENTATION_HINTS)) {
    if (key.toLowerCase() === lowerTech) {
      return hints;
    }
  }

  // Partial match - prefer longer keys to avoid "React" matching "React Native"
  // Sort keys by length descending so longer/more specific matches win
  const sortedKeys = Object.keys(DOCUMENTATION_HINTS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const lowerKey = key.toLowerCase();
    if (lowerTech.includes(lowerKey) || lowerKey.includes(lowerTech)) {
      return DOCUMENTATION_HINTS[key];
    }
  }

  return [`Check official ${technology} documentation`];
}

/**
 * Get the current year for dynamic prompt generation
 */
function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Generate system prompt for Tech Researcher with tools
 */
function getTechResearcherWithToolsPrompt(): string {
  const year = getCurrentYear();
  return `You are a Tech Researcher worker focused on a single technology.

## Your Mission
Research the specified technology to find:
1. Current best practices (${year}+)
2. Common anti-patterns to avoid
3. Testing tips and patterns
4. Useful documentation links

## Tools Available
- tavilySearch: Search the web (use timeRange for recent results)
- resolveLibraryId: Find the Context7 library ID for a package
- queryDocs: Query documentation using the resolved library ID

## Research Strategy
1. Use tavilySearch with timeRange: "year" for current practices
2. For library docs: First call resolveLibraryId, then queryDocs with SPECIFIC queries
3. Break research into focused queries, not broad searches

## Good vs Bad Queries
- Tavily Good: "Express error handling middleware patterns"
- Tavily Bad: "Express Fastify Commander Yargs best practices ${year}"
- Context7 Good: resolveLibraryId("express") → queryDocs("middleware error handling")
- Context7 Bad: queryDocs("best practices production testing documentation")

## Output Format
Output ONLY valid JSON:
{
  "technology": "Next.js 14",
  "bestPractices": ["Use App Router for new projects", "Enable strict TypeScript"],
  "antiPatterns": ["Don't use pages/ and app/ together", "Avoid client components for static content"],
  "testingTips": ["Use @testing-library/react", "Mock next/navigation for routing tests"],
  "documentationHints": ["App Router: nextjs.org/docs/app", "Data Fetching: nextjs.org/docs/app/building-your-application/data-fetching"],
  "researchMode": "full"
}

Keep each item concise (5-15 words max). Max 5 items per array.`;
}

/**
 * System prompt for Tech Researcher without tools (knowledge-only)
 */
const TECH_RESEARCHER_KNOWLEDGE_ONLY_PROMPT = `You are a Tech Researcher worker. You don't have web access, so rely on your training knowledge.

## Your Mission
Based on your knowledge of the specified technology, provide:
1. Best practices (note if potentially outdated)
2. Common anti-patterns to avoid
3. Testing tips
4. Documentation hints

## Output Format
Output ONLY valid JSON:
{
  "technology": "React",
  "bestPractices": ["Use functional components with hooks", "Memoize expensive computations"],
  "antiPatterns": ["Don't mutate state directly", "Avoid prop drilling"],
  "testingTips": ["Use React Testing Library", "Test behavior not implementation"],
  "documentationHints": ["React docs: react.dev", "Testing: testing-library.com"],
  "researchMode": "knowledge-only"
}

Keep each item concise (5-15 words max). Max 5 items per array.`;

/**
 * Determine research mode based on capabilities
 */
function getResearchMode(capabilities: AgentCapabilities): TechResearchResult['researchMode'] {
  if (capabilities.hasTavily && capabilities.hasContext7) return 'full';
  if (capabilities.hasTavily) return 'web-only';
  if (capabilities.hasContext7) return 'docs-only';
  return 'knowledge-only';
}

/**
 * Run a single Tech Researcher worker for one technology
 */
export async function runTechResearcher(
  model: LanguageModel,
  modelId: string,
  input: TechResearcherInput,
  options: AgentOptions,
  verbose: boolean = false
): Promise<TechResearchResult> {
  const tools: Record<string, Tool> = {};

  // Add tools based on available keys
  if (options.tavilyApiKey) {
    tools.tavilySearch = createTavilySearchTool(options.tavilyApiKey);
  }
  if (options.context7ApiKey) {
    const c7Tools = createContext7Tools(options.context7ApiKey);
    tools.resolveLibraryId = c7Tools.resolveLibraryId;
    tools.queryDocs = c7Tools.queryDocs;
  }

  const hasTools = Object.keys(tools).length > 0;
  const researchMode = getResearchMode(input.capabilities);

  if (verbose) {
    logger.info(`Tech Researcher [${input.technology}]: ${researchMode} mode`);
  }

  const systemPrompt = hasTools
    ? getTechResearcherWithToolsPrompt()
    : TECH_RESEARCHER_KNOWLEDGE_ONLY_PROMPT;

  const prompt = `Research best practices for: ${input.technology}

Provide current best practices, anti-patterns to avoid, testing tips, and documentation hints.
Output your findings as JSON.`;

  try {
    const { generateText } = getTracedAI();

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt,
      ...(hasTools ? { tools, stopWhen: stepCountIs(3) } : {}),
      maxOutputTokens: 2000,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'tech-researcher',
          technology: input.technology,
          researchMode,
        },
      },
    });

    const research = parseTechResearch(result.text, result.steps, input.technology, researchMode, verbose);
    return research;
  } catch (error) {
    if (verbose) {
      logger.error(`Tech Researcher [${input.technology}] error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return getDefaultTechResearch(input.technology, researchMode);
  }
}

/**
 * Run multiple Tech Researchers in parallel for a list of technologies
 */
export async function runTechResearchPool(
  model: LanguageModel,
  modelId: string,
  technologies: string[],
  options: AgentOptions,
  verbose: boolean = false
): Promise<TechResearchResult[]> {
  if (technologies.length === 0) {
    return [];
  }

  // Determine capabilities once
  const capabilities: AgentCapabilities = {
    hasTavily: !!options.tavilyApiKey,
    hasContext7: !!options.context7ApiKey,
  };

  if (verbose) {
    logger.info(`Tech Research Pool: Starting ${technologies.length} parallel researchers`);
  }

  // Run all researchers in parallel
  const results = await Promise.all(
    technologies.map(technology =>
      runTechResearcher(
        model,
        modelId,
        { technology, capabilities },
        options,
        verbose
      )
    )
  );

  if (verbose) {
    logger.info(`Tech Research Pool: Completed ${results.length} research tasks`);
  }

  return results;
}

/**
 * Parse tech research from agent response
 */
function parseTechResearch(
  text: string,
  steps: Array<{ text?: string }> | undefined,
  technology: string,
  researchMode: TechResearchResult['researchMode'],
  verbose: boolean
): TechResearchResult {
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
      logger.warn(`Tech Researcher [${technology}]: No text output found`);
    }
    return getDefaultTechResearch(technology, researchMode);
  }

  // Use safe JSON parser with repair capabilities
  const parsed = parseJsonSafe<Partial<TechResearchResult>>(textToParse);

  if (!parsed) {
    if (verbose) {
      logger.warn(`Tech Researcher [${technology}]: Failed to parse JSON response`);
    }
    return getDefaultTechResearch(technology, researchMode);
  }

  return {
    technology,
    bestPractices: parsed.bestPractices || [],
    antiPatterns: parsed.antiPatterns || [],
    testingTips: parsed.testingTips || [],
    documentationHints: parsed.documentationHints || [],
    researchMode,
  };
}

/**
 * Get default tech research when parsing fails
 * Uses the DOCUMENTATION_HINTS mapping for relevant URLs
 */
function getDefaultTechResearch(
  technology: string,
  researchMode: TechResearchResult['researchMode']
): TechResearchResult {
  return {
    technology,
    bestPractices: ['Follow official documentation', 'Use TypeScript for type safety'],
    antiPatterns: ['Avoid deprecated APIs', 'Don\'t skip error handling'],
    testingTips: ['Write unit tests for core logic', 'Test edge cases'],
    documentationHints: getDocumentationHints(technology),
    researchMode,
  };
}
