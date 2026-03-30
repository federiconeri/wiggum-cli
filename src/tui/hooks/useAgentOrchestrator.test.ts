import { describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';
import type { AgentIssueState, AgentLogEntry } from '../../agent/types.js';
import { applyOrchestratorEvent } from './useAgentOrchestrator.js';

function createStateSetter<T>(initial: T) {
  let value = initial;
  const setter = vi.fn((next: SetStateAction<T>) => {
    value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
  });
  return {
    setter,
    get value() {
      return value;
    },
  };
}

describe('applyOrchestratorEvent', () => {
  it('filters already-completed issues out of queue_ranked snapshots', () => {
    const completedRef = { current: new Set<number>([69]) };
    const activeIssue = createStateSetter<AgentIssueState | null>(null);
    const queue = createStateSetter<AgentIssueState[]>([]);
    const completed = createStateSetter<AgentIssueState[]>([
      { issueNumber: 69, title: 'Done', labels: [], phase: 'reflecting' },
    ]);
    const logEntries = createStateSetter<AgentLogEntry[]>([]);

    applyOrchestratorEvent(
      {
        type: 'queue_ranked',
        queue: [
          { issueNumber: 69, title: 'Done', labels: [], phase: 'idle' },
          { issueNumber: 70, title: 'Queued', labels: [], phase: 'idle' },
        ],
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(queue.value.map(issue => issue.issueNumber)).toEqual([70]);
  });

  it('replaces stale completed state when the same issue is retried', () => {
    const completedRef = { current: new Set<number>([69]) };
    const activeIssue = createStateSetter<AgentIssueState | null>(null);
    const queue = createStateSetter<AgentIssueState[]>([]);
    const completed = createStateSetter<AgentIssueState[]>([
      { issueNumber: 69, title: 'Done (stale)', labels: [], phase: 'reflecting' },
    ]);
    const logEntries = createStateSetter<AgentLogEntry[]>([]);

    applyOrchestratorEvent(
      {
        type: 'task_selected',
        issue: { issueNumber: 69, title: 'Retrying', labels: [], phase: 'idle' },
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(completed.value).toEqual([]);
    expect(completedRef.current.has(69)).toBe(false);

    applyOrchestratorEvent(
      {
        type: 'task_completed',
        issue: { issueNumber: 69, title: 'Done (fresh)', labels: [], phase: 'reflecting' },
        outcome: 'success',
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(completed.value).toEqual([
      { issueNumber: 69, title: 'Done (fresh)', labels: [], phase: 'reflecting' },
    ]);
    expect(completedRef.current.has(69)).toBe(true);
  });

  it('marks completed issues with an error flag when the reflected outcome is failure', () => {
    const completedRef = { current: new Set<number>() };
    const activeIssue = createStateSetter<AgentIssueState | null>(null);
    const queue = createStateSetter<AgentIssueState[]>([]);
    const completed = createStateSetter<AgentIssueState[]>([]);
    const logEntries = createStateSetter<AgentLogEntry[]>([]);

    applyOrchestratorEvent(
      {
        type: 'task_completed',
        issue: { issueNumber: 71, title: 'Failed issue', labels: [], phase: 'reflecting' },
        outcome: 'failure',
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(completed.value).toEqual([
      { issueNumber: 71, title: 'Failed issue', labels: [], phase: 'reflecting', error: 'failed' },
    ]);
    expect(completedRef.current.has(71)).toBe(false);
  });

  it('does not keep partial outcomes in completed state', () => {
    const completedRef = { current: new Set<number>([72]) };
    const activeIssue = createStateSetter<AgentIssueState | null>(null);
    const queue = createStateSetter<AgentIssueState[]>([]);
    const completed = createStateSetter<AgentIssueState[]>([
      { issueNumber: 72, title: 'Old partial', labels: [], phase: 'reflecting' },
    ]);
    const logEntries = createStateSetter<AgentLogEntry[]>([]);

    applyOrchestratorEvent(
      {
        type: 'task_completed',
        issue: { issueNumber: 72, title: 'Retry later', labels: [], phase: 'reflecting' },
        outcome: 'partial',
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(completed.value).toEqual([
      { issueNumber: 72, title: 'Retry later', labels: [], phase: 'reflecting' },
    ]);
    expect(completedRef.current.has(72)).toBe(false);
  });

  it('preserves failure outcomes in processed state without marking them complete', () => {
    const completedRef = { current: new Set<number>() };
    const activeIssue = createStateSetter<AgentIssueState | null>(null);
    const queue = createStateSetter<AgentIssueState[]>([]);
    const completed = createStateSetter<AgentIssueState[]>([]);
    const logEntries = createStateSetter<AgentLogEntry[]>([]);

    applyOrchestratorEvent(
      {
        type: 'task_completed',
        issue: { issueNumber: 73, title: 'Crashed issue', labels: [], phase: 'reflecting' },
        outcome: 'failure',
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(completed.value).toEqual([
      { issueNumber: 73, title: 'Crashed issue', labels: [], phase: 'reflecting', error: 'failed' },
    ]);
    expect(completedRef.current.has(73)).toBe(false);
  });

  it('moves successful resumable issues back out of completed when they reappear in the queue', () => {
    const completedRef = { current: new Set<number>([88]) };
    const activeIssue = createStateSetter<AgentIssueState | null>(null);
    const queue = createStateSetter<AgentIssueState[]>([]);
    const completed = createStateSetter<AgentIssueState[]>([
      { issueNumber: 88, title: 'Done for now', labels: [], phase: 'reflecting' },
    ]);
    const logEntries = createStateSetter<AgentLogEntry[]>([]);

    applyOrchestratorEvent(
      {
        type: 'queue_ranked',
        queue: [
          { issueNumber: 88, title: 'Needs PR phase', labels: [], phase: 'idle', recommendation: 'resume_pr_phase' },
          { issueNumber: 89, title: 'Another item', labels: [], phase: 'idle' },
        ],
      },
      activeIssue.setter,
      queue.setter,
      completed.setter,
      logEntries.setter,
      completedRef,
    );

    expect(completed.value).toEqual([]);
    expect(completedRef.current.has(88)).toBe(false);
    expect(queue.value.map(issue => issue.issueNumber)).toEqual([88, 89]);
  });
});
