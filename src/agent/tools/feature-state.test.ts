import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => {
  // Create a callback-style execFile whose promisify.custom points to our mock
  const execFile = () => {};
  (execFile as any)[promisify.custom] = mockExecFileAsync;
  return { execFile };
});

import { assessFeatureStateImpl, createFeatureStateTools } from './feature-state.js';

describe('assessFeatureStateImpl', () => {
  const projectRoot = join(tmpdir(), 'feature-state-test');
  const specsDir = join(projectRoot, '.ralph', 'specs');

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up temp files
    if (existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true });
    // Clean up loop status files
    const prefix = join('/tmp', 'ralph-loop-test-feat');
    for (const ext of ['.final', '.phases', '.log']) {
      const p = `${prefix}${ext}`;
      if (existsSync(p)) rmSync(p);
    }
  });

  function setupDirs() {
    mkdirSync(specsDir, { recursive: true });
  }

  function mockGitAndGh(overrides: {
    branchExists?: boolean;
    defaultBranch?: string;
    commitsAhead?: number;
    ghResult?: unknown[];
    ghSearchResult?: unknown[];
    ghFails?: boolean;
  } = {}) {
    const {
      branchExists = false,
      defaultBranch = 'main',
      commitsAhead = 0,
      ghResult = [],
      ghSearchResult,
      ghFails = false,
    } = overrides;

    mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--verify') {
        if (branchExists) return Promise.resolve({ stdout: 'abc123\n' });
        return Promise.reject(new Error('not found'));
      }
      if (cmd === 'git' && args[0] === 'symbolic-ref') {
        return Promise.resolve({ stdout: `origin/${defaultBranch}\n` });
      }
      if (cmd === 'git' && args[0] === 'rev-list') {
        return Promise.resolve({ stdout: `${commitsAhead}\n` });
      }
      if (cmd === 'gh') {
        if (ghFails) return Promise.reject(new Error('gh not found'));
        // Distinguish branch-based PR list from issue-based search
        if (args.includes('--search') && ghSearchResult !== undefined) {
          return Promise.resolve({ stdout: JSON.stringify(ghSearchResult) });
        }
        return Promise.resolve({ stdout: JSON.stringify(ghResult) });
      }
      return Promise.reject(new Error(`unmocked: ${cmd} ${args.join(' ')}`));
    });
  }

  it('returns start_fresh when nothing exists', async () => {
    setupDirs();
    mockGitAndGh();

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('start_fresh');
    expect(state.branch.exists).toBe(false);
    expect(state.spec.exists).toBe(false);
    expect(state.plan.exists).toBe(false);
    expect(state.pr.exists).toBe(false);
    expect(state.linkedPr.exists).toBe(false);
  });

  it('returns generate_plan when spec exists but no plan', async () => {
    setupDirs();
    writeFileSync(join(specsDir, 'test-feat.md'), '# Spec\nSome spec content');
    mockGitAndGh({ branchExists: true, commitsAhead: 1 });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('generate_plan');
    expect(state.spec.exists).toBe(true);
    expect(state.plan.exists).toBe(false);
  });

  it('returns resume_implementation when plan has pending tasks', async () => {
    setupDirs();
    writeFileSync(join(specsDir, 'test-feat.md'), '# Spec');
    writeFileSync(join(specsDir, 'test-feat-implementation-plan.md'), [
      '# Plan',
      '- [x] Task 1',
      '- [x] Task 2',
      '- [ ] Task 3',
      '- [ ] Task 4',
    ].join('\n'));
    mockGitAndGh({ branchExists: true, commitsAhead: 3 });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('resume_implementation');
    expect(state.plan.totalTasks).toBe(4);
    expect(state.plan.completedTasks).toBe(2);
    expect(state.plan.completionPercent).toBe(50);
  });

  it('returns resume_pr_phase when all tasks are complete and no PR', async () => {
    setupDirs();
    writeFileSync(join(specsDir, 'test-feat.md'), '# Spec');
    writeFileSync(join(specsDir, 'test-feat-implementation-plan.md'), [
      '# Plan',
      '- [x] Task 1',
      '- [x] Task 2',
      '- [x] Task 3',
    ].join('\n'));
    mockGitAndGh({ branchExists: true, commitsAhead: 5 });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('resume_pr_phase');
    expect(state.plan.completedTasks).toBe(3);
    expect(state.plan.totalTasks).toBe(3);
    expect(state.plan.completionPercent).toBe(100);
  });

  it('returns pr_exists_open when PR is open', async () => {
    setupDirs();
    writeFileSync(join(specsDir, 'test-feat.md'), '# Spec');
    writeFileSync(join(specsDir, 'test-feat-implementation-plan.md'), '- [x] Task 1');
    mockGitAndGh({
      branchExists: true,
      commitsAhead: 3,
      ghResult: [{ number: 42, state: 'OPEN', url: 'https://github.com/o/r/pull/42' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('pr_exists_open');
    expect(state.pr.exists).toBe(true);
    expect(state.pr.number).toBe(42);
    expect(state.pr.state).toBe('OPEN');
  });

  it('returns pr_merged when PR is merged', async () => {
    setupDirs();
    mockGitAndGh({
      branchExists: true,
      ghResult: [{ number: 10, state: 'MERGED', url: 'https://github.com/o/r/pull/10' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('pr_merged');
    expect(state.pr.state).toBe('MERGED');
  });

  it('returns pr_closed when PR is closed without merge', async () => {
    setupDirs();
    mockGitAndGh({
      branchExists: true,
      ghResult: [{ number: 5, state: 'CLOSED', url: 'https://github.com/o/r/pull/5' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('pr_closed');
    expect(state.pr.state).toBe('CLOSED');
  });

  it('reports branch commits ahead count', async () => {
    setupDirs();
    mockGitAndGh({ branchExists: true, commitsAhead: 7 });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.branch.exists).toBe(true);
    expect(state.branch.commitsAhead).toBe(7);
  });

  it('handles gh CLI failure gracefully', async () => {
    setupDirs();
    mockGitAndGh({ branchExists: false, ghFails: true });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.pr.exists).toBe(false);
    expect(state.recommendation).toBe('start_fresh');
  });

  it('detects loop status files', async () => {
    setupDirs();
    mockGitAndGh();
    const finalPath = join('/tmp', 'ralph-loop-test-feat.final');
    writeFileSync(finalPath, '3|10|2026-03-01T12:00:00Z|done');

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.loopStatus.hasStatusFiles).toBe(true);
  });

  it('returns linked_pr_merged when issue search finds a merged PR under different branch', async () => {
    setupDirs();
    mockGitAndGh({
      branchExists: false,
      ghResult: [],
      ghSearchResult: [{ number: 99, state: 'MERGED', url: 'https://github.com/o/r/pull/99', headRefName: 'feat/other-name' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat', 42);

    expect(state.recommendation).toBe('linked_pr_merged');
    expect(state.linkedPr.exists).toBe(true);
    expect(state.linkedPr.number).toBe(99);
    expect(state.linkedPr.state).toBe('MERGED');
    expect(state.linkedPr.headRefName).toBe('feat/other-name');
  });

  it('returns linked_pr_open when issue search finds an open PR under different branch', async () => {
    setupDirs();
    mockGitAndGh({
      branchExists: false,
      ghResult: [],
      ghSearchResult: [{ number: 77, state: 'OPEN', url: 'https://github.com/o/r/pull/77', headRefName: 'feat/long-name' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat', 42);

    expect(state.recommendation).toBe('linked_pr_open');
    expect(state.linkedPr.exists).toBe(true);
    expect(state.linkedPr.number).toBe(77);
    expect(state.linkedPr.state).toBe('OPEN');
  });

  it('skips linked PR search when no issueNumber provided', async () => {
    setupDirs();
    mockGitAndGh({
      branchExists: false,
      ghResult: [],
      ghSearchResult: [{ number: 99, state: 'MERGED', url: 'https://github.com/o/r/pull/99', headRefName: 'feat/other' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.linkedPr.exists).toBe(false);
    expect(state.recommendation).toBe('start_fresh');
  });

  it('skips linked PR search when branch-name PR already found', async () => {
    setupDirs();
    mockGitAndGh({
      branchExists: true,
      commitsAhead: 3,
      ghResult: [{ number: 10, state: 'MERGED', url: 'https://github.com/o/r/pull/10' }],
      ghSearchResult: [{ number: 99, state: 'OPEN', url: 'https://github.com/o/r/pull/99', headRefName: 'feat/other' }],
    });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat', 42);

    expect(state.pr.exists).toBe(true);
    expect(state.pr.state).toBe('MERGED');
    expect(state.linkedPr.exists).toBe(false);
    expect(state.recommendation).toBe('pr_merged');
  });

  it('returns resume_implementation when branch has commits but no local spec/plan', async () => {
    // Simulates checking from main where spec/plan files exist on the feature branch
    setupDirs();
    mockGitAndGh({ branchExists: true, commitsAhead: 9 });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat');

    expect(state.recommendation).toBe('resume_implementation');
    expect(state.branch.exists).toBe(true);
    expect(state.branch.commitsAhead).toBe(9);
    expect(state.spec.exists).toBe(false);
    expect(state.plan.exists).toBe(false);
  });

  it('handles gh search failure gracefully during linked PR search', async () => {
    setupDirs();
    mockGitAndGh({ branchExists: false, ghFails: true });

    const state = await assessFeatureStateImpl(projectRoot, 'test-feat', 42);

    expect(state.linkedPr.exists).toBe(false);
    expect(state.recommendation).toBe('start_fresh');
  });
});

describe('createFeatureStateTools', () => {
  it('returns an object with assessFeatureState tool', () => {
    const tools = createFeatureStateTools('/fake/root');
    expect(tools.assessFeatureState).toBeDefined();
    expect(typeof tools.assessFeatureState.execute).toBe('function');
  });
});
