/**
 * Orchestrator Agent
 * Coordinates the multi-agent analysis and merges results
 */

import { generateText, type LanguageModel } from 'ai';
import type {
  CodebaseAnalysis,
  StackResearch,
  MultiAgentAnalysis,
  McpRecommendations,
  OrchestratorInput,
} from './types.js';
import type { DetectedStack } from '../../scanner/types.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { parseJsonSafe } from '../../utils/json-repair.js';

/**
 * System prompt for the Orchestrator
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `You are an Orchestrator agent that merges analysis results into final recommendations.

Your job is to:
1. Review the codebase analysis and stack research
2. Recommend appropriate MCP servers for the stack
3. Produce a final merged recommendation

## MCP Server Selection Guidelines
Based on the detected stack, recommend these MCP servers:

**Always Essential:**
- filesystem: For file operations (all projects)
- git: For version control (all projects)

**By Project Type:**
- MCP Server: memory (for context)
- REST API: fetch (external APIs), postgres/sqlite (databases)
- React/Next.js: fetch (data fetching), memory (state persistence)
- CLI Tool: filesystem (primary), memory (caching)
- Library: git (versioning)

**By Technology:**
- Docker in use → docker MCP server
- PostgreSQL → postgres MCP server
- SQLite → sqlite MCP server
- AWS services → aws-kb-retrieval MCP server
- GitHub workflows → github MCP server

## Output Format
Output ONLY valid JSON:
{
  "mcpServers": {
    "essential": ["filesystem", "git"],
    "recommended": ["docker", "postgres"]
  }
}`;

/**
 * Run the Orchestrator to merge results and recommend MCP servers
 */
export async function runOrchestrator(
  model: LanguageModel,
  modelId: string,
  input: OrchestratorInput,
  verbose: boolean = false
): Promise<McpRecommendations> {
  const prompt = createOrchestratorPrompt(input);

  try {
    const result = await generateText({
      model,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 1000,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.2 }),
    });

    const mcpServers = parseMcpRecommendations(result.text, input.stack, verbose);
    return mcpServers;
  } catch (error) {
    if (verbose) {
      logger.error(`Orchestrator error: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Return default recommendations based on project type
    return getDefaultMcpRecommendations(input.codebaseAnalysis.projectContext.projectType, input.stack);
  }
}

/**
 * Create the orchestrator prompt
 */
function createOrchestratorPrompt(input: OrchestratorInput): string {
  const { codebaseAnalysis, stackResearch, stack } = input;

  // Summarize the stack
  const stackSummary: string[] = [];
  if (stack.framework) stackSummary.push(`Framework: ${stack.framework.name}`);
  if (stack.database) stackSummary.push(`Database: ${stack.database.name}`);
  if (stack.orm) stackSummary.push(`ORM: ${stack.orm.name}`);
  if (stack.deployment?.length) stackSummary.push(`Deployment: ${stack.deployment.map(d => d.name).join(', ')}`);
  if (stack.mcp?.isProject) stackSummary.push('This is an MCP Server project');

  return `Analyze these results and recommend MCP servers:

## Project Type
${codebaseAnalysis.projectContext.projectType}

## Detected Stack
${stackSummary.join('\n') || 'Unknown'}

## Testing Tools Identified
${stackResearch.testingTools.join(', ') || 'None identified'}

## Debugging Tools
${stackResearch.debuggingTools.join(', ') || 'None identified'}

Based on this analysis, recommend essential and optional MCP servers.
Output as JSON with "mcpServers" containing "essential" and "recommended" arrays.`;
}

/**
 * Parse MCP recommendations from orchestrator response
 */
function parseMcpRecommendations(
  text: string,
  stack: DetectedStack,
  verbose: boolean
): McpRecommendations {
  if (!text || text.trim() === '') {
    return getDefaultMcpRecommendations('Unknown', stack);
  }

  // Use safe JSON parser with repair capabilities
  const parsed = parseJsonSafe<{ mcpServers?: McpRecommendations }>(text);

  if (!parsed) {
    if (verbose) {
      logger.warn('Orchestrator: Failed to parse JSON response');
    }
    return getDefaultMcpRecommendations('Unknown', stack);
  }

  if (parsed.mcpServers) {
    return {
      essential: parsed.mcpServers.essential || ['filesystem', 'git'],
      recommended: parsed.mcpServers.recommended || [],
    };
  }

  return getDefaultMcpRecommendations('Unknown', stack);
}

/**
 * Get default MCP recommendations based on project type and stack
 */
function getDefaultMcpRecommendations(projectType: string, stack: DetectedStack): McpRecommendations {
  const essential: string[] = ['filesystem', 'git'];
  const recommended: string[] = [];

  // Add based on project type
  const lowerType = projectType.toLowerCase();

  if (lowerType.includes('mcp')) {
    recommended.push('memory');
  }

  if (lowerType.includes('api') || lowerType.includes('server')) {
    recommended.push('fetch');
  }

  // Add based on detected stack
  if (stack.database) {
    const dbName = stack.database.name.toLowerCase();
    if (dbName.includes('postgres')) {
      recommended.push('postgres');
    } else if (dbName.includes('sqlite')) {
      recommended.push('sqlite');
    }
  }

  if (stack.deployment?.some(d => d.name.toLowerCase().includes('docker'))) {
    recommended.push('docker');
  }

  // Add from existing MCP recommendations in stack
  if (stack.mcp?.recommended) {
    for (const rec of stack.mcp.recommended) {
      if (!essential.includes(rec) && !recommended.includes(rec)) {
        recommended.push(rec);
      }
    }
  }

  return { essential, recommended };
}

/**
 * Merge all agent results into a final MultiAgentAnalysis
 */
export function mergeAgentResults(
  codebaseAnalysis: CodebaseAnalysis,
  stackResearch: StackResearch,
  mcpServers: McpRecommendations
): MultiAgentAnalysis {
  return {
    codebaseAnalysis,
    stackResearch,
    mcpServers,
  };
}
