/**
 * Agents Index
 * Multi-agent analysis with Orchestrator-Worker + Evaluator-Optimizer pattern
 *
 * Architecture:
 * Phase 1: Planning Orchestrator (creates analysis plan)
 * Phase 2: Parallel Workers (context enricher + tech researchers)
 * Phase 3: Synthesis (merge results + MCP detection)
 * Phase 4: Evaluator-Optimizer (QA loop)
 */

// Types - export all for consumers
export type {
  // New architecture types
  AnalysisPlan,
  EnrichedContext,
  TechResearchResult,
  RalphMcpServers,
  EvaluationResult,
  ContextEnricherInput,
  TechResearcherInput,
  SynthesisInput,
  // Legacy types (backward compatibility)
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

// New architecture exports
export { runPlanningOrchestrator } from './planning-orchestrator.js';
export { runContextEnricher } from './context-enricher.js';
export { runTechResearcher, runTechResearchPool } from './tech-researcher.js';
export { detectRalphMcpServers, convertToLegacyMcpRecommendations } from './mcp-detector.js';
export { runSynthesisAgent } from './synthesis-agent.js';
export { runEvaluatorOptimizer } from './evaluator-optimizer.js';
export { detectProjectType } from './stack-utils.js';

// Legacy exports (for backward compatibility during migration)
export { runCodebaseAnalyst } from './codebase-analyst.js';
export { runStackResearcher } from './stack-researcher.js';
export { runOrchestrator, mergeAgentResults } from './orchestrator.js';

// Main orchestration
import type { LanguageModel } from 'ai';
import type { ScanResult } from '../../scanner/types.js';
import type {
  MultiAgentAnalysis,
  AgentCapabilities,
  AgentOptions,
  EnrichedContext,
} from './types.js';
import { runPlanningOrchestrator } from './planning-orchestrator.js';
import { runContextEnricher } from './context-enricher.js';
import { runTechResearchPool } from './tech-researcher.js';
import { detectRalphMcpServers } from './mcp-detector.js';
import { runSynthesisAgent } from './synthesis-agent.js';
import { runEvaluatorOptimizer } from './evaluator-optimizer.js';
import { detectProjectType } from './stack-utils.js';
import { logger } from '../../utils/logger.js';

/**
 * Run the full multi-agent analysis pipeline (new architecture)
 *
 * Phase 1: Planning Orchestrator - Creates focused analysis plan
 * Phase 2: Parallel Workers - Context enricher + tech researchers run concurrently
 * Phase 3: Synthesis - Merges results + detects MCPs
 * Phase 4: Evaluator-Optimizer - QA loop (max 2 iterations)
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
    logger.info('Starting multi-agent analysis (4-phase architecture)...');
    logger.info(`Capabilities: Tavily=${capabilities.hasTavily}, Context7=${capabilities.hasContext7}`);
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Planning Orchestrator
    // ═══════════════════════════════════════════════════════════════
    if (verbose) {
      logger.info('Phase 1: Creating analysis plan...');
    }

    const plan = await runPlanningOrchestrator(model, modelId, scanResult, verbose);

    if (verbose) {
      logger.info(`Plan: ${plan.areasToExplore.length} areas, ${plan.technologiesToResearch.length} techs, complexity=${plan.estimatedComplexity}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Parallel Workers
    // ═══════════════════════════════════════════════════════════════
    if (verbose) {
      logger.info('Phase 2: Running parallel workers...');
    }

    // Run context enricher and tech researchers in parallel with error recovery
    const [contextResult, researchResult] = await Promise.allSettled([
      runContextEnricher(
        model,
        modelId,
        {
          scanResult,
          areasToExplore: plan.areasToExplore,
          questionsToAnswer: plan.questionsToAnswer,
        },
        verbose
      ),
      runTechResearchPool(
        model,
        modelId,
        plan.technologiesToResearch,
        { tavilyApiKey, context7ApiKey },
        verbose
      ),
    ]);

    // Extract results with fallbacks for failed workers
    const enrichedContext = contextResult.status === 'fulfilled'
      ? contextResult.value
      : getDefaultEnrichedContext(scanResult);

    const techResearch = researchResult.status === 'fulfilled'
      ? researchResult.value
      : [];

    // Log any worker failures
    if (contextResult.status === 'rejected') {
      logger.warn(`Context Enricher failed: ${contextResult.reason instanceof Error ? contextResult.reason.message : String(contextResult.reason)}`);
    }
    if (researchResult.status === 'rejected') {
      logger.warn(`Tech Research Pool failed: ${researchResult.reason instanceof Error ? researchResult.reason.message : String(researchResult.reason)}`);
    }

    if (verbose) {
      logger.info(`Context: ${enrichedContext.entryPoints.length} entry points, type=${enrichedContext.projectType}`);
      logger.info(`Research: ${techResearch.length} technologies researched`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Synthesis + MCP Detection
    // ═══════════════════════════════════════════════════════════════
    if (verbose) {
      logger.info('Phase 3: Synthesizing results...');
    }

    // Detect MCPs (pure function, no LLM)
    const mcpServers = detectRalphMcpServers(scanResult.stack);

    if (verbose) {
      logger.info(`MCPs: e2e=${mcpServers.e2eTesting}, db=${mcpServers.database || 'none'}, additional=${mcpServers.additional.length}`);
    }

    // Run synthesis agent
    const synthesizedResult = await runSynthesisAgent(
      model,
      modelId,
      {
        enrichedContext,
        techResearch,
        mcpServers,
        plan,
        stack: scanResult.stack,
      },
      verbose
    );

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: Evaluator-Optimizer QA Loop
    // ═══════════════════════════════════════════════════════════════
    if (verbose) {
      logger.info('Phase 4: Running QA evaluation...');
    }

    const finalResult = await runEvaluatorOptimizer(
      model,
      modelId,
      synthesizedResult,
      scanResult,
      2, // Max 2 iterations
      verbose
    );

    if (verbose) {
      logger.info('Multi-agent analysis complete (4-phase architecture)');
    }

    return finalResult;
  } catch (error) {
    logger.error(`Multi-agent analysis failed: ${error instanceof Error ? error.message : String(error)}`);

    // Fall back to default result
    return getDefaultMultiAgentAnalysis(scanResult);
  }
}

/**
 * Get default analysis result when pipeline fails
 */
function getDefaultMultiAgentAnalysis(scanResult: ScanResult): MultiAgentAnalysis {
  const projectType = detectProjectType(scanResult.stack);

  return {
    codebaseAnalysis: {
      projectContext: {
        entryPoints: ['src/index.ts'],
        keyDirectories: { src: 'Source code' },
        namingConventions: 'camelCase',
        projectType,
      },
      commands: {
        test: 'npm test',
        lint: 'npm run lint',
        build: 'npm run build',
        dev: 'npm run dev',
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
      testingTools: ['npm test'],
      debuggingTools: ['console.log'],
      documentationHints: ['Check official docs'],
      researchMode: 'knowledge-only',
    },
    mcpServers: {
      essential: ['filesystem', 'git', 'playwright'],
      recommended: [],
    },
  };
}

/**
 * Get default enriched context when Context Enricher fails
 */
function getDefaultEnrichedContext(scanResult: ScanResult): EnrichedContext {
  const projectType = detectProjectType(scanResult.stack);

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
