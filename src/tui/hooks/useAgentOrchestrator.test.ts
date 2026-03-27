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
});
