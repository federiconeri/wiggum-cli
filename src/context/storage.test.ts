import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveContext, loadContext, getContextAge, CONTEXT_VERSION } from './storage.js';
import type { PersistedContext } from './types.js';

describe('context/storage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-context-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const sampleContext = {
    lastAnalyzedAt: '2026-02-05T12:00:00.000Z',
    gitCommitHash: 'abc1234',
    gitBranch: 'main',
    scanResult: {
      framework: 'React',
      packageManager: 'npm',
    },
    aiAnalysis: {
      projectContext: {
        entryPoints: ['src/index.ts'],
        keyDirectories: { 'src/tui': 'TUI components' },
      },
      commands: { test: 'npm test', build: 'npm run build' },
      implementationGuidelines: ['Use Vitest for tests'],
    },
  };

  describe('saveContext', () => {
    it('creates .ralph directory and writes .context.json', async () => {
      await saveContext(sampleContext, tmpDir);

      const filePath = path.join(tmpDir, '.ralph', '.context.json');
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.version).toBe(CONTEXT_VERSION);
      expect(parsed.lastAnalyzedAt).toBe('2026-02-05T12:00:00.000Z');
      expect(parsed.scanResult.framework).toBe('React');
      expect(parsed.aiAnalysis.commands.test).toBe('npm test');
    });

    it('overwrites existing .context.json', async () => {
      await saveContext(sampleContext, tmpDir);
      await saveContext(
        { ...sampleContext, lastAnalyzedAt: '2026-02-06T12:00:00.000Z' },
        tmpDir,
      );

      const filePath = path.join(tmpDir, '.ralph', '.context.json');
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
      expect(parsed.lastAnalyzedAt).toBe('2026-02-06T12:00:00.000Z');
    });

    it('creates .ralph dir even if it does not exist', async () => {
      const freshDir = path.join(tmpDir, 'sub');
      await fs.mkdir(freshDir);
      await saveContext(sampleContext, freshDir);

      const filePath = path.join(freshDir, '.ralph', '.context.json');
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('loadContext', () => {
    it('returns populated PersistedContext when file exists and is valid', async () => {
      await saveContext(sampleContext, tmpDir);
      const loaded = await loadContext(tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(CONTEXT_VERSION);
      expect(loaded!.scanResult.framework).toBe('React');
      expect(loaded!.aiAnalysis.projectContext?.entryPoints).toEqual(['src/index.ts']);
    });

    it('returns null when file does not exist', async () => {
      const result = await loadContext(tmpDir);
      expect(result).toBeNull();
    });

    it('throws on invalid JSON', async () => {
      const ralphDir = path.join(tmpDir, '.ralph');
      await fs.mkdir(ralphDir, { recursive: true });
      await fs.writeFile(path.join(ralphDir, '.context.json'), 'not json!!!', 'utf8');

      await expect(loadContext(tmpDir)).rejects.toThrow(/invalid JSON/);
    });

    it('throws on missing required fields', async () => {
      const ralphDir = path.join(tmpDir, '.ralph');
      await fs.mkdir(ralphDir, { recursive: true });
      await fs.writeFile(
        path.join(ralphDir, '.context.json'),
        JSON.stringify({ foo: 'bar' }),
        'utf8',
      );

      await expect(loadContext(tmpDir)).rejects.toThrow(/missing required fields/);
    });

    it('throws when scanResult or aiAnalysis are missing', async () => {
      const ralphDir = path.join(tmpDir, '.ralph');
      await fs.mkdir(ralphDir, { recursive: true });
      await fs.writeFile(
        path.join(ralphDir, '.context.json'),
        JSON.stringify({ version: 1, lastAnalyzedAt: '2026-01-01T00:00:00.000Z' }),
        'utf8',
      );

      await expect(loadContext(tmpDir)).rejects.toThrow(/missing required fields/);
    });
  });

  describe('getContextAge', () => {
    it('returns age in days for old contexts', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: twoDaysAgo,
        scanResult: {},
        aiAnalysis: {},
      };
      const { ms, human } = getContextAge(context);
      expect(ms).toBeGreaterThan(0);
      expect(human).toBe('2 days');
    });

    it('returns age in hours for recent contexts', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: threeHoursAgo,
        scanResult: {},
        aiAnalysis: {},
      };
      const { human } = getContextAge(context);
      expect(human).toBe('3 hours');
    });

    it('returns age in minutes for very recent contexts', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: fiveMinutesAgo,
        scanResult: {},
        aiAnalysis: {},
      };
      const { human } = getContextAge(context);
      expect(human).toBe('5 minutes');
    });

    it('returns unknown for invalid date strings', () => {
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: 'not-a-date',
        scanResult: {},
        aiAnalysis: {},
      };
      const { ms, human } = getContextAge(context);
      expect(ms).toBe(0);
      expect(human).toBe('unknown');
    });
  });
});
