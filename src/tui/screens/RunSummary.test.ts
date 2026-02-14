/**
 * Tests for RunSummary type structure and enhanced fields
 *
 * These tests verify that the extended RunSummary interface and its
 * sub-types are correctly structured and can be instantiated with
 * valid data.
 */

import { describe, it, expect } from 'vitest';
import type {
  RunSummary,
  PhaseInfo,
  IterationBreakdown,
  FileChangeStat,
  ChangesSummary,
  CommitsSummary,
  PrSummary,
  IssueSummary,
} from './RunScreen.js';

describe('RunSummary types', () => {
  describe('PhaseInfo', () => {
    it('accepts valid phase info with all fields', () => {
      const phase: PhaseInfo = {
        id: 'implementation',
        label: 'Implementation',
        status: 'success',
        durationMs: 120000,
        iterations: 10,
      };

      expect(phase.id).toBe('implementation');
      expect(phase.label).toBe('Implementation');
      expect(phase.status).toBe('success');
      expect(phase.durationMs).toBe(120000);
      expect(phase.iterations).toBe(10);
    });

    it('accepts phase info with minimal fields', () => {
      const phase: PhaseInfo = {
        id: 'planning',
        label: 'Planning',
        status: 'skipped',
      };

      expect(phase.status).toBe('skipped');
      expect(phase.durationMs).toBeUndefined();
      expect(phase.iterations).toBeUndefined();
    });

    it('accepts all valid status values', () => {
      const statuses: Array<PhaseInfo['status']> = ['success', 'skipped', 'failed'];

      statuses.forEach((status) => {
        const phase: PhaseInfo = {
          id: 'test',
          label: 'Test',
          status,
        };
        expect(phase.status).toBe(status);
      });
    });
  });

  describe('IterationBreakdown', () => {
    it('accepts full iteration breakdown', () => {
      const iterations: IterationBreakdown = {
        total: 11,
        implementation: 10,
        resumes: 1,
      };

      expect(iterations.total).toBe(11);
      expect(iterations.implementation).toBe(10);
      expect(iterations.resumes).toBe(1);
    });

    it('accepts iteration breakdown with only total', () => {
      const iterations: IterationBreakdown = {
        total: 5,
      };

      expect(iterations.total).toBe(5);
      expect(iterations.implementation).toBeUndefined();
      expect(iterations.resumes).toBeUndefined();
    });
  });

  describe('FileChangeStat', () => {
    it('accepts valid file change statistics', () => {
      const fileChange: FileChangeStat = {
        path: 'src/tui/components/ChatInput.tsx',
        added: 15,
        removed: 6,
      };

      expect(fileChange.path).toBe('src/tui/components/ChatInput.tsx');
      expect(fileChange.added).toBe(15);
      expect(fileChange.removed).toBe(6);
    });

    it('accepts zero additions or deletions', () => {
      const fileChange: FileChangeStat = {
        path: 'README.md',
        added: 0,
        removed: 0,
      };

      expect(fileChange.added).toBe(0);
      expect(fileChange.removed).toBe(0);
    });
  });

  describe('ChangesSummary', () => {
    it('accepts full changes summary with files', () => {
      const changes: ChangesSummary = {
        totalFilesChanged: 2,
        files: [
          { path: 'src/index.ts', added: 10, removed: 5 },
          { path: 'src/utils.ts', added: 3, removed: 1 },
        ],
        available: true,
      };

      expect(changes.totalFilesChanged).toBe(2);
      expect(changes.files).toHaveLength(2);
      expect(changes.available).toBe(true);
    });

    it('accepts changes summary when git is not available', () => {
      const changes: ChangesSummary = {
        available: false,
      };

      expect(changes.available).toBe(false);
      expect(changes.totalFilesChanged).toBeUndefined();
      expect(changes.files).toBeUndefined();
    });

    it('accepts changes summary with no changes', () => {
      const changes: ChangesSummary = {
        totalFilesChanged: 0,
        files: [],
        available: true,
      };

      expect(changes.totalFilesChanged).toBe(0);
      expect(changes.files).toHaveLength(0);
      expect(changes.available).toBe(true);
    });
  });

  describe('CommitsSummary', () => {
    it('accepts full commit range information', () => {
      const commits: CommitsSummary = {
        fromHash: 'ee387b9',
        toHash: 'fc9b18a',
        mergeType: 'squash',
        available: true,
      };

      expect(commits.fromHash).toBe('ee387b9');
      expect(commits.toHash).toBe('fc9b18a');
      expect(commits.mergeType).toBe('squash');
      expect(commits.available).toBe(true);
    });

    it('accepts commit info with only final hash', () => {
      const commits: CommitsSummary = {
        toHash: 'abc1234',
        available: true,
      };

      expect(commits.toHash).toBe('abc1234');
      expect(commits.fromHash).toBeUndefined();
      expect(commits.mergeType).toBeUndefined();
      expect(commits.available).toBe(true);
    });

    it('accepts commit info when git is not available', () => {
      const commits: CommitsSummary = {
        available: false,
      };

      expect(commits.available).toBe(false);
      expect(commits.fromHash).toBeUndefined();
      expect(commits.toHash).toBeUndefined();
    });

    it('accepts all valid merge types', () => {
      const mergeTypes: Array<CommitsSummary['mergeType']> = ['squash', 'normal', 'none'];

      mergeTypes.forEach((mergeType) => {
        const commits: CommitsSummary = {
          mergeType,
          available: true,
        };
        expect(commits.mergeType).toBe(mergeType);
      });
    });
  });

  describe('PrSummary', () => {
    it('accepts PR summary when PR was created', () => {
      const pr: PrSummary = {
        number: 24,
        url: 'https://github.com/org/repo/pull/24',
        available: true,
        created: true,
      };

      expect(pr.number).toBe(24);
      expect(pr.url).toBe('https://github.com/org/repo/pull/24');
      expect(pr.available).toBe(true);
      expect(pr.created).toBe(true);
    });

    it('accepts PR summary when no PR was created', () => {
      const pr: PrSummary = {
        available: true,
        created: false,
      };

      expect(pr.available).toBe(true);
      expect(pr.created).toBe(false);
      expect(pr.number).toBeUndefined();
      expect(pr.url).toBeUndefined();
    });

    it('accepts PR summary when PR tooling not available', () => {
      const pr: PrSummary = {
        available: false,
        created: false,
      };

      expect(pr.available).toBe(false);
      expect(pr.created).toBe(false);
    });
  });

  describe('IssueSummary', () => {
    it('accepts issue summary when issue was linked', () => {
      const issue: IssueSummary = {
        number: 22,
        url: 'https://github.com/org/repo/issues/22',
        status: 'Closed',
        available: true,
        linked: true,
      };

      expect(issue.number).toBe(22);
      expect(issue.url).toBe('https://github.com/org/repo/issues/22');
      expect(issue.status).toBe('Closed');
      expect(issue.available).toBe(true);
      expect(issue.linked).toBe(true);
    });

    it('accepts issue summary when no issue was linked', () => {
      const issue: IssueSummary = {
        available: true,
        linked: false,
      };

      expect(issue.available).toBe(true);
      expect(issue.linked).toBe(false);
      expect(issue.number).toBeUndefined();
      expect(issue.status).toBeUndefined();
    });

    it('accepts issue summary when issue tooling not available', () => {
      const issue: IssueSummary = {
        available: false,
        linked: false,
      };

      expect(issue.available).toBe(false);
      expect(issue.linked).toBe(false);
    });
  });

  describe('RunSummary (enhanced)', () => {
    it('accepts minimal legacy RunSummary', () => {
      const summary: RunSummary = {
        feature: 'my-feature',
        iterations: 5,
        maxIterations: 10,
        tasksDone: 3,
        tasksTotal: 5,
        tokensInput: 1000,
        tokensOutput: 500,
        exitCode: 0,
      };

      expect(summary.feature).toBe('my-feature');
      expect(summary.exitCode).toBe(0);
      // All enhanced fields should be optional
      expect(summary.startedAt).toBeUndefined();
      expect(summary.phases).toBeUndefined();
    });

    it('accepts enhanced RunSummary with all new fields', () => {
      const summary: RunSummary = {
        feature: 'enhanced-feature',
        iterations: 11,
        maxIterations: 20,
        tasksDone: 8,
        tasksTotal: 8,
        tokensInput: 5000,
        tokensOutput: 3000,
        exitCode: 0,
        branch: 'feat/enhanced-feature',
        logPath: '/tmp/ralph-loop-enhanced-feature.log',
        startedAt: '2026-02-14T10:00:00Z',
        endedAt: '2026-02-14T10:12:34Z',
        totalDurationMs: 754000,
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
            durationMs: 135000,
          },
          {
            id: 'implementation',
            label: 'Implementation',
            status: 'success',
            durationMs: 522000,
            iterations: 10,
          },
          {
            id: 'e2e',
            label: 'E2E Testing',
            status: 'skipped',
          },
        ],
        changes: {
          totalFilesChanged: 1,
          files: [
            {
              path: 'src/tui/components/ChatInput.tsx',
              added: 15,
              removed: 6,
            },
          ],
          available: true,
        },
        commits: {
          fromHash: 'ee387b9',
          toHash: 'fc9b18a',
          mergeType: 'squash',
          available: true,
        },
        pr: {
          number: 24,
          url: 'https://github.com/org/repo/pull/24',
          available: true,
          created: true,
        },
        issue: {
          number: 22,
          status: 'Closed',
          available: true,
          linked: true,
        },
      };

      expect(summary.feature).toBe('enhanced-feature');
      expect(summary.totalDurationMs).toBe(754000);
      expect(summary.iterationBreakdown?.total).toBe(11);
      expect(summary.phases).toHaveLength(3);
      expect(summary.changes?.files).toHaveLength(1);
      expect(summary.commits?.fromHash).toBe('ee387b9');
      expect(summary.pr?.created).toBe(true);
      expect(summary.issue?.linked).toBe(true);
    });

    it('accepts enhanced RunSummary with partial data', () => {
      const summary: RunSummary = {
        feature: 'partial-feature',
        iterations: 5,
        maxIterations: 10,
        tasksDone: 3,
        tasksTotal: 5,
        tokensInput: 2000,
        tokensOutput: 1000,
        exitCode: 0,
        totalDurationMs: 300000,
        phases: [
          {
            id: 'planning',
            label: 'Planning',
            status: 'success',
          },
        ],
        changes: {
          available: false,
        },
        commits: {
          available: false,
        },
        pr: {
          available: true,
          created: false,
        },
        issue: {
          available: true,
          linked: false,
        },
      };

      expect(summary.totalDurationMs).toBe(300000);
      expect(summary.changes?.available).toBe(false);
      expect(summary.commits?.available).toBe(false);
      expect(summary.pr?.created).toBe(false);
      expect(summary.issue?.linked).toBe(false);
    });

    it('accepts enhanced RunSummary with timestamp as epoch ms', () => {
      const summary: RunSummary = {
        feature: 'timestamp-test',
        iterations: 3,
        maxIterations: 5,
        tasksDone: 2,
        tasksTotal: 3,
        tokensInput: 1000,
        tokensOutput: 500,
        exitCode: 0,
        startedAt: 1708772400000,
        endedAt: 1708773000000,
        totalDurationMs: 600000,
      };

      expect(typeof summary.startedAt).toBe('number');
      expect(typeof summary.endedAt).toBe('number');
      expect(summary.totalDurationMs).toBe(600000);
    });

    it('maintains backward compatibility with existing code', () => {
      // Old code that only uses legacy fields should still work
      const summary: RunSummary = {
        feature: 'backward-compat',
        iterations: 3,
        maxIterations: 5,
        tasksDone: 2,
        tasksTotal: 3,
        tokensInput: 1000,
        tokensOutput: 500,
        exitCode: 0,
        branch: 'feat/test',
        logPath: '/tmp/test.log',
      };

      // Legacy field access
      const legacyIterations = summary.iterations;
      const legacyTasksDone = summary.tasksDone;
      const legacyTasksTotal = summary.tasksTotal;

      expect(legacyIterations).toBe(3);
      expect(legacyTasksDone).toBe(2);
      expect(legacyTasksTotal).toBe(3);
    });
  });
});
