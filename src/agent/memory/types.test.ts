import { describe, it, expect } from 'vitest';
import { createMemoryEntry } from './types.js';

describe('createMemoryEntry', () => {
  it('creates a work_log entry with required fields', () => {
    const entry = createMemoryEntry({
      type: 'work_log',
      content: 'Implemented login flow (#42)',
    });

    expect(entry.id).toMatch(/^[a-f0-9]+$/);
    expect(entry.id.length).toBeGreaterThanOrEqual(8);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.type).toBe('work_log');
    expect(entry.content).toBe('Implemented login flow (#42)');
    expect(entry.tags).toBeUndefined();
    expect(entry.relatedIssue).toBeUndefined();
  });

  it('creates entry with optional fields', () => {
    const entry = createMemoryEntry({
      type: 'project_knowledge',
      content: 'Tests must mock the logger module',
      tags: ['testing', 'patterns'],
      relatedIssue: 42,
    });

    expect(entry.type).toBe('project_knowledge');
    expect(entry.tags).toEqual(['testing', 'patterns']);
    expect(entry.relatedIssue).toBe(42);
  });

  it('generates unique IDs for each entry', () => {
    const a = createMemoryEntry({ type: 'decision', content: 'a' });
    const b = createMemoryEntry({ type: 'decision', content: 'b' });
    expect(a.id).not.toBe(b.id);
  });
});
