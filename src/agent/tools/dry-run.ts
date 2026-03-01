import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { FEATURE_NAME_SCHEMA } from './schemas.js';

export function createDryRunExecutionTools() {
  const generateSpec = tool({
    description: '[DRY RUN] Simulates spec generation — returns a mock spec path without spawning any process.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      issueNumber: z.number().int().describe('GitHub issue number'),
      goals: z.string().optional().describe('Feature goals'),
      model: z.string().optional().describe('Model override'),
      provider: z.string().optional().describe('Provider override'),
    })),
    execute: async ({ featureName }) => ({
      success: true,
      specPath: `.ralph/specs/${featureName}.md`,
      dryRun: true,
    }),
  });

  const runLoop = tool({
    description: '[DRY RUN] Simulates running the dev loop — returns a mock result without spawning any process.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      worktree: z.boolean().default(true).describe('Use git worktree isolation'),
      reviewMode: z.enum(['manual', 'auto', 'merge']).optional().describe("Review mode: 'manual' (stop at PR), 'auto' (review, no merge), or 'merge' (review + merge)"),
      resume: z.boolean().default(false).describe('Resume a previous loop session'),
    })),
    execute: async () => ({
      status: 'done',
      iterations: 3,
      dryRun: true,
    }),
  });

  const checkLoopStatus = tool({
    description: '[DRY RUN] Simulates checking loop status.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
    })),
    execute: async () => ({
      status: 'done',
      iteration: 3,
      maxIterations: 10,
      dryRun: true,
    }),
  });

  return { generateSpec, runLoop, checkLoopStatus };
}

export function createDryRunReportingTools() {
  const commentOnIssue = tool({
    description: '[DRY RUN] Simulates posting a comment on a GitHub issue without actually posting.',
    inputSchema: zodSchema(z.object({
      issueNumber: z.number().int().describe('Issue number'),
      body: z.string().describe('Comment body'),
    })),
    execute: async ({ issueNumber, body }) => ({
      success: true,
      dryRun: true,
      wouldComment: { issueNumber, bodyLength: body.length },
    }),
  });

  const createTechDebtIssue = tool({
    description: '[DRY RUN] Simulates creating a tech debt issue without actually creating it.',
    inputSchema: zodSchema(z.object({
      title: z.string().describe('Issue title'),
      body: z.string().describe('Issue body'),
      labels: z.array(z.string()).default(['tech-debt']).describe('Labels'),
    })),
    execute: async ({ title }) => ({
      success: true,
      dryRun: true,
      wouldCreate: { title },
    }),
  });

  return { commentOnIssue, createTechDebtIssue };
}

export function createDryRunFeatureStateTools() {
  const assessFeatureState = tool({
    description: '[DRY RUN] Simulates assessing feature state — returns a mock start_fresh recommendation.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
    })),
    execute: async ({ featureName }) => ({
      featureName,
      branch: { exists: false, commitsAhead: 0 },
      spec: { exists: false },
      plan: { exists: false, totalTasks: 0, completedTasks: 0, completionPercent: 0 },
      pr: { exists: false },
      loopStatus: { hasStatusFiles: false },
      recommendation: 'start_fresh' as const,
      dryRun: true,
    }),
  });

  return { assessFeatureState };
}
