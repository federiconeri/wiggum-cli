import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

import { createExecutionTools } from './execution.js';

describe('createExecutionTools', () => {
  const tools = createExecutionTools('/fake/root');
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  const testFinalPath = join(tmpdir(), 'ralph-loop-exec-test-feat.final');

  afterEach(() => {
    vi.clearAllMocks();
    if (existsSync(testFinalPath)) unlinkSync(testFinalPath);
  });

  describe('checkLoopStatus', () => {
    it('returns status from .final file', async () => {
      writeFileSync(testFinalPath, '3|10|2026-02-25T12:00:00Z|done');

      const result = await tools.checkLoopStatus.execute(
        { featureName: 'exec-test-feat' },
        execCtx,
      );
      expect(result.status).toBe('done');
      expect(result.iteration).toBe(3);
      expect(result.maxIterations).toBe(10);
    });

    it('returns not_found with logPath hint when no status files exist', async () => {
      const result = await tools.checkLoopStatus.execute(
        { featureName: 'nonexistent-feature-xyz-123' },
        execCtx,
      );
      expect(result.status).toBe('not_found');
      expect(result.logPath).toMatch(/ralph-loop-nonexistent-feature-xyz-123/);
    });

    it('returns possibly_running when only log file exists', async () => {
      const logPath = join(tmpdir(), 'ralph-loop-log-detect-test.log');
      writeFileSync(logPath, 'some log output\n');

      try {
        const result = await tools.checkLoopStatus.execute(
          { featureName: 'log-detect-test' },
          execCtx,
        );
        expect(result.status).toBe('possibly_running');
        expect(result.logPath).toBeDefined();
      } finally {
        unlinkSync(logPath);
      }
    });

    it('includes logPath in .final file result', async () => {
      writeFileSync(testFinalPath, '3|10|2026-02-25T12:00:00Z|done');

      const result = await tools.checkLoopStatus.execute(
        { featureName: 'exec-test-feat' },
        execCtx,
      );
      expect(result.logPath).toMatch(/ralph-loop-exec-test-feat/);
    });
  });

  describe('generateSpec', () => {
    function createFakeProc(code: number, stdout = '', stderr = '') {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn(() => { proc.killed = true; });

      setTimeout(() => {
        if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
        if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
        proc.emit('close', code, null);
      }, 10);

      return proc;
    }

    it('returns success with spec path on exit code 0', async () => {
      mockSpawn.mockReturnValue(createFakeProc(0, '/fake/root/.ralph/specs/my-feat.md\n'));

      const result = await tools.generateSpec.execute(
        { featureName: 'my-feat', issueNumber: 42 },
        execCtx,
      );

      expect(result.success).toBe(true);
      expect(result.specPath).toBe('/fake/root/.ralph/specs/my-feat.md');
      expect(mockSpawn).toHaveBeenCalledWith(
        'wiggum',
        ['new', 'my-feat', '--auto', '--issue', '42'],
        expect.objectContaining({ cwd: '/fake/root' }),
      );
    });

    it('passes goals when provided', async () => {
      mockSpawn.mockReturnValue(createFakeProc(0, 'path\n'));

      await tools.generateSpec.execute(
        { featureName: 'my-feat', issueNumber: 1, goals: 'Add auth' },
        execCtx,
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'wiggum',
        ['new', 'my-feat', '--auto', '--issue', '1', '--goals', 'Add auth'],
        expect.any(Object),
      );
    });

    it('returns error on non-zero exit code', async () => {
      mockSpawn.mockReturnValue(createFakeProc(1, '', 'Something broke'));

      const result = await tools.generateSpec.execute(
        { featureName: 'fail-feat', issueNumber: 99 },
        execCtx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something broke');
    });

    it('passes RALPH_AUTOMATED=1 env to subprocess', async () => {
      mockSpawn.mockReturnValue(createFakeProc(0, 'spec-path\n'));

      await tools.generateSpec.execute(
        { featureName: 'env-feat', issueNumber: 7 },
        execCtx,
      );

      expect(mockSpawn.mock.calls[0][2]?.env?.RALPH_AUTOMATED).toBe('1');
    });

    it('passes --model and --provider flags when provided', async () => {
      mockSpawn.mockReturnValue(createFakeProc(0, 'spec-path\n'));

      await tools.generateSpec.execute(
        { featureName: 'model-feat', issueNumber: 5, model: 'gpt-5.2-codex', provider: 'openai' },
        execCtx,
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'wiggum',
        ['new', 'model-feat', '--auto', '--issue', '5', '--model', 'gpt-5.2-codex', '--provider', 'openai'],
        expect.any(Object),
      );
    });

    it('omits --model and --provider when not provided', async () => {
      mockSpawn.mockReturnValue(createFakeProc(0, 'spec-path\n'));

      await tools.generateSpec.execute(
        { featureName: 'no-model', issueNumber: 3 },
        execCtx,
      );

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--model');
      expect(spawnArgs).not.toContain('--provider');
    });

    it('calls onProgress with stderr lines', async () => {
      const onProgress = vi.fn();
      const toolsWithProgress = createExecutionTools('/fake/root', { onProgress });

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = toolsWithProgress.generateSpec.execute(
        { featureName: 'progress-feat', issueNumber: 1 },
        execCtx,
      );

      setTimeout(() => {
        proc.stderr.emit('data', Buffer.from('Starting interview agent...\n'));
        proc.stdout.emit('data', Buffer.from('/fake/spec.md\n'));
        proc.emit('close', 0, null);
      }, 10);

      await promise;
      expect(onProgress).toHaveBeenCalledWith('generateSpec', 'Starting interview agent...');
    });

    it('returns error on spawn error', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.generateSpec.execute(
        { featureName: 'err-feat', issueNumber: 1 },
        execCtx,
      );

      setTimeout(() => proc.emit('error', new Error('ENOENT')), 10);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('ENOENT');
    });
  });

  describe('runLoop', () => {
    it('returns status from .final file on success', async () => {
      const finalPath = join(tmpdir(), 'ralph-loop-run-test.final');
      writeFileSync(finalPath, '5|10|2026-02-25T12:00:00Z|done');

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'run-test', worktree: true },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);

      const result = await promise;
      expect(result.status).toBe('done');
      expect(result.iterations).toBe(5);

      unlinkSync(finalPath);
    });

    it('passes RALPH_AUTOMATED=1 env to subprocess', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'env-test', worktree: false },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      await promise;

      expect(mockSpawn.mock.calls[0][2]?.env?.RALPH_AUTOMATED).toBe('1');
    });

    it('returns logPath in result', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'log-path-test', worktree: false },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      const result = await promise;

      expect(result.logPath).toMatch(/ralph-loop-log-path-test\.log$/);
    });

    it('passes --worktree flag', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'flag-test', worktree: true },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'wiggum',
        ['run', 'flag-test', '--worktree'],
        expect.any(Object),
      );
    });

    it('passes --review-mode flag when provided', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'review-test', worktree: true, reviewMode: 'auto' },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'wiggum',
        ['run', 'review-test', '--worktree', '--review-mode', 'auto'],
        expect.any(Object),
      );
    });

    it('omits --review-mode when not provided', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'no-review-test', worktree: false },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      await promise;

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--review-mode');
    });

    it('does not forward model or provider to loop', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'no-model-test', worktree: false },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      await promise;

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--model');
      expect(spawnArgs).not.toContain('--provider');
    });

    it('calls onProgress with stderr lines', async () => {
      const onProgress = vi.fn();
      const toolsWithProgress = createExecutionTools('/fake/root', { onProgress });

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = toolsWithProgress.runLoop.execute(
        { featureName: 'loop-progress', worktree: false },
        execCtx,
      );

      setTimeout(() => {
        proc.stderr.emit('data', Buffer.from('Iteration 1: Planning\nIteration 1: Implementation\n'));
        proc.emit('close', 0, null);
      }, 10);

      await promise;
      expect(onProgress).toHaveBeenCalledWith('runLoop', 'Iteration 1: Planning');
      expect(onProgress).toHaveBeenCalledWith('runLoop', 'Iteration 1: Implementation');
    });

  });
});
