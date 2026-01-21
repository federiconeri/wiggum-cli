/**
 * Planning Orchestrator Agent (Phase 1)
 * Creates an analysis plan that guides the parallel workers
 */

import { type LanguageModel } from 'ai';
import { z } from 'zod';
import type { ScanResult } from '../../scanner/types.js';
import type { AnalysisPlan } from './types.js';
import { isReasoningModel } from '../providers.js';
import { logger } from '../../utils/logger.js';
import { getTracedAI } from '../../utils/tracing.js';

/**
 * Schema for the analysis plan output
 */
const analysisPlanSchema = z.object({
  areasToExplore: z.array(z.string()).describe('Key directories and files to explore'),
  technologiesToResearch: z.array(z.string()).describe('Technologies to research in depth'),
  questionsToAnswer: z.array(z.string()).describe('Specific questions that need answers'),
  estimatedComplexity: z.enum(['low', 'medium', 'high']).describe('Estimated project complexity'),
});

/**
 * System prompt for the Planning Orchestrator
 */
const PLANNING_ORCHESTRATOR_SYSTEM_PROMPT = `You are a senior software architect analyzing a codebase to create an analysis plan.

Based on the scan result, create a focused analysis plan that identifies:
1. Key areas to explore (directories, config files, entry points)
2. Technologies that need in-depth research (frameworks, libraries, tools)
3. Specific questions that need answers for implementation guidance

## Guidelines
- Focus on areas that would benefit from deeper exploration
- Identify technologies where best practices would be valuable
- Ask questions that would help an AI developer implement features correctly
- Keep lists focused (3-7 items each)
- Consider the project type when prioritizing areas

## Example Output
{
  "areasToExplore": ["src/", "config/", "lib/auth/"],
  "technologiesToResearch": ["Next.js 14", "Prisma", "NextAuth"],
  "questionsToAnswer": ["What is the authentication strategy?", "How is state managed?", "What testing patterns are used?"],
  "estimatedComplexity": "medium"
}`;

/**
 * Run the Planning Orchestrator to create an analysis plan
 */
export async function runPlanningOrchestrator(
  model: LanguageModel,
  modelId: string,
  scanResult: ScanResult,
  verbose: boolean = false
): Promise<AnalysisPlan> {
  // Build technology summary from scan result
  const technologies: string[] = [];
  const stack = scanResult.stack;

  if (stack.framework) technologies.push(stack.framework.name);
  if (stack.database) technologies.push(stack.database.name);
  if (stack.orm) technologies.push(stack.orm.name);
  if (stack.testing?.unit) technologies.push(stack.testing.unit.name);
  if (stack.testing?.e2e) technologies.push(stack.testing.e2e.name);
  if (stack.stateManagement) technologies.push(stack.stateManagement.name);
  if (stack.auth) technologies.push(stack.auth.name);
  if (stack.styling) technologies.push(stack.styling.name);
  if (stack.mcp?.isProject) technologies.push('MCP Server');

  const prompt = `Analyze this scan result and create an analysis plan:

Project: ${scanResult.projectRoot}
Framework: ${stack.framework?.name || 'Unknown'}
Database: ${stack.database?.name || 'None detected'}
Testing: ${stack.testing?.unit?.name || 'None detected'}
Package Manager: ${stack.packageManager?.name || 'npm'}
Detected Technologies: ${technologies.join(', ') || 'None'}
${stack.mcp?.isProject ? 'This is an MCP Server project.' : ''}

Create a focused analysis plan that will help understand this codebase.`;

  try {
    const { generateObject } = getTracedAI();

    const { object: plan } = await generateObject({
      model,
      schema: analysisPlanSchema,
      system: PLANNING_ORCHESTRATOR_SYSTEM_PROMPT,
      prompt,
      ...(isReasoningModel(modelId) ? {} : { temperature: 0.3 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'planning-orchestrator',
          projectRoot: scanResult.projectRoot,
          framework: stack.framework?.name || 'unknown',
        },
      },
    });

    if (verbose) {
      logger.info(`Planning Orchestrator: ${plan.areasToExplore.length} areas, ${plan.technologiesToResearch.length} techs, ${plan.questionsToAnswer.length} questions`);
    }

    return plan;
  } catch (error) {
    if (verbose) {
      logger.error(`Planning Orchestrator error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return a sensible default plan
    return getDefaultPlan(scanResult);
  }
}

/**
 * Get a default analysis plan when the orchestrator fails
 */
function getDefaultPlan(scanResult: ScanResult): AnalysisPlan {
  const stack = scanResult.stack;
  const technologies: string[] = [];

  if (stack.framework) technologies.push(stack.framework.name);
  if (stack.database) technologies.push(stack.database.name);
  if (stack.orm) technologies.push(stack.orm.name);
  if (stack.testing?.unit) technologies.push(stack.testing.unit.name);

  return {
    areasToExplore: ['src/', 'package.json'],
    technologiesToResearch: technologies.length > 0 ? technologies : ['TypeScript'],
    questionsToAnswer: [
      'What is the project structure?',
      'What are the main entry points?',
      'How are tests organized?',
    ],
    estimatedComplexity: 'medium',
  };
}
