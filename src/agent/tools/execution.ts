import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FEATURE_NAME_SCHEMA } from './schemas.js';

const SPEC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const LOOP_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

function killWithTimeout(proc: ChildProcess, timeoutMs: number): { timer: NodeJS.Timeout; didTimeout: () => boolean } {
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    proc.kill('SIGTERM');
    const escalation = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 5000);
    escalation.unref();
  }, timeoutMs);
  return { timer, didTimeout: () => fired };
}

export function createExecutionTools(projectRoot: string) {
  const generateSpec = tool({
    description: 'Generate a feature spec from a GitHub issue using the interview agent in headless mode. Returns the spec file path on success.',
    inputSchema: zodSchema(z.object({
      featureName: FEATURE_NAME_SCHEMA,
      issueNumber: z.number().int().describe('GitHub issue number to use as context'),
      goals: z.string().optional().describe('Feature goals description'),
      model: z.string().optional().describe('Model override (e.g. gpt-5.2-codex)'),
      provider: z.string().optional().describe('Provider override (anthropic, openai, openrouter)'),
    })),
    execute: async ({ featureName, issueNumber, goals, model, provider }, { abortSignal }) => {
      if (abortSignal?.aborted) return { success: false, error: 'Aborted' };

      return new Promise<{ success: boolean; specPath?: string; error?: string }>((resolve) => {
        const args = ['new', featureName, '--auto', '--issue', String(issueNumber)];
        if (goals) args.push('--goals', goals);
        if (model) args.push('--model', model);
        if (provider) args.push('--provider', provider);

        const proc = spawn('wiggum', args, { cwd: projectRoot, stdio: 'pipe', env: { ...process.env, RALPH_AUTOMATED: '1' } });
        const { timer, didTimeout } = killWithTimeout(proc, SPEC_TIMEOUT_MS);
        let stdout = '';
        let stderr = '';
        let aborted = false;
        let resolved = false;

        const onAbort = () => {
          aborted = true;
          proc.kill('SIGTERM');
        };
        abortSignal?.addEventListener('abort', onAbort, { once: true });

        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          abortSignal?.removeEventListener('abort', onAbort);
          if (aborted) {
            resolve({ success: false, error: 'Aborted' });
          } else if (didTimeout()) {
            resolve({ success: false, error: `Timed out after ${SPEC_TIMEOUT_MS / 60000}m` });
          } else if (code === 0) {
            const specPath = stdout.trim().split('\n').pop() ?? '';
            resolve({ success: true, specPath });
          } else {
            resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
          }
        });

        proc.on('error', (err) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          abortSignal?.removeEventListener('abort', onAbort);
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
    execute: async ({ featureName, worktree, model }, { abortSignal }) => {
      if (abortSignal?.aborted) return { status: 'aborted', error: 'Aborted', logPath: join(tmpdir(), `ralph-loop-${featureName}.log`) };

      return new Promise<{ status: string; iterations?: number; error?: string; logPath: string }>((resolve) => {
        const args = ['run', featureName];
        if (worktree) args.push('--worktree');
        if (model) args.push('--model', model);

        const logPath = join(tmpdir(), `ralph-loop-${featureName}.log`);
        const proc = spawn('wiggum', args, { cwd: projectRoot, stdio: 'pipe', env: { ...process.env, RALPH_AUTOMATED: '1' } });
        const { timer, didTimeout } = killWithTimeout(proc, LOOP_TIMEOUT_MS);
        let stderr = '';
        let aborted = false;
        let resolved = false;

        const onAbort = () => {
          aborted = true;
          proc.kill('SIGTERM');
        };
        abortSignal?.addEventListener('abort', onAbort, { once: true });

        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          abortSignal?.removeEventListener('abort', onAbort);
          const finalPath = join(tmpdir(), `ralph-loop-${featureName}.final`);
          if (aborted) {
            resolve({ status: 'aborted', error: 'Aborted', logPath });
          } else if (didTimeout()) {
            resolve({ status: 'timeout', error: `Timed out after ${LOOP_TIMEOUT_MS / 60000}m`, logPath });
          } else if (existsSync(finalPath)) {
            const parts = readFileSync(finalPath, 'utf-8').trim().split('|');
            resolve({
              status: parts[3] ?? (code === 0 ? 'done' : 'failed'),
              iterations: parseInt(parts[0], 10) || undefined,
              logPath,
            });
          } else {
            resolve({
              status: code === 0 ? 'done' : 'failed',
              error: stderr.trim() || undefined,
              logPath,
            });
          }
        });

        proc.on('error', (err) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          abortSignal?.removeEventListener('abort', onAbort);
          resolve({ status: 'error', error: err.message, logPath });
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
      const logPath = `${prefix}.log`;

      const finalPath = `${prefix}.final`;
      if (existsSync(finalPath)) {
        const parts = readFileSync(finalPath, 'utf-8').trim().split('|');
        return {
          status: parts[3] ?? 'unknown',
          iteration: parseInt(parts[0], 10) || undefined,
          maxIterations: parseInt(parts[1], 10) || undefined,
          timestamp: parts[2] ?? undefined,
          logPath,
        };
      }

      const phasesPath = `${prefix}.phases`;
      if (existsSync(phasesPath)) {
        const lines = readFileSync(phasesPath, 'utf-8').trim().split('\n');
        const lastLine = lines[lines.length - 1];
        return { status: 'running', lastPhase: lastLine, logPath };
      }

      if (existsSync(logPath)) {
        return { status: 'possibly_running', logPath };
      }

      return { status: 'not_found', logPath };
    },
  });

  return { generateSpec, runLoop, checkLoopStatus };
}
