/**
 * Context Enricher Worker (Phase 2)
 * Explores the codebase to gather enriched context based on the analysis plan
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stepCountIs, type LanguageModel } from 'ai';
import type { ContextEnricherInput, EnrichedContext } from './types.js';
import { createExplorationTools } from '../tools.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';
import { getTracedAI } from '../../utils/tracing.js';
import { detectProjectType } from './stack-utils.js';

/**
 * System prompt for the Context Enricher worker
 */
const CONTEXT_ENRICHER_SYSTEM_PROMPT = `You are a Context Enricher worker. Your job is to explore specific areas of a codebase and discover ACTUAL file paths and structures.

## Your Mission
Based on the analysis plan, explore the codebase to:
1. Identify entry points and key files
2. Understand directory structure and purposes
3. Detect naming conventions
4. Find available commands (from package.json)
5. Answer the specific questions provided

## CRITICAL: You have a maximum of 6 tool calls before you MUST output JSON
- Call getPackageInfo (no field) FIRST - this returns bin, main, scripts
- Call listDirectory on root to see actual structure
- Maybe explore ONE key directory if needed
- After 3-4 tool calls, STOP exploring and OUTPUT your JSON
- Better to have partial info than no output at all

## Tools Available
- getPackageInfo: Get package.json info - call with NO field parameter to get bin, main, scripts all at once
- listDirectory: List directory structure
- readFile: Read file contents
- searchCode: Search using ripgrep patterns

## Exploration Strategy
1. Read package.json FIRST for main/bin entries - these are authoritative entry points
2. List root directory to discover actual structure (src/, app/, pages/, lib/, cmd/, etc.)
3. Explore ONE key directory to understand its purpose
4. Produce output - don't exhaustively explore

## Project Types & Entry Point Patterns
- MCP Server: Has @modelcontextprotocol deps → main field or src/index.ts
- REST API: Express/Fastify/Hono → main field, app.ts, server.ts, or src/
- Next.js App: next in deps → app/page.tsx, pages/index.tsx, or pages/_app.tsx
- CLI Tool: Has bin entry in package.json → use the bin paths directly
- Library: main/module fields → use those paths
- Python: main.py, app.py, or __main__.py at root
- Go: main.go or cmd/*/main.go

## CRITICAL: Output Requirements
- entryPoints: ONLY actual file paths you discovered
  - NEVER output instructions like "Check package.json..."
  - NEVER output suggestions like "If exists, use..."
  - Priority order for discovery:
    1. package.json "bin" field paths (for CLI tools)
    2. package.json "main" or "module" field paths
    3. Framework conventions (app/page.tsx, pages/index.tsx)
    4. Common patterns you find (index.ts, main.ts, app.ts)
  - If truly nothing found, use empty array [] - don't guess
- keyDirectories: ONLY directories that actually exist with their discovered purpose
  - First list root to find actual directories (don't assume src/ exists)
  - Map each real directory to its purpose based on file contents
  - Example: {"src/commands": "CLI commands", "app": "Next.js app router"}

## Architecture Discovery
Identify the data/control flow and include in answeredQuestions:
- For CLI tools: "CLI entry → command parser → handlers → output"
- For MCP servers: "Transport → request router → tool handlers → API client"
- For web apps: "Routes → controllers → services → database"
- For APIs: "HTTP server → middleware → routes → handlers → data layer"

## Output Format
Output ONLY valid JSON with discovered facts, not exploration instructions:
{
  "entryPoints": ["bin/cli.js", "dist/index.js"],
  "keyDirectories": {
    "src": "TypeScript source code",
    "bin": "CLI entry scripts",
    "lib": "Compiled output"
  },
  "namingConventions": "camelCase files, PascalCase components",
  "commands": {"test": "npm test", "build": "npm run build"},
  "answeredQuestions": {
    "What is the auth strategy?": "NextAuth with JWT",
    "architecture": "CLI parses commands via commander → calls API handlers → outputs results"
  },
  "projectType": "CLI Tool"
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
      stopWhen: stepCountIs(5), // Reduced from 7 to limit token consumption
      maxOutputTokens: 8000, // Increased to handle many parallel tool calls from GPT-5.1
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

    // Parse the response (pass input for fallback derivation)
    const context = parseEnrichedContext(result.text, result.steps, verbose, input);

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
  verbose: boolean,
  input?: ContextEnricherInput
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
    return getDefaultEnrichedContext(input);
  }

  // Use safe JSON parser with repair capabilities
  const parsed = parseJsonSafe<Partial<EnrichedContext>>(textToParse);

  if (!parsed) {
    if (verbose) {
      logger.warn('Context Enricher: Failed to parse JSON response');
    }
    return getDefaultEnrichedContext(input);
  }

  // Derive commands from package.json as fallback if AI didn't find them
  const derivedCommands = input ? deriveCommandsFromScripts(input.scanResult.projectRoot) : {};
  const commands = parsed.commands && Object.keys(parsed.commands).length > 0
    ? parsed.commands
    : derivedCommands;

  // Build result with empty defaults for missing fields (don't guess)
  return {
    entryPoints: parsed.entryPoints || [],  // Empty = not found, not guessed
    keyDirectories: parsed.keyDirectories || {},  // Empty = not found
    namingConventions: parsed.namingConventions || 'unknown',
    commands,  // Derived from package.json if AI didn't find them
    answeredQuestions: parsed.answeredQuestions || {},
    projectType: parsed.projectType || 'Unknown',
  };
}

/**
 * Script name patterns for command detection
 * Exported for testing
 */
export const SCRIPT_MAPPINGS: Record<string, string[]> = {
  test: ['test', 'test:unit', 'vitest', 'jest'],
  lint: ['lint', 'eslint', 'lint:fix'],
  typecheck: ['typecheck', 'tsc', 'type-check', 'types'],
  build: ['build', 'compile'],
  dev: ['dev', 'start:dev', 'develop', 'watch'],
  format: ['format', 'prettier', 'fmt'],
};

/**
 * Derive commands from package.json scripts when AI fails to discover them
 * Exported for testing
 */
export function deriveCommandsFromScripts(projectRoot: string): Record<string, string> {
  const commands: Record<string, string> = {};
  const packageJsonPath = join(projectRoot, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return commands;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string> | undefined;

    if (!scripts) {
      return commands;
    }

    for (const [command, patterns] of Object.entries(SCRIPT_MAPPINGS)) {
      for (const pattern of patterns) {
        if (scripts[pattern]) {
          commands[command] = `npm run ${pattern}`;
          break;
        }
      }
    }
    return commands;
  } catch {
    return commands;
  }
}

/**
 * Derive entry points from package.json when AI fails to discover them
 */
function deriveEntryPointsFromPackageJson(projectRoot: string): string[] {
  const entryPoints: string[] = [];
  const packageJsonPath = join(projectRoot, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return entryPoints;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as Record<string, unknown>;

    // CLI tools: use bin field
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        entryPoints.push(pkg.bin);
      } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
        entryPoints.push(...Object.values(pkg.bin as Record<string, string>));
      }
    }

    // Libraries: use main/module fields
    if (typeof pkg.main === 'string') {
      entryPoints.push(pkg.main);
    }
    if (typeof pkg.module === 'string') {
      entryPoints.push(pkg.module);
    }

    // Filter out compiled output (dist/) and dedupe
    return [...new Set(entryPoints.filter(ep => ep && !ep.startsWith('dist/')))];
  } catch {
    return entryPoints;
  }
}

/**
 * Get default enriched context when parsing fails
 * Returns empty arrays instead of guesses, but derives entry points and commands from package.json
 */
function getDefaultEnrichedContext(input?: ContextEnricherInput): EnrichedContext {
  const projectType = detectProjectType(input?.scanResult.stack);
  const entryPoints = input ? deriveEntryPointsFromPackageJson(input.scanResult.projectRoot) : [];
  const commands = input ? deriveCommandsFromScripts(input.scanResult.projectRoot) : {};

  return {
    entryPoints,  // Derived from package.json, not guessed
    keyDirectories: {},  // Empty = not discovered
    namingConventions: 'unknown',
    commands,  // Derived from package.json scripts
    answeredQuestions: {},
    projectType,
  };
}
