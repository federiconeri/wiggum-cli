import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SPEC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const LOOP_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const FEATURE_NAME_SCHEMA = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).max(100)
  .describe('Feature name (alphanumeric, hyphens, underscores)');

function killWithTimeout(proc: ChildProcess, timeoutMs: number): NodeJS.Timeout {
  return setTimeout(() => {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 5000);
  }, timeoutMs);
}

export function createExecutionTools(projectRoot: string) {
  const generateSpec = tool({
    description: 'Generate a feature spec from a GitHub issue using the interview agent in headless mode. Returns the spec file path on success.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      issueNumber: z.number().int().describe('GitHub issue number to use as context'),
      goals: z.string().optional().describe('Feature goals description'),
    })),
    execute: async ({ featureName, issueNumber, goals }) => {
      return new Promise<{ success: boolean; specPath?: string; error?: string }>((resolve) => {
        const args = ['new', featureName, '--auto', '--issue', String(issueNumber)];
        if (goals) args.push('--goals', goals);

        const proc = spawn('wiggum', args, { cwd: projectRoot, stdio: 'pipe' });
        const timer = killWithTimeout(proc, SPEC_TIMEOUT_MS);
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code, signal) => {
          clearTimeout(timer);
          if (signal === 'SIGTERM' || signal === 'SIGKILL') timedOut = true;
          if (timedOut) {
            resolve({ success: false, error: `Timed out after ${SPEC_TIMEOUT_MS / 60000}m` });
          } else if (code === 0) {
            const specPath = stdout.trim().split('\n').pop() ?? '';
            resolve({ success: true, specPath });
          } else {
            resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          resolve({ success: false, error: err.message });
        });
      });
    },
  });

  const runLoop = tool({
    description: 'Run the development loop for a feature. Spawns a background process and returns when complete.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      worktree: z.boolean().default(true).describe('Use git worktree isolation'),
      model: z.string().optional().describe('Model override for the loop'),
    })),
    execute: async ({ featureName, worktree, model }) => {
      return new Promise<{ status: string; iterations?: number; error?: string }>((resolve) => {
        const args = ['run', featureName];
        if (worktree) args.push('--worktree');
        if (model) args.push('--model', model);

        const proc = spawn('wiggum', args, { cwd: projectRoot, stdio: 'pipe' });
        const timer = killWithTimeout(proc, LOOP_TIMEOUT_MS);
        let stderr = '';
        let timedOut = false;

        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code, signal) => {
          clearTimeout(timer);
          if (signal === 'SIGTERM' || signal === 'SIGKILL') timedOut = true;
          const finalPath = join(tmpdir(), `ralph-loop-${featureName}.final`);
          if (timedOut) {
            resolve({ status: 'timeout', error: `Timed out after ${LOOP_TIMEOUT_MS / 60000}m` });
          } else if (existsSync(finalPath)) {
            const parts = readFileSync(finalPath, 'utf-8').trim().split('|');
            resolve({
              status: parts[3] ?? (code === 0 ? 'done' : 'failed'),
              iterations: parseInt(parts[0], 10) || undefined,
            });
          } else {
            resolve({
              status: code === 0 ? 'done' : 'failed',
              error: stderr.trim() || undefined,
            });
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          resolve({ status: 'error', error: err.message });
        });
      });
    },
  });

  const checkLoopStatus = tool({
    description: 'Check the current status of a running or completed development loop.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
    })),
    execute: async ({ featureName }) => {
      const prefix = join(tmpdir(), `ralph-loop-${featureName}`);

      const finalPath = `${prefix}.final`;
      if (existsSync(finalPath)) {
        const parts = readFileSync(finalPath, 'utf-8').trim().split('|');
        return {
          status: parts[3] ?? 'unknown',
          iteration: parseInt(parts[0], 10) || undefined,
          maxIterations: parseInt(parts[1], 10) || undefined,
          timestamp: parts[2] ?? undefined,
        };
      }

      const phasesPath = `${prefix}.phases`;
      if (existsSync(phasesPath)) {
        const lines = readFileSync(phasesPath, 'utf-8').trim().split('\n');
        const lastLine = lines[lines.length - 1];
        return { status: 'running', lastPhase: lastLine };
      }

      return { status: 'not_found' };
    },
  });

  return { generateSpec, runLoop, checkLoopStatus };
}
