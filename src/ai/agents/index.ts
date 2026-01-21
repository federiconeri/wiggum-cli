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
  ProgressCallback,
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
  const { tavilyApiKey, context7ApiKey, verbose = false, onProgress } = options;

  // Helper to report progress (uses callback or falls back to logger)
  const report = (phase: string, detail?: string) => {
    if (onProgress) {
      onProgress(phase, detail);
    } else if (verbose) {
      logger.info(detail ? `${phase}: ${detail}` : phase);
    }
  };

  // Determine capabilities
  const capabilities: AgentCapabilities = {
    hasTavily: !!tavilyApiKey,
    hasContext7: !!context7ApiKey,
  };

  if (verbose && !onProgress) {
    logger.info('Starting multi-agent analysis (4-phase architecture)...');
    logger.info(`Capabilities: Tavily=${capabilities.hasTavily}, Context7=${capabilities.hasContext7}`);
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Planning Orchestrator
    // ═══════════════════════════════════════════════════════════════
    report('Phase 1/4: Planning');

    const plan = await runPlanningOrchestrator(model, modelId, scanResult, verbose && !onProgress);

    report('Phase 1/4: Planning', `${plan.areasToExplore.length} areas, ${plan.technologiesToResearch.length} technologies`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Parallel Workers
    // ═══════════════════════════════════════════════════════════════
    const workerCount = plan.technologiesToResearch.length + 1; // tech researchers + context enricher
    report('Phase 2/4: Analyzing', `${workerCount} parallel workers`);

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
        verbose && !onProgress
      ),
      runTechResearchPool(
        model,
        modelId,
        plan.technologiesToResearch,
        { tavilyApiKey, context7ApiKey },
        verbose && !onProgress
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

    report('Phase 2/4: Analyzing', 'complete');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Synthesis + MCP Detection
    // ═══════════════════════════════════════════════════════════════
    report('Phase 3/4: Synthesizing');

    // Detect MCPs (pure function, no LLM) - pass project type for context-aware recommendations
    const mcpServers = detectRalphMcpServers(scanResult.stack, enrichedContext.projectType);

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
      verbose && !onProgress
    );

    report('Phase 3/4: Synthesizing', 'complete');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: Evaluator-Optimizer QA Loop
    // ═══════════════════════════════════════════════════════════════
    report('Phase 4/4: Quality check');

    const finalResult = await runEvaluatorOptimizer(
      model,
      modelId,
      synthesizedResult,
      scanResult,
      2, // Max 2 iterations
      verbose && !onProgress
    );

    report('Phase 4/4: Quality check', 'complete');

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
      validationTools: ['npm run lint', 'npx tsc --noEmit'],
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
