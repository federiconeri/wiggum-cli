/**
 * Agents Index (v0.5.0)
 * Simplified single-agent analysis with MCP detection
 *
 * Architecture:
 * Phase 1: Codebase Analyzer (unified agent with tools)
 * Phase 2: MCP Detection (pure function)
 *
 * This replaces the complex 4-phase multi-agent system (v0.4.5-v0.4.9)
 * which added overhead without improving output quality.
 */

// Types - export all for consumers
export type {
  // New architecture types (v0.5.0)
  CodebaseAnalyzerInput,
  RalphMcpServers,
  ProgressCallback,
  // Legacy types (backward compatibility)
  AnalysisPlan,
  EnrichedContext,
  TechResearchResult,
  EvaluationResult,
  ContextEnricherInput,
  TechResearcherInput,
  SynthesisInput,
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

// v0.5.0 exports
export { runCodebaseAnalyzer } from './codebase-analyzer.js';
export { detectRalphMcpServers, convertToLegacyMcpRecommendations } from './mcp-detector.js';
export { detectProjectType } from './stack-utils.js';

// Legacy exports (deprecated but kept for backward compatibility)
export { runPlanningOrchestrator } from './planning-orchestrator.js';
export { runContextEnricher } from './context-enricher.js';
export { runTechResearcher, runTechResearchPool } from './tech-researcher.js';
export { runSynthesisAgent } from './synthesis-agent.js';
export { runEvaluatorOptimizer } from './evaluator-optimizer.js';
export { runCodebaseAnalyst } from './codebase-analyst.js';
export { runStackResearcher } from './stack-researcher.js';
export { runOrchestrator, mergeAgentResults } from './orchestrator.js';

// Main orchestration
import type { LanguageModel } from 'ai';
import type { ScanResult } from '../../scanner/types.js';
import type {
  MultiAgentAnalysis,
  AgentOptions,
} from './types.js';
import { runCodebaseAnalyzer } from './codebase-analyzer.js';
import { detectProjectType } from './stack-utils.js';
import { detectRalphMcpServers, convertToLegacyMcpRecommendations } from './mcp-detector.js';
import { logger } from '../../utils/logger.js';

/**
 * Run simplified multi-agent analysis pipeline (v0.5.0)
 *
 * Phase 1: Codebase Analyzer - Single agent explores codebase with tools
 * Phase 2: MCP Detection - Pure function detects required MCP servers
 *
 * This simplified architecture reduces:
 * - Token cost: ~15,000 → ~5,000
 * - LLM calls: 7-11 → 2-3
 * - Agents: 7 → 1
 * - Failure points: Many → Few
 */
export async function runMultiAgentAnalysis(
  model: LanguageModel,
  modelId: string,
  scanResult: ScanResult,
  options: AgentOptions = {}
): Promise<MultiAgentAnalysis | null> {
  const { verbose = false, onProgress } = options;

  // Helper to report progress
  const report = (phase: string, detail?: string) => {
    if (onProgress) {
      onProgress(phase, detail);
    } else if (verbose) {
      logger.info(detail ? `${phase}: ${detail}` : phase);
    }
  };

  if (verbose && !onProgress) {
    logger.info('Starting simplified analysis (v0.5.0)...');
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Codebase Analyzer (unified agent)
    // ═══════════════════════════════════════════════════════════════
    report('Phase 1/2: Analyzing codebase');

    const result = await runCodebaseAnalyzer(
      model,
      modelId,
      { scanResult },
      verbose && !onProgress
    );

    report('Phase 1/2: Analyzing codebase', 'complete');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: MCP Detection (already done in analyzer, just report)
    // ═══════════════════════════════════════════════════════════════
    report('Phase 2/2: Detecting MCP servers');

    const mcpCount = result.mcpServers.essential.length + result.mcpServers.recommended.length;
    report('Phase 2/2: Detecting MCP servers', `${mcpCount} servers detected`);

    return result;
  } catch (error) {
    logger.error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);

    // Fall back to default result
    return getDefaultMultiAgentAnalysis(scanResult);
  }
}

/**
 * Get default analysis result when pipeline fails
 */
function getDefaultMultiAgentAnalysis(scanResult: ScanResult): MultiAgentAnalysis {
  const projectType = detectProjectType(scanResult.stack);
  const mcpServers = detectRalphMcpServers(scanResult.stack, projectType);

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
    mcpServers: convertToLegacyMcpRecommendations(mcpServers),
  };
}
