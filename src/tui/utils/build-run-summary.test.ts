/**
 * Tests for build-run-summary.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildEnhancedRunSummary } from './build-run-summary.js';
import type { RunSummary } from '../screens/RunScreen.js';
import * as fs from 'node:fs';
import * as gitSummary from './git-summary.js';
import * as prSummary from './pr-summary.js';

// Mock dependencies
vi.mock('node:fs');
vi.mock('./git-summary.js');
vi.mock('./pr-summary.js');

describe('buildEnhancedRunSummary', () => {
  const projectRoot = '/test/project';
  const feature = 'test-feature';

  const basicSummary: RunSummary = {
    feature: 'test-feature',
    iterations: 10,
    maxIterations: 20,
    tasksDone: 5,
    tasksTotal: 8,
    tokensInput: 1000,
    tokensOutput: 2000,
    exitCode: 0,
    branch: 'feat/test-feature',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with full data available', () => {
    beforeEach(() => {
      // Mock phases file
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('.phases') || pathStr.includes('.baseline');
      });

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('.phases')) {
          return [
            'planning|success|1000|1135',
            'implementation|success|1135|1655',
            'implementation|success|1655|1695',
            'e2e_testing|skipped|0|0',
            'verification|success|1695|1757',
            'pr_review|success|1757|1792',
          ].join('\n');
        }
        if (pathStr.includes('.baseline')) {
          return 'abc123456789'; // Full hash, will be truncated to 7 chars
        }
        return '';
      });

      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue('def4567');
      vi.mocked(gitSummary.getDiffStats).mockReturnValue([
        { path: 'src/file1.ts', added: 15, removed: 6 },
        { path: 'src/file2.ts', added: 8, removed: 2 },
      ]);

      vi.mocked(prSummary.getPrForBranch).mockReturnValue({
        number: 42,
        url: 'https://github.com/test/repo/pull/42',
        state: 'OPEN',
        title: 'Test PR',
      });

      vi.mocked(prSummary.getLinkedIssue).mockReturnValue({
        number: 123,
        url: 'https://github.com/test/repo/issues/123',
        state: 'CLOSED',
        title: 'Test Issue',
      });
    });

    it('should build complete enhanced summary', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      // Basic fields preserved
      expect(result.feature).toBe('test-feature');
      expect(result.iterations).toBe(10);
      expect(result.exitCode).toBe(0);

      // Total duration computed from phases
      // planning: 135s, impl: 520s + 40s, verification: 62s, pr_review: 35s = 792s = 792000ms
      expect(result.totalDurationMs).toBe(792000);

      // Iteration breakdown
      expect(result.iterationBreakdown).toEqual({
        total: 10,
        implementation: 10, // Derived from basicSummary.iterations
      });

      // Tasks
      expect(result.tasks).toEqual({
        completed: 5,
        total: 8,
      });

      // Phases array
      expect(result.phases).toHaveLength(5);
      expect(result.phases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'planning',
            label: 'Planning',
            status: 'success',
            durationMs: 135000,
          }),
          expect.objectContaining({
            id: 'implementation',
            label: 'Implementation',
            status: 'success',
            durationMs: 560000, // 520s + 40s
            iterations: 10, // Derived from basicSummary.iterations
          }),
          expect.objectContaining({
            id: 'e2e_testing',
            label: 'E2E Testing',
            status: 'skipped',
          }),
          expect.objectContaining({
            id: 'verification',
            label: 'Verification',
            status: 'success',
            durationMs: 62000,
          }),
          expect.objectContaining({
            id: 'pr_review',
            label: 'PR & Review',
            status: 'success',
            durationMs: 35000,
          }),
        ])
      );

      // Changes
      expect(result.changes).toEqual({
        totalFilesChanged: 2,
        files: [
          { path: 'src/file1.ts', added: 15, removed: 6 },
          { path: 'src/file2.ts', added: 8, removed: 2 },
        ],
        available: true,
      });

      // Commits
      expect(result.commits).toEqual({
        fromHash: 'abc1234', // First 7 chars
        toHash: 'def4567',
        mergeType: 'none',
        available: true,
      });

      // PR
      expect(result.pr).toEqual({
        number: 42,
        url: 'https://github.com/test/repo/pull/42',
        available: true,
        created: true,
      });

      // Issue
      expect(result.issue).toEqual({
        number: 123,
        url: 'https://github.com/test/repo/issues/123',
        status: 'CLOSED',
        available: true,
        linked: true,
      });
    });
  });

  describe('with missing phases file', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
      vi.mocked(gitSummary.getDiffStats).mockReturnValue(null);
      vi.mocked(prSummary.getPrForBranch).mockReturnValue(null);
      vi.mocked(prSummary.getLinkedIssue).mockReturnValue(null);
    });

    it('should return summary with empty phases array', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      expect(result.phases).toEqual([]);
      expect(result.totalDurationMs).toBeUndefined();
      expect(result.changes).toEqual({ available: false });
      expect(result.commits).toEqual({ available: false });
    });
  });

  describe('with git available but no baseline', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // No baseline file
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue('abc1234');
      vi.mocked(gitSummary.getDiffStats).mockReturnValue(null);
      vi.mocked(prSummary.getPrForBranch).mockReturnValue(null);
    });

    it('should show current commit but no changes', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      expect(result.commits).toEqual({
        toHash: 'abc1234',
        available: true,
      });
      expect(result.changes).toEqual({ available: false });
    });
  });

  describe('with PR but no linked issue', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
      vi.mocked(prSummary.getPrForBranch).mockReturnValue({
        number: 42,
        url: 'https://github.com/test/repo/pull/42',
        state: 'OPEN',
        title: 'Test PR',
      });
      vi.mocked(prSummary.getLinkedIssue).mockReturnValue(null);
    });

    it('should show PR created but issue not linked', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      expect(result.pr).toEqual({
        number: 42,
        url: 'https://github.com/test/repo/pull/42',
        available: true,
        created: true,
      });
      expect(result.issue).toEqual({
        available: true,
        linked: false,
      });
    });
  });

  describe('with gh CLI failure', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
      vi.mocked(prSummary.getPrForBranch).mockImplementation(() => {
        throw new Error('gh not available');
      });
    });

    it('should mark PR and issue as not available', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      expect(result.pr).toEqual({ available: false, created: false });
      expect(result.issue).toEqual({ available: false, linked: false });
    });
  });

  describe('with no branch info', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
    });

    it('should mark PR and issue as not available', () => {
      const summaryNoBranch = { ...basicSummary, branch: undefined };
      const result = buildEnhancedRunSummary(summaryNoBranch, projectRoot, feature);

      expect(result.pr).toEqual({ available: false, created: false });
      expect(result.issue).toEqual({ available: false, linked: false });
    });
  });

  describe('with malformed phases file', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return String(path).includes('.phases');
      });

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        return 'invalid|data\nmalformed'; // Missing fields
      });

      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
    });

    it('should handle parse errors gracefully', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      // Should not crash, just return empty phases
      expect(result.phases).toEqual([]);
      expect(result.totalDurationMs).toBeUndefined();
    });
  });

  describe('with zero tasks', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
    });

    it('should preserve zero as valid task count', () => {
      const summaryNoTasks = {
        ...basicSummary,
        tasksDone: 0,
        tasksTotal: 0,
      };
      const result = buildEnhancedRunSummary(summaryNoTasks, projectRoot, feature);

      expect(result.tasks).toEqual({
        completed: 0,
        total: 0,
      });
    });
  });

  describe('with unknown phase status', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return String(path).includes('.phases');
      });

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        return 'planning|running|1000|1100'; // 'running' is not a valid status
      });

      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
    });

    it('should coerce unknown status to failed', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      expect(result.phases).toHaveLength(1);
      expect(result.phases![0].status).toBe('failed');
    });
  });

  describe('with failed phase', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return String(path).includes('.phases');
      });

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        return [
          'planning|success|1000|1100',
          'implementation|failed|1100|1200',
        ].join('\n');
      });

      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue(null);
    });

    it('should preserve failed status', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      const implPhase = result.phases?.find((p) => p.id === 'implementation');
      expect(implPhase?.status).toBe('failed');
      expect(implPhase?.durationMs).toBe(100000);
    });
  });

  describe('with git diff failure', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return String(path).includes('.baseline');
      });

      vi.mocked(fs.readFileSync).mockReturnValue('abc1234567');
      vi.mocked(gitSummary.getCurrentCommitHash).mockReturnValue('def4567');
      vi.mocked(gitSummary.getDiffStats).mockReturnValue(null); // Diff failed
    });

    it('should mark changes as available but empty', () => {
      const result = buildEnhancedRunSummary(basicSummary, projectRoot, feature);

      expect(result.commits).toEqual({
        fromHash: 'abc1234',
        toHash: 'def4567',
        mergeType: 'none',
        available: true,
      });
      expect(result.changes).toEqual({
        available: true, // Git is available, but diff returned null
      });
    });
  });
});
