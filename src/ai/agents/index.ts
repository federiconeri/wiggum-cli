/**
 * Agents Index
 * Exports all agent types and functions
 */

// Types
export type {
  CodebaseAnalysis,
  StackResearch,
  McpRecommendations,
  MultiAgentAnalysis,
  AgentCapabilities,
  AgentOptions,
  CodebaseAnalystInput,
  StackResearcherInput,
  OrchestratorInput,
} from './types.js';

// Agents
export { runCodebaseAnalyst } from './codebase-analyst.js';
export { runStackResearcher } from './stack-researcher.js';
export { runOrchestrator, mergeAgentResults } from './orchestrator.js';

// Re-export for convenience
import type { LanguageModel } from 'ai';
import type { ScanResult, DetectedStack } from '../../scanner/types.js';
import type {
  MultiAgentAnalysis,
  AgentCapabilities,
  AgentOptions,
} from './types.js';
import { runCodebaseAnalyst } from './codebase-analyst.js';
import { runStackResearcher } from './stack-researcher.js';
import { runOrchestrator, mergeAgentResults } from './orchestrator.js';
import { logger } from '../../utils/logger.js';

/**
 * Run the full multi-agent analysis pipeline
 */
export async function runMultiAgentAnalysis(
  model: LanguageModel,
  modelId: string,
  scanResult: ScanResult,
  options: AgentOptions = {}
): Promise<MultiAgentAnalysis | null> {
  const { tavilyApiKey, context7ApiKey, verbose = false } = options;

  // Determine capabilities
  const capabilities: AgentCapabilities = {
    hasTavily: !!tavilyApiKey,
    hasContext7: !!context7ApiKey,
  };

  if (verbose) {
    logger.info('Starting multi-agent analysis...');
    logger.info(`Capabilities: Tavily=${capabilities.hasTavily}, Context7=${capabilities.hasContext7}`);
  }

  // Run Codebase Analyst
  if (verbose) {
    logger.info('Running Codebase Analyst...');
  }

  let codebaseAnalysis = await runCodebaseAnalyst(
    model,
    modelId,
    {
      scanResult,
      projectRoot: scanResult.projectRoot,
    },
    verbose
  );

  if (!codebaseAnalysis) {
    if (verbose) {
      logger.warn('Codebase Analyst failed, using defaults');
    }
    // Use defaults instead of aborting the pipeline
    codebaseAnalysis = getDefaultCodebaseAnalysis(scanResult);
  }

  // Run Stack Researcher
  if (verbose) {
    logger.info('Running Stack Researcher...');
  }

  const stackResearch = await runStackResearcher(
    model,
    modelId,
    {
      stack: scanResult.stack,
      projectType: codebaseAnalysis.projectContext.projectType,
      capabilities,
    },
    { tavilyApiKey, context7ApiKey },
    verbose
  );

  if (!stackResearch) {
    if (verbose) {
      logger.warn('Stack Researcher failed, using defaults');
    }
    // Continue with defaults - stack research is optional
  }

  // Run Orchestrator to merge results
  if (verbose) {
    logger.info('Running Orchestrator...');
  }

  const mcpServers = await runOrchestrator(
    model,
    modelId,
    {
      codebaseAnalysis,
      stackResearch: stackResearch || getDefaultStackResearch(),
      stack: scanResult.stack,
    },
    verbose
  );

  // Merge all results
  const finalResult = mergeAgentResults(
    codebaseAnalysis,
    stackResearch || getDefaultStackResearch(),
    mcpServers
  );

  if (verbose) {
    logger.info('Multi-agent analysis complete');
  }

  return finalResult;
}

/**
 * Get default codebase analysis when agent fails
 */
function getDefaultCodebaseAnalysis(scanResult: ScanResult) {
  // Detect project type from scan result
  let projectType = 'Unknown';
  if (scanResult.stack.mcp?.isProject) {
    projectType = 'MCP Server';
  } else if (scanResult.stack.framework?.name.includes('Next')) {
    projectType = 'Next.js App';
  } else if (scanResult.stack.framework?.name.includes('React')) {
    projectType = 'React SPA';
  } else if (scanResult.stack.framework?.name) {
    projectType = `${scanResult.stack.framework.name} Project`;
  }

  return {
    projectContext: {
      entryPoints: ['src/index.ts'],
      keyDirectories: { 'src': 'Source code' },
      namingConventions: 'camelCase',
      projectType,
    },
    commands: {
      test: 'npm test',
      lint: 'npm run lint',
      build: 'npm run build',
      dev: 'npm run dev',
    },
    implementationGuidelines: ['Follow existing patterns', 'Run tests after changes'],
    possibleMissedTechnologies: [],
  };
}

/**
 * Get default stack research when agent fails
 */
function getDefaultStackResearch() {
  return {
    bestPractices: ['Follow project conventions'],
    antiPatterns: ['Avoid skipping tests'],
    testingTools: ['npm test'],
    debuggingTools: ['console.log'],
    documentationHints: ['Check official docs'],
    researchMode: 'knowledge-only' as const,
  };
}
