import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';

function ghExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: 15000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

export function createReportingTools(owner: string, repo: string) {
  const commentOnIssue = tool({
    description: 'Post a status comment on a GitHub issue.',
    inputSchema: zodSchema(z.object({
      issueNumber: z.number().int().describe('Issue number to comment on'),
      body: z.string().describe('Comment body in markdown'),
    })),
    execute: async ({ issueNumber, body }) => {
      try {
        await ghExec([
          'issue', 'comment', String(issueNumber),
          '--repo', `${owner}/${repo}`,
          '--body', body,
        ]);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  const createTechDebtIssue = tool({
    description: 'Create a new GitHub issue for tech debt discovered during development.',
    inputSchema: zodSchema(z.object({
      title: z.string().describe('Issue title'),
      body: z.string().describe('Issue body in markdown'),
      labels: z.array(z.string()).default(['tech-debt']).describe('Labels to apply'),
    })),
    execute: async ({ title, body, labels }) => {
      try {
        const args = [
          'issue', 'create',
          '--repo', `${owner}/${repo}`,
          '--title', title,
          '--body', body,
        ];
        for (const label of labels) {
          args.push('--label', label);
        }
        const stdout = await ghExec(args);
        const url = stdout.trim();
        const match = url.match(/\/(\d+)\s*$/);
        return {
          success: true,
          issueNumber: match ? parseInt(match[1], 10) : undefined,
          url,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  const closeIssue = tool({
    description: 'Close a GitHub issue. Use after verifying the work is actually shipped (PR merged, code on main).',
    inputSchema: zodSchema(z.object({
      issueNumber: z.number().int().describe('Issue number to close'),
      comment: z.string().optional().describe('Optional closing comment'),
    })),
    execute: async ({ issueNumber, comment }) => {
      try {
        const args = [
          'issue', 'close', String(issueNumber),
          '--repo', `${owner}/${repo}`,
        ];
        if (comment) args.push('--comment', comment);
        await ghExec(args);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  return { commentOnIssue, createTechDebtIssue, closeIssue };
}
