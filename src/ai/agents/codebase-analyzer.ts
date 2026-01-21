/**
 * Unified Codebase Analyzer (v0.5.0)
 * Single agent that explores codebase and produces full analysis
 * Replaces: planning-orchestrator + context-enricher + tech-researchers + synthesis-agent
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stepCountIs, type LanguageModel } from 'ai';
import type { ScanResult } from '../../scanner/types.js';
import type { MultiAgentAnalysis, CodebaseAnalysis, StackResearch, RalphMcpServers } from './types.js';
import { createExplorationTools } from '../tools.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';
import { getTracedAI } from '../../utils/tracing.js';
import { detectProjectType } from './stack-utils.js';
import { detectRalphMcpServers, convertToLegacyMcpRecommendations } from './mcp-detector.js';
import { deriveCommandsFromScripts } from './context-enricher.js';

/**
 * Input for the Codebase Analyzer
 */
export interface CodebaseAnalyzerInput {
  scanResult: ScanResult;
}

/**
 * Internal schema for analyzer output (before conversion to MultiAgentAnalysis)
 */
interface AnalyzerOutput {
  entryPoints: string[];
  keyDirectories: Record<string, string>;
  projectType: string;
  namingConventions: string;
  architectureFlow: string;
  implementationGuidelines: string[];
  technologyNotes: {
    testingApproach: string;
    buildSystem: string;
    keyPatterns: string[];
  };
}

/**
 * System prompt for the unified Codebase Analyzer
 */
const CODEBASE_ANALYZER_SYSTEM_PROMPT = `You are a Codebase Analyzer. Your job is to explore a codebase and produce a complete analysis for AI-assisted development.

## Your Mission
Explore the codebase with tools to discover:
1. Entry points (actual file paths from package.json bin/main/module)
2. Key directories and their purposes
3. Project type (CLI, MCP Server, Web App, Library, API)
4. Implementation patterns actually used in the code
5. Architecture flow (how data/control flows through the system)

## CRITICAL: Tool Usage Limits
- You have a MAXIMUM of 8 tool calls before you MUST output JSON
- Call getPackageInfo (no field) FIRST to get bin, main, scripts
- Call listDirectory on root to see actual structure
- Explore 1-2 key directories if needed
- After 5-6 tool calls, STOP exploring and OUTPUT your JSON

## Tools Available
- getPackageInfo: Get package.json info - call with NO field parameter first
- listDirectory: List directory structure
- readFile: Read file contents (use sparingly)
- searchCode: Search using ripgrep patterns (use sparingly)

## Project Types & Entry Point Patterns
- MCP Server: Has @modelcontextprotocol deps → main field or src/index.ts
- CLI Tool: Has bin entry in package.json → use bin paths directly
- Next.js App: next in deps → app/page.tsx or pages/index.tsx
- REST API: Express/Fastify/Hono → main field, app.ts, or server.ts
- Library: main/module fields → use those paths

## Output Requirements
- entryPoints: ONLY actual file paths discovered (never instructions)
  - Priority: bin > main > module > framework conventions
  - If nothing found, output empty array []
- keyDirectories: ONLY directories that actually exist with purposes
- implementationGuidelines: Describe DISCOVERED patterns (5-10 words each)
  - Format: "[Pattern/Tool] for [purpose]"
  - Examples: "Vitest configured for unit testing", "Zod schemas in src/schemas"
  - NOT instructions like "Run npm test"
- architectureFlow: Describe data/control flow
  - CLI: "CLI entry → command parser → handlers → output"
  - MCP: "Transport → request router → tool handlers → response"
  - API: "HTTP server → middleware → routes → handlers → data"

## Output Format
Output ONLY valid JSON:
{
  "entryPoints": ["bin/cli.js", "src/index.ts"],
  "keyDirectories": {
    "src/commands": "CLI command implementations",
    "src/handlers": "Request handlers"
  },
  "projectType": "CLI Tool",
  "namingConventions": "camelCase files, PascalCase components",
  "architectureFlow": "CLI parses args → routes to commands → handlers process → output formatted",
  "implementationGuidelines": [
    "Vitest configured for unit testing (npm test)",
    "TypeScript strict mode enabled",
    "Commander for CLI argument parsing",
    "Zod for input validation"
  ],
  "technologyNotes": {
    "testingApproach": "Vitest with coverage",
    "buildSystem": "tsup for bundling",
    "keyPatterns": ["Command pattern for CLI", "Dependency injection"]
  }
}`;

/**
 * Run the unified Codebase Analyzer
 */
