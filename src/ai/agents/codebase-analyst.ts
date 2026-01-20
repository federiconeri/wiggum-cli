/**
 * Codebase Analyst Agent
 * Explores the codebase to understand its structure and patterns
 */

import { generateText, stepCountIs, type LanguageModel } from 'ai';
import type { CodebaseAnalysis, CodebaseAnalystInput } from './types.js';
import { createExplorationTools } from '../tools.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';

/**
 * System prompt for the Codebase Analyst agent
 */
const CODEBASE_ANALYST_SYSTEM_PROMPT = `You are a Codebase Analyst agent. Your job is to thoroughly explore a codebase and produce a structured analysis.

## Your Mission
Explore the codebase to understand:
1. Project structure and entry points
2. Key directories and their purposes
3. Naming conventions
4. Available commands (from package.json)
5. The primary project type

## Exploration Strategy
1. First, list the root directory to understand project structure
2. Read package.json to understand scripts and dependencies
3. Search for key patterns: entry points, routes, components
4. Identify the PROJECT TYPE:
   - MCP Server: Has @modelcontextprotocol dependencies
   - REST API: Express/Fastify/Hono with route handlers
   - React SPA: React with components, no server-side rendering
   - Next.js App: Next.js with app or pages directory
   - CLI Tool: Has bin entry in package.json
   - Library: Published package without app entry

## Tools Available
- searchCode: Search using ripgrep patterns
- readFile: Read file contents
- listDirectory: List directory structure
- getPackageInfo: Get package.json info

## Output Format
After exploration, output ONLY valid JSON with this exact structure:
{
  "projectContext": {
    "entryPoints": ["src/index.ts"],
    "keyDirectories": {"src/routes": "API routes"},
    "namingConventions": "camelCase files, PascalCase components",
    "projectType": "MCP Server"
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
  "possibleMissedTechnologies": ["Redis"]
}

Keep each guideline to 5-10 words max. Max 7 guidelines.`;

/**
 * Run the Codebase Analyst agent
 */
export async function runCodebaseAnalyst(
  model: LanguageModel,
  modelId: string,
  input: CodebaseAnalystInput,
  verbose: boolean = false
): Promise<CodebaseAnalysis | null> {
  const tools = createExplorationTools(input.projectRoot);

  const prompt = `Analyze this codebase and produce a structured analysis.

Project: ${input.projectRoot}

Start by exploring the directory structure and package.json, then produce your analysis as JSON.`;

  try {
    const result = await generateText({
      model,
      system: CODEBASE_ANALYST_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(12),
      maxOutputTokens: 3000,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
    });

    // Extract JSON from response
    const analysis = parseCodebaseAnalysis(result.text, result.steps, verbose);
    return analysis;
  } catch (error) {
    if (verbose) {
      logger.error(`Codebase Analyst error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

/**
 * Parse the codebase analysis from agent response
 */
function parseCodebaseAnalysis(
  text: string,
  steps: Array<{ text?: string }> | undefined,
  verbose: boolean
): CodebaseAnalysis | null {
  // Try to get text from the result or steps
  let textToParse = text;

  if (!textToParse || textToParse.trim() === '') {
    // Look through steps for text content
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
      logger.warn('Codebase Analyst: No text output found');
    }
    return null;
  }

  try {
    // Remove markdown code blocks if present
    let jsonText = textToParse;
    const jsonMatch = textToParse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // Find JSON object
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonText = objectMatch[0];
    }

    const parsed = JSON.parse(jsonText) as CodebaseAnalysis;

    // Validate required fields
    if (!parsed.projectContext || !parsed.commands) {
      if (verbose) {
        logger.warn('Codebase Analyst: Missing required fields in response');
      }
      return null;
    }

    // Ensure projectType is set
    if (!parsed.projectContext.projectType) {
      parsed.projectContext.projectType = 'Unknown';
    }

    return parsed;
  } catch (error) {
    if (verbose) {
      logger.warn(`Codebase Analyst: Failed to parse JSON - ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}
