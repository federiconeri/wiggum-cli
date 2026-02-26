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

    it('returns not_found when no status files exist', async () => {
      const result = await tools.checkLoopStatus.execute(
        { featureName: 'nonexistent-feature-xyz-123' },
        execCtx,
      );
      expect(result.status).toBe('not_found');
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

    it('passes --worktree and --model flags', async () => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.killed = false;
      proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);

      const promise = tools.runLoop.execute(
        { featureName: 'flag-test', worktree: true, model: 'opus' },
        execCtx,
      );

      setTimeout(() => proc.emit('close', 0, null), 10);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'wiggum',
        ['run', 'flag-test', '--worktree', '--model', 'opus'],
        expect.any(Object),
      );
    });
  });
});
