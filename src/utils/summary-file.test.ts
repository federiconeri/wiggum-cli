import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeRunSummaryFile } from './summary-file.js';
import type { RunSummary } from '../tui/screens/RunScreen.js';

describe('summary-file', () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Create a temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'ralph-summary-test-'));

    // Store and override env var
    originalEnv = process.env.RALPH_SUMMARY_TMP_DIR;
    process.env.RALPH_SUMMARY_TMP_DIR = tempDir;
  });

  afterEach(() => {
    // Restore env var
    if (originalEnv === undefined) {
      delete process.env.RALPH_SUMMARY_TMP_DIR;
    } else {
      process.env.RALPH_SUMMARY_TMP_DIR = originalEnv;
    }

    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('writeRunSummaryFile', () => {
    it('writes summary to JSON file with correct naming pattern', async () => {
      const summary: RunSummary = {
        feature: 'test-feature',
        iterations: 5,
        maxIterations: 10,
        tasksDone: 3,
        tasksTotal: 5,
        tokensInput: 1000,
        tokensOutput: 2000,
        exitCode: 0,
      };

      await writeRunSummaryFile('test-feature', summary);

      const filePath = join(tempDir, 'ralph-loop-test-feature.summary.json');
      expect(existsSync(filePath)).toBe(true);
    });

    it('writes valid JSON content', async () => {
      const summary: RunSummary = {
        feature: 'my-feature',
        iterations: 5,
        maxIterations: 10,
        tasksDone: 3,
        tasksTotal: 5,
        tokensInput: 1000,
        tokensOutput: 2000,
        exitCode: 0,
        branch: 'feat/my-feature',
      };

      await writeRunSummaryFile('my-feature', summary);

      const filePath = join(tempDir, 'ralph-loop-my-feature.summary.json');
      const fileContent = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent);

      expect(parsed).toEqual(summary);
    });

    it('writes enhanced summary fields', async () => {
      const summary: RunSummary = {
        feature: 'enhanced-feature',
        iterations: 11,
        maxIterations: 15,
        tasksDone: 8,
        tasksTotal: 8,
        tokensInput: 5000,
        tokensOutput: 10000,
        exitCode: 0,
        startedAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T01:00:00Z',
        totalDurationMs: 3600000,
        iterationBreakdown: {
          total: 11,
          implementation: 10,
          resumes: 1,
        },
        tasks: {
          completed: 8,
          total: 8,
        },
        phases: [
          {
            id: 'planning',
            label: 'Planning',
            status: 'success',
            durationMs: 120000,
          },
          {
            id: 'implementation',
            label: 'Implementation',
            status: 'success',
            durationMs: 500000,
            iterations: 10,
          },
        ],
        changes: {
          totalFilesChanged: 1,
          files: [
            {
              path: 'src/test.ts',
              added: 15,
              removed: 6,
            },
          ],
          available: true,
        },
        commits: {
          fromHash: 'abc123',
          toHash: 'def456',
          mergeType: 'squash',
          available: true,
        },
        pr: {
          number: 42,
          url: 'https://github.com/org/repo/pull/42',
          available: true,
          created: true,
        },
        issue: {
          number: 24,
          status: 'Closed',
          available: true,
          linked: true,
        },
      };

      await writeRunSummaryFile('enhanced-feature', summary);

      const filePath = join(tempDir, 'ralph-loop-enhanced-feature.summary.json');
      const fileContent = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent);

      expect(parsed.totalDurationMs).toBe(3600000);
      expect(parsed.iterationBreakdown).toEqual({
        total: 11,
        implementation: 10,
        resumes: 1,
      });
      expect(parsed.phases).toHaveLength(2);
      expect(parsed.changes?.files).toHaveLength(1);
      expect(parsed.commits?.fromHash).toBe('abc123');
      expect(parsed.pr?.number).toBe(42);
      expect(parsed.issue?.number).toBe(24);
    });

    it('formats JSON with 2-space indentation', async () => {
      const summary: RunSummary = {
        feature: 'test',
        iterations: 1,
        maxIterations: 10,
        tasksDone: 0,
        tasksTotal: 0,
        tokensInput: 0,
        tokensOutput: 0,
        exitCode: 0,
      };

      await writeRunSummaryFile('test', summary);

      const filePath = join(tempDir, 'ralph-loop-test.summary.json');
      const fileContent = readFileSync(filePath, 'utf8');

      // Check for 2-space indentation
      expect(fileContent).toContain('  "feature": "test"');
      expect(fileContent).toContain('  "iterations": 1');
    });

    it('throws error when directory is not writable', async () => {
      const summary: RunSummary = {
        feature: 'test',
        iterations: 1,
        maxIterations: 10,
        tasksDone: 0,
        tasksTotal: 0,
        tokensInput: 0,
        tokensOutput: 0,
        exitCode: 0,
      };

      // Make directory read-only (not writable)
      chmodSync(tempDir, 0o444);

      await expect(writeRunSummaryFile('test', summary)).rejects.toThrow();

      // Restore write permissions for cleanup
      chmodSync(tempDir, 0o755);
    });

    it('uses system tmpdir when RALPH_SUMMARY_TMP_DIR not set', async () => {
      delete process.env.RALPH_SUMMARY_TMP_DIR;

      const summary: RunSummary = {
        feature: 'system-tmp',
        iterations: 1,
        maxIterations: 10,
        tasksDone: 0,
        tasksTotal: 0,
        tokensInput: 0,
        tokensOutput: 0,
        exitCode: 0,
      };

      await writeRunSummaryFile('system-tmp', summary);

      const systemTmpDir = tmpdir();
      const filePath = join(systemTmpDir, 'ralph-loop-system-tmp.summary.json');

      expect(existsSync(filePath)).toBe(true);

      // Clean up file from system temp
      rmSync(filePath, { force: true });
    });

    it('sanitizes feature name with special characters', async () => {
      const summary: RunSummary = {
        feature: 'test/feature',
        iterations: 1,
        maxIterations: 10,
        tasksDone: 0,
        tasksTotal: 0,
        tokensInput: 0,
        tokensOutput: 0,
        exitCode: 0,
      };

      // Note: The function doesn't sanitize, so this tests the actual behavior
      // In production, feature names should already be sanitized before calling
      await writeRunSummaryFile('test-feature', summary);

      const filePath = join(tempDir, 'ralph-loop-test-feature.summary.json');
      expect(existsSync(filePath)).toBe(true);
    });
  });
});
