import { describe, it, expect } from 'vitest';
import { createDryRunExecutionTools, createDryRunReportingTools, createDryRunFeatureStateTools } from './dry-run.js';

describe('createDryRunExecutionTools', () => {
  const tools = createDryRunExecutionTools();
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  it('generateSpec returns simulated success without spawning', async () => {
    const result = await tools.generateSpec.execute(
      { featureName: 'test-feat', issueNumber: 42 },
      execCtx,
    );
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.specPath).toContain('test-feat');
  });

  it('runLoop returns simulated success without spawning', async () => {
    const result = await tools.runLoop.execute(
      { featureName: 'test-feat', worktree: true },
      execCtx,
    );
    expect(result.status).toBe('done');
    expect(result.dryRun).toBe(true);
  });

  it('checkLoopStatus returns simulated status', async () => {
    const result = await tools.checkLoopStatus.execute(
      { featureName: 'test-feat' },
      execCtx,
    );
    expect(result.status).toBe('done');
    expect(result.dryRun).toBe(true);
  });
});

describe('createDryRunReportingTools', () => {
  const tools = createDryRunReportingTools();
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  it('commentOnIssue returns simulated success without posting', async () => {
    const result = await tools.commentOnIssue.execute(
      { issueNumber: 42, body: 'Test comment' },
      execCtx,
    );
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.wouldComment).toEqual({ issueNumber: 42, bodyLength: 12 });
  });

  it('createTechDebtIssue returns simulated success without creating', async () => {
    const result = await tools.createTechDebtIssue.execute(
      { title: 'Fix auth', body: 'Details', labels: ['tech-debt'] },
      execCtx,
    );
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.wouldCreate).toEqual({ title: 'Fix auth' });
  });
});

describe('createDryRunFeatureStateTools', () => {
  const tools = createDryRunFeatureStateTools();
  const execCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal };

  it('assessFeatureState returns simulated start_fresh recommendation', async () => {
    const result = await tools.assessFeatureState.execute(
      { featureName: 'test-feat' },
      execCtx,
    );
    expect(result.recommendation).toBe('start_fresh');
    expect(result.dryRun).toBe(true);
    expect(result.featureName).toBe('test-feat');
    expect(result.branch.exists).toBe(false);
    expect(result.pr.exists).toBe(false);
  });
});
