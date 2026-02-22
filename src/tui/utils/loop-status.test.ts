/**
 * Tests for loop-status.ts — activity feed utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');

import { formatRelativeTime, parseLoopLog, parsePhaseChanges, readLoopStatus } from './loop-status.js';
import * as child_process from 'node:child_process';

vi.mock('node:child_process');

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns " 0s ago" for the current moment (right-padded to 7 chars)', () => {
    expect(formatRelativeTime(Date.now())).toBe(' 0s ago');
  });

  it('returns right-padded seconds for differences under one minute', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('30s ago');
    expect(formatRelativeTime(Date.now() - 59_000)).toBe('59s ago');
  });

  it('returns right-padded minutes for differences between 1 and 59 minutes', () => {
    expect(formatRelativeTime(Date.now() - 60_000)).toBe(' 1m ago');
    expect(formatRelativeTime(Date.now() - 90_000)).toBe(' 1m ago');
    expect(formatRelativeTime(Date.now() - 120_000)).toBe(' 2m ago');
    expect(formatRelativeTime(Date.now() - 59 * 60_000)).toBe('59m ago');
  });

  it('returns right-padded hours for differences of 1 hour or more', () => {
    expect(formatRelativeTime(Date.now() - 3600_000)).toBe(' 1h ago');
    expect(formatRelativeTime(Date.now() - 7200_000)).toBe(' 2h ago');
  });

  it('returns " 0s ago" for future timestamps (clamped to 0)', () => {
    expect(formatRelativeTime(Date.now() + 5000)).toBe(' 0s ago');
  });

  it('produces strings of consistent 7-character width', () => {
    const timestamps = [0, 5_000, 30_000, 60_000, 3600_000];
    for (const offset of timestamps) {
      expect(formatRelativeTime(Date.now() - offset)).toHaveLength(7);
    }
  });
});

describe('parseLoopLog', () => {
  const logPath = '/tmp/ralph-loop-test-feature.log';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when log file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    expect(parseLoopLog(logPath)).toEqual([]);
  });

  it('returns empty array when log file is empty', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1705318800000 } as fs.Stats);
    expect(parseLoopLog(logPath)).toEqual([]);
  });

  it('parses log lines into structured events', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1705318800000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'Starting implementation\nRunning tests\n'
    );

    const events = parseLoopLog(logPath);
    expect(events).toHaveLength(2);
    expect(events[0].message).toBe('Starting implementation');
    expect(events[1].message).toBe('Running tests');
    expect(events[0].status).toBe('in-progress');
  });

  it('infers success status from success keywords', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1705318800000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'All tests passed\nBuild completed successfully\n'
    );

    const events = parseLoopLog(logPath);
    expect(events[0].status).toBe('success');
    expect(events[1].status).toBe('success');
  });

  it('infers error status from error keywords', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1705318800000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'ERROR: TypeScript compilation failed\nBuild FAILED\n'
    );

    const events = parseLoopLog(logPath);
    expect(events[0].status).toBe('error');
    expect(events[1].status).toBe('error');
  });

  it('uses file mtime as timestamp fallback when no timestamp prefix found', () => {
    const mtimeMs = 1705318800000;
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('some log line\n');

    const events = parseLoopLog(logPath);
    expect(events[0].timestamp).toBe(mtimeMs);
  });

  it('skips blank lines', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1705318800000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'line one\n\n   \nline two\n'
    );

    const events = parseLoopLog(logPath);
    expect(events).toHaveLength(2);
  });

  it('filters events by the since cutoff', () => {
    const earlyMtime = 1000;
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: earlyMtime } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('early line\n');

    const events = parseLoopLog(logPath, earlyMtime + 1);
    expect(events).toHaveLength(0);
  });

  it('includes events at exactly the since boundary', () => {
    const mtimeMs = 1000;
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('line at boundary\n');

    const events = parseLoopLog(logPath, mtimeMs);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('line at boundary');
  });

  it('extracts timestamp from ISO-prefixed log lines', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 0 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      '2024-01-15T10:30:45 Build started\n'
    );

    const events = parseLoopLog(logPath);
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe(Date.parse('2024-01-15T10:30:45'));
    expect(events[0].message).toBe('2024-01-15T10:30:45 Build started');
  });

  it('strips bracket-wrapped timestamp prefix from message', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 0 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      '[2024-01-15 10:30:45] Tests passed\n'
    );

    const events = parseLoopLog(logPath);
    expect(events[0].message).toBe('Tests passed');
  });

  it('returns empty array and does not throw on non-ENOENT read error', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });

    const events = parseLoopLog(logPath);
    expect(events).toEqual([]);
  });

  it('prioritizes success over error when both keywords appear', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'error recovery completed successfully\n'
    );

    const events = parseLoopLog(logPath);
    expect(events[0].status).toBe('success');
  });

  describe('log line filtering', () => {
    beforeEach(() => {
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    });

    it('filters pipe-delimited markdown table rows', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '| Area | Status |\n|------|--------|\n| Parser | Done |\nActual log line\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Actual log line');
    });

    it('filters numbered list items', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '1. Parser is a small module\n2. Tests are passing\nActual progress\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Actual progress');
    });

    it('filters bold markdown headers', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '**Summary of findings:**\nActual message\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Actual message');
    });

    it('filters markdown section headers', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '## Summary\n### What was done\nActual line\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Actual line');
    });

    it('filters iteration separator lines', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '--- Iteration 3 ---\n--- Review attempt 2 of 3 ---\nDoing work\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Doing work');
    });

    it('filters action request and user selection lines', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'Action request written: merge\nUser selected: approve\nUser chose: skip\nReal event\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Real event');
    });

    it('filters token usage block lines', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'Final Token Usage:\nInput: 50000 tokens\nOutput: 12000 tokens\nTotal: 62000 tokens\nDone\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Done');
    });

    it('filters loop completion lines', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'Loop complete. Exiting.\nRalph loop completed: feature-x\nFinal message\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Final message');
    });

    it('filters conversational filler', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'Ready for feedback.\nMeaningful update\n'
      );
      const events = parseLoopLog(logPath);
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Meaningful update');
    });
  });
});

describe('parsePhaseChanges', () => {
  const feature = 'test-feature';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty events when phases file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    expect(parsePhaseChanges(feature)).toEqual({ events: [] });
  });

  it('returns empty events and preserves lastKnownPhases on invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json');
    const prev = [{ id: 'planning', label: 'Planning', status: 'success' as const }];
    const result = parsePhaseChanges(feature, prev);
    expect(result.events).toEqual([]);
    expect(result.currentPhases).toBe(prev);
  });

  it('emits "started" events for new phases not in lastKnownPhases', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([{ id: 'planning', label: 'Planning', status: 'success' }])
    );

    const { events, currentPhases } = parsePhaseChanges(feature, []);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('Planning phase started');
    expect(events[0].status).toBe('in-progress');
    expect(currentPhases).toEqual([{ id: 'planning', label: 'Planning', status: 'success' }]);
  });

  it('emits "completed" event when a phase transitions to success', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([{ id: 'planning', label: 'Planning', status: 'success' }])
    );

    const prev = [{ id: 'planning', label: 'Planning', status: 'skipped' as const }];
    const { events } = parsePhaseChanges(feature, prev);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('Planning phase completed');
    expect(events[0].status).toBe('success');
  });

  it('emits "failed" event when a phase transitions to failed', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([{ id: 'implementation', label: 'Implementation', status: 'failed' }])
    );

    const prev = [{ id: 'implementation', label: 'Implementation', status: 'skipped' as const }];
    const { events } = parsePhaseChanges(feature, prev);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('Implementation phase failed');
    expect(events[0].status).toBe('error');
  });

  it('returns no events when phases have not changed', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([{ id: 'planning', label: 'Planning', status: 'success' }])
    );

    const prev = [{ id: 'planning', label: 'Planning', status: 'success' as const }];
    const { events } = parsePhaseChanges(feature, prev);
    expect(events).toHaveLength(0);
  });

  it('handles non-array JSON gracefully and preserves lastKnownPhases', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ not: 'array' }));
    const prev = [{ id: 'planning', label: 'Planning', status: 'success' as const }];
    const result = parsePhaseChanges(feature, prev);
    expect(result.events).toEqual([]);
    expect(result.currentPhases).toBe(prev);
  });

  it('skips malformed phase entries missing required fields', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([
        { id: 'planning', label: 'Planning', status: 'success' },
        { id: 'bad-entry' }, // missing label and status
        { notAPhase: true },
      ])
    );

    const { events, currentPhases } = parsePhaseChanges(feature, []);
    // Only the valid phase should produce an event
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('Planning phase started');
    expect(currentPhases).toHaveLength(1);
  });

  it('does not emit events for non-terminal status transitions', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([{ id: 'planning', label: 'Planning', status: 'skipped' }])
    );

    const prev = [{ id: 'planning', label: 'Planning', status: 'skipped' as const }];
    const { events } = parsePhaseChanges(feature, prev);
    expect(events).toHaveLength(0);
  });

  it('returns empty array and does not throw on non-ENOENT read error', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });

    const result = parsePhaseChanges(feature);
    expect(result.events).toEqual([]);
  });
});

describe('readLoopStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make pgrep return no match (exit code 1) so isProcessRunning returns false
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      throw Object.assign(new Error('no match'), { status: 1 });
    });
  });

  it('should parse 4-field tokens file (input|output|cache_create|cache_read)', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path === '/tmp/ralph-loop-test-tokens4.status') return true;
      if (path === '/tmp/ralph-loop-test-tokens4.tokens') return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path === '/tmp/ralph-loop-test-tokens4.status') return '2|10|1700000000';
      if (path === '/tmp/ralph-loop-test-tokens4.tokens') return '277|2105|582599|14145458';
      throw new Error(`Unexpected read: ${path}`);
    });

    const status = readLoopStatus('test-tokens4');
    expect(status.tokensInput).toBe(277);
    expect(status.tokensOutput).toBe(2105);
    expect(status.cacheCreate).toBe(582599);
    expect(status.cacheRead).toBe(14145458);
  });

  it('should parse legacy 2-field tokens file with cache defaulting to 0', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path === '/tmp/ralph-loop-test-legacy2.status') return true;
      if (path === '/tmp/ralph-loop-test-legacy2.tokens') return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path === '/tmp/ralph-loop-test-legacy2.status') return '1|5|1700000000';
      if (path === '/tmp/ralph-loop-test-legacy2.tokens') return '1000|500';
      throw new Error(`Unexpected read: ${path}`);
    });

    const status = readLoopStatus('test-legacy2');
    expect(status.tokensInput).toBe(1000);
    expect(status.tokensOutput).toBe(500);
    expect(status.cacheCreate).toBe(0);
    expect(status.cacheRead).toBe(0);
  });
});
