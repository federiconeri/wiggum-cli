/**
 * Stack Researcher Agent
 * Researches best practices and tools for the detected stack
 * Gracefully degrades when optional services are unavailable
 *
 * @deprecated Use runTechResearcher/runTechResearchPool from tech-researcher.ts instead.
 * This agent is kept for backward compatibility.
 */

import { stepCountIs, type LanguageModel, type Tool } from 'ai';
import type { StackResearch, StackResearcherInput, AgentCapabilities } from './types.js';
import type { DetectedStack } from '../../scanner/types.js';
import { createTavilySearchTool } from '../tools/tavily.js';
import { createContext7Tools } from '../tools/context7.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';
import { getTracedAI } from '../../utils/tracing.js';

/**
 * Get the current year for dynamic prompt generation
 */
function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Generate system prompt for Stack Researcher with tools
 */
function getStackResearcherWithToolsPrompt(): string {
  const year = getCurrentYear();
  return `You are a Stack Researcher agent with access to web search and documentation lookup tools.

## Your Mission
Research the detected technology stack to find:
1. Current best practices (${year}+)
2. Common anti-patterns to avoid
3. Testing tools and patterns
4. Debugging approaches
5. Useful documentation links

## Tools Available
- tavilySearch: Search the web (use timeRange for recent results)
- resolveLibraryId: Find the Context7 library ID for a package
- queryDocs: Query documentation using the resolved library ID

## Research Strategy
1. Use tavilySearch with timeRange: "year" for current practices
2. For library docs: First call resolveLibraryId, then queryDocs with SPECIFIC queries
3. Break research into focused queries, not broad searches

## Good vs Bad Queries
- Tavily Good: "React testing patterns vitest"
- Tavily Bad: "React Vitest Playwright best practices ${year}"
- Context7 Good: resolveLibraryId("vitest") → queryDocs("test setup configuration")
- Context7 Bad: queryDocs("best practices production testing documentation")

## Output Format
After research, output ONLY valid JSON with this structure:
{
  "bestPractices": [
    "Use TypeScript strict mode",
    "Implement proper error boundaries"
  ],
  "antiPatterns": [
    "Don't use any type",
    "Avoid prop drilling"
  ],
  "testingTools": [
    "npx vitest",
    "npx playwright test"
  ],
  "debuggingTools": [
    "React DevTools",
    "DEBUG=* npm run dev"
  ],
  "documentationHints": [
    "React docs: react.dev",
    "Vitest: vitest.dev"
  ],
  "researchMode": "full"
}

Keep each item concise (5-15 words max). Max 5 items per array.`;
}

/**
 * System prompt for Stack Researcher without tools (knowledge-only)
 */
const STACK_RESEARCHER_KNOWLEDGE_ONLY_PROMPT = `You are a Stack Researcher agent. You don't have web access, so rely on your training knowledge.

## Your Mission
Based on your knowledge, provide:
1. Best practices for the detected technologies
2. Common anti-patterns to avoid
3. Testing tools commonly used with this stack
4. Debugging approaches
5. Documentation hints

## Important Notes
- Be explicit about what you're confident about vs uncertain
- Focus on well-established practices from your training
- Mention if something might be outdated

## Output Format
Output ONLY valid JSON with this structure:
{
  "bestPractices": [
    "Use TypeScript strict mode",
    "Implement proper error boundaries"
  ],
  "antiPatterns": [
    "Don't use any type",
    "Avoid prop drilling"
  ],
  "testingTools": [
    "npm test",
    "npx vitest"
  ],
  "debuggingTools": [
    "console.log debugging",
    "Node.js inspector"
  ],
  "documentationHints": [
    "Check official docs for updates",
    "Framework docs: [URL]"
  ],
  "researchMode": "knowledge-only"
}

Keep each item concise (5-15 words max). Max 5 items per array.
Note: Research mode should reflect that you're using training knowledge only.`;

/**
 * Create the research prompt based on stack and project type
 */
