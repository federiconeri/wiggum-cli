import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { listRepoIssues, fetchGitHubIssue } from '../../utils/github.js';

export interface BacklogToolsOptions {
  defaultLabels?: string[];
}

export function createBacklogTools(owner: string, repo: string, options: BacklogToolsOptions = {}) {
  const listIssues = tool({
    description: 'List open GitHub issues from the backlog, optionally filtered by labels or milestone.',
    inputSchema: zodSchema(z.object({
      labels: z.array(z.string()).optional().describe('Filter by these labels (merged with configured defaults)'),
      milestone: z.string().optional().describe('Filter by milestone name'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max issues to return'),
    })),
    execute: async ({ labels, milestone, limit }) => {
      const parts: string[] = [];
      // Merge default labels with any the agent provides
      const allLabels = [...(options.defaultLabels ?? []), ...(labels ?? [])];
      const uniqueLabels = [...new Set(allLabels)];
      if (uniqueLabels.length) parts.push(...uniqueLabels.map(l => `label:${l}`));
      if (milestone) parts.push(`milestone:${milestone}`);
      const search = parts.length > 0 ? parts.join(' ') : undefined;

      const result = await listRepoIssues(owner, repo, search, limit);
      if (result.error) return { issues: [], error: result.error };
      return { issues: result.issues };
    },
  });

  const readIssue = tool({
    description: 'Read full details of a GitHub issue including body and labels.',
    inputSchema: zodSchema(z.object({
      issueNumber: z.number().int().min(1).describe('The issue number to read'),
    })),
    execute: async ({ issueNumber }) => {
      const detail = await fetchGitHubIssue(owner, repo, issueNumber);
      if (!detail) return { error: `Issue #${issueNumber} not found` };
      return detail;
    },
  });

  return { listIssues, readIssue };
}