export async function runCodebaseAnalyzer(
  model: LanguageModel,
  modelId: string,
  input: CodebaseAnalyzerInput,
  verbose: boolean = false
): Promise<MultiAgentAnalysis> {
  const tools = createExplorationTools(input.scanResult.projectRoot);
  const stack = input.scanResult.stack;

  // Build technology summary for context
  const technologies: string[] = [];
  if (stack.framework) technologies.push(stack.framework.name);
  if (stack.database) technologies.push(stack.database.name);
  if (stack.orm) technologies.push(stack.orm.name);
  if (stack.testing?.unit) technologies.push(stack.testing.unit.name);
  if (stack.testing?.e2e) technologies.push(stack.testing.e2e.name);
  if (stack.mcp?.isProject) technologies.push('MCP Server');

  const prompt = `Analyze this codebase and produce a complete analysis.

Project: ${input.scanResult.projectRoot}

## Already Detected (from scanner)
Framework: ${stack.framework?.name || 'Unknown'}
Database: ${stack.database?.name || 'None detected'}
Testing: ${stack.testing?.unit?.name || 'None detected'}
Package Manager: ${stack.packageManager?.name || 'npm'}
Technologies: ${technologies.join(', ') || 'None'}
${stack.mcp?.isProject ? 'This is an MCP Server project.' : ''}

Start by calling getPackageInfo() to discover entry points, then explore the structure.
After exploring, output your complete analysis as JSON.`;

  try {
    const { generateText } = getTracedAI();

    const MAX_TOOL_CALLS = 10;

    const result = await generateText({
      model,
      system: CODEBASE_ANALYZER_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(12), // Allow steps for tool calls + JSON output
      maxOutputTokens: 4000,
      prepareStep: ({ steps }) => {
        const totalToolCalls = steps.reduce(
          (sum, step) => sum + (step.toolCalls?.length || 0),
          0
        );

        if (totalToolCalls >= MAX_TOOL_CALLS) {
          if (verbose) {
            logger.info(`Codebase Analyzer: ${totalToolCalls} tool calls, disabling tools`);
          }
          return { activeTools: [], toolChoice: 'none' as const };
        }

        return {};
      },
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'codebase-analyzer',
          projectRoot: input.scanResult.projectRoot,
          framework: stack.framework?.name || 'unknown',
        },
      },
    });

    // Parse the response
    const analyzerOutput = parseAnalyzerOutput(result.text, result.steps, verbose, input);

    // Detect MCP servers (pure function)
    const mcpServers = detectRalphMcpServers(stack, analyzerOutput.projectType);

    // Build full MultiAgentAnalysis
    return buildMultiAgentAnalysis(analyzerOutput, mcpServers, input);
  } catch (error) {
    if (verbose) {
      logger.error(`Codebase Analyzer error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return default analysis with derived data from package.json
    return getDefaultMultiAgentAnalysis(input.scanResult);
  }
}

/**
 * Parse analyzer output from response text
 */
function parseAnalyzerOutput(
  text: string,
  steps: Array<{ text?: string }> | undefined,
  verbose: boolean,
  input: CodebaseAnalyzerInput
): AnalyzerOutput {
  let textToParse = text;

  // Try to get text from steps if main text is empty
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
      logger.warn('Codebase Analyzer: No text output found');
    }
    return getDefaultAnalyzerOutput(input);
  }

  const parsed = parseJsonSafe<Partial<AnalyzerOutput>>(textToParse);

  if (!parsed) {
    if (verbose) {
      logger.warn('Codebase Analyzer: Failed to parse JSON response');
    }
    return getDefaultAnalyzerOutput(input);
  }

  // Derive commands and entry points from package.json as fallback
  const derivedCommands = deriveCommandsFromScripts(input.scanResult.projectRoot);
  const derivedEntryPoints = deriveEntryPointsFromPackageJson(input.scanResult.projectRoot);

  return {
    entryPoints: parsed.entryPoints?.length ? parsed.entryPoints : derivedEntryPoints,
    keyDirectories: parsed.keyDirectories || {},
    projectType: parsed.projectType || detectProjectType(input.scanResult.stack),
    namingConventions: parsed.namingConventions || 'unknown',
    architectureFlow: parsed.architectureFlow || '',
    implementationGuidelines: parsed.implementationGuidelines || [],
    // Normalize technologyNotes to ensure all fields have defaults (handles partial objects)
    technologyNotes: {
      testingApproach: parsed.technologyNotes?.testingApproach || derivedCommands.test || 'npm test',
      buildSystem: parsed.technologyNotes?.buildSystem || derivedCommands.build || 'npm run build',
      keyPatterns: Array.isArray(parsed.technologyNotes?.keyPatterns) ? parsed.technologyNotes.keyPatterns : [],
    },
  };
}

/**
 * Build MultiAgentAnalysis from analyzer output
 */
function buildMultiAgentAnalysis(
  output: AnalyzerOutput,
  mcpServers: RalphMcpServers,
  input: CodebaseAnalyzerInput
): MultiAgentAnalysis {
  const derivedCommands = deriveCommandsFromScripts(input.scanResult.projectRoot);

  const codebaseAnalysis: CodebaseAnalysis = {
    projectContext: {
      entryPoints: output.entryPoints,
      keyDirectories: output.keyDirectories,
      namingConventions: output.namingConventions,
      projectType: output.projectType,
    },
    commands: {
      test: derivedCommands.test,
      lint: derivedCommands.lint,
      typecheck: derivedCommands.typecheck,
      build: derivedCommands.build,
      dev: derivedCommands.dev,
      format: derivedCommands.format,
    },
    implementationGuidelines: output.implementationGuidelines.length > 0
      ? output.implementationGuidelines
      : getDefaultGuidelines(output, derivedCommands),
    possibleMissedTechnologies: [],
  };

  // Add architecture flow to guidelines if present
  if (output.architectureFlow && !codebaseAnalysis.implementationGuidelines.some(g => g.includes('→'))) {
    codebaseAnalysis.implementationGuidelines.unshift(`Architecture: ${output.architectureFlow}`);
  }

  const stackResearch: StackResearch = {
    bestPractices: output.technologyNotes.keyPatterns.length > 0
      ? output.technologyNotes.keyPatterns
      : ['Follow project conventions'],
    antiPatterns: ['Avoid skipping tests'],
    testingTools: [output.technologyNotes.testingApproach || derivedCommands.test || 'npm test'],
    debuggingTools: ['console.log', 'debugger'],
    validationTools: [derivedCommands.lint || 'npm run lint', derivedCommands.typecheck || 'npx tsc --noEmit'].filter(Boolean),
    documentationHints: ['Check official docs'],
    researchMode: 'knowledge-only',
  };

  return {
    codebaseAnalysis,
    stackResearch,
    mcpServers: convertToLegacyMcpRecommendations(mcpServers),
  };
}

/**
 * Derive entry points from package.json
 * Exported for testing
 */
export function deriveEntryPointsFromPackageJson(projectRoot: string): string[] {
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
 * Get default analyzer output when parsing fails
 */
function getDefaultAnalyzerOutput(input: CodebaseAnalyzerInput): AnalyzerOutput {
  const projectType = detectProjectType(input.scanResult.stack);
  const entryPoints = deriveEntryPointsFromPackageJson(input.scanResult.projectRoot);
  const commands = deriveCommandsFromScripts(input.scanResult.projectRoot);

  return {
    entryPoints,
    keyDirectories: {},
    projectType,
    namingConventions: 'unknown',
    architectureFlow: '',
    implementationGuidelines: [],
    technologyNotes: {
      testingApproach: commands.test || 'npm test',
      buildSystem: commands.build || 'npm run build',
      keyPatterns: [],
    },
  };
}

/**
 * Get default implementation guidelines
 */
function getDefaultGuidelines(output: AnalyzerOutput, commands: Record<string, string>): string[] {
  const guidelines: string[] = [];

  if (commands.test) {
    guidelines.push(`Testing with ${commands.test}`);
  }

  if (commands.build) {
    guidelines.push(`Build using ${commands.build}`);
  }

  if (commands.lint) {
    guidelines.push(`Linting with ${commands.lint}`);
  }

  guidelines.push('Follow existing code patterns');
  guidelines.push('TypeScript strict mode recommended');

  return guidelines.slice(0, 7);
}

/**
 * Get default MultiAgentAnalysis when analyzer fails completely
 */
function getDefaultMultiAgentAnalysis(scanResult: ScanResult): MultiAgentAnalysis {
  const projectType = detectProjectType(scanResult.stack);
  const entryPoints = deriveEntryPointsFromPackageJson(scanResult.projectRoot);
  const commands = deriveCommandsFromScripts(scanResult.projectRoot);
  const mcpServers = detectRalphMcpServers(scanResult.stack, projectType);

  return {
    codebaseAnalysis: {
      projectContext: {
        entryPoints: entryPoints.length > 0 ? entryPoints : ['src/index.ts'],
        keyDirectories: { src: 'Source code' },
        namingConventions: 'camelCase',
        projectType,
      },
      commands: {
        test: commands.test || 'npm test',
        lint: commands.lint || 'npm run lint',
        build: commands.build || 'npm run build',
        dev: commands.dev || 'npm run dev',
      },
      implementationGuidelines: [
        'Follow existing patterns',
        'Run tests after changes',
        'Use TypeScript strict mode',
      ],
      possibleMissedTechnologies: [],
    },
    stackResearch: {
      bestPractices: ['Follow project conventions'],
      antiPatterns: ['Avoid skipping tests'],
      testingTools: [commands.test || 'npm test'],
      debuggingTools: ['console.log'],
      validationTools: [commands.lint || 'npm run lint', 'npx tsc --noEmit'],
      documentationHints: ['Check official docs'],
      researchMode: 'knowledge-only',
    },
    mcpServers: convertToLegacyMcpRecommendations(mcpServers),
  };
}
