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
      model: z.string().optional().describe('Model override'),
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