function createResearchPrompt(stack: DetectedStack, projectType: string, hasTools: boolean): string {
  const technologies: string[] = [];

  // Collect all detected technologies
  if (stack.framework) technologies.push(stack.framework.name);
  if (stack.testing?.unit) technologies.push(stack.testing.unit.name);
  if (stack.testing?.e2e) technologies.push(stack.testing.e2e.name);
  if (stack.orm) technologies.push(stack.orm.name);
  if (stack.database) technologies.push(stack.database.name);
  if (stack.stateManagement) technologies.push(stack.stateManagement.name);
  if (stack.auth) technologies.push(stack.auth.name);
  if (stack.mcp?.isProject) technologies.push('MCP Server');

  const techList = technologies.length > 0 ? technologies.join(', ') : 'Unknown stack';

  if (hasTools) {
    return `Research best practices for this stack:

Project Type: ${projectType}
Technologies: ${techList}

Use the available tools to search for:
1. Current best practices for ${projectType} projects
2. Testing patterns for ${techList}
3. Common anti-patterns to avoid

Then produce your research findings as JSON.`;
  }

  return `Based on your knowledge, provide best practices for this stack:

Project Type: ${projectType}
Technologies: ${techList}

Provide:
1. Best practices for ${projectType} projects
2. Testing tools commonly used with ${techList}
3. Anti-patterns to avoid
4. Debugging approaches

Output your findings as JSON. Be clear this is based on training knowledge.`;
}

/**
 * Determine research mode based on capabilities
 */
function getResearchMode(capabilities: AgentCapabilities): StackResearch['researchMode'] {
  if (capabilities.hasTavily && capabilities.hasContext7) return 'full';
  if (capabilities.hasTavily) return 'web-only';
  if (capabilities.hasContext7) return 'docs-only';
  return 'knowledge-only';
}

/**
 * Run the Stack Researcher agent
 */
export async function runStackResearcher(
  model: LanguageModel,
  modelId: string,
  input: StackResearcherInput,
  options: { tavilyApiKey?: string; context7ApiKey?: string },
  verbose: boolean = false
): Promise<StackResearch | null> {
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
    logger.info(`Stack Researcher running in ${researchMode} mode`);
  }

  const systemPrompt = hasTools
    ? getStackResearcherWithToolsPrompt()
    : STACK_RESEARCHER_KNOWLEDGE_ONLY_PROMPT;

  const prompt = createResearchPrompt(input.stack, input.projectType, hasTools);

  try {
    const { generateText } = getTracedAI();

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt,
      ...(hasTools ? { tools, stopWhen: stepCountIs(8) } : {}),
      maxOutputTokens: 2000,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: { agent: 'stack-researcher', researchMode, projectType: input.projectType },
      },
    });

    // Parse the response
    const research = parseStackResearch(result.text, result.steps, researchMode, verbose);
    return research;
  } catch (error) {
    if (verbose) {
      logger.error(`Stack Researcher error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

/**
 * Parse the stack research from agent response
 */
function parseStackResearch(
  text: string,
  steps: Array<{ text?: string }> | undefined,
  researchMode: StackResearch['researchMode'],
  verbose: boolean
): StackResearch | null {
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
      logger.warn('Stack Researcher: No text output found');
    }
    return getDefaultStackResearch(researchMode);
  }

  // Use safe JSON parser with repair capabilities
  const parsed = parseJsonSafe<Partial<StackResearch>>(textToParse);

  if (!parsed) {
    if (verbose) {
      logger.warn('Stack Researcher: Failed to parse JSON response');
    }
    return getDefaultStackResearch(researchMode);
  }

  // Build result with defaults for missing fields
  return {
    bestPractices: parsed.bestPractices || [],
    antiPatterns: parsed.antiPatterns || [],
    testingTools: parsed.testingTools || [],
    debuggingTools: parsed.debuggingTools || [],
    documentationHints: parsed.documentationHints || [],
    researchMode: researchMode,
  };
}

/**
 * Get default stack research when parsing fails
 */
function getDefaultStackResearch(researchMode: StackResearch['researchMode']): StackResearch {
  return {
    bestPractices: ['Follow project conventions', 'Write tests for new code'],
    antiPatterns: ['Avoid skipping tests', 'Don\'t ignore type errors'],
    testingTools: ['npm test'],
    debuggingTools: ['console.log', 'debugger statement'],
    documentationHints: ['Check package.json for dependencies'],
    researchMode,
  };
}
