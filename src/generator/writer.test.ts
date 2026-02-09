import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFiles } from './writer.js';

describe('writer - LEARNINGS.md behavior', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `wiggum-writer-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('preserves existing LEARNINGS.md and skips overwrite', async () => {
    const ralphDir = join(testDir, '.ralph');
    mkdirSync(ralphDir, { recursive: true });
    const learningsPath = join(ralphDir, 'LEARNINGS.md');
    const original = '# Learnings\n\n- Keep this\n';
    writeFileSync(learningsPath, original);

    const files = new Map<string, string>([
      ['.ralph/LEARNINGS.md', '# Learnings\n\n- Template\n'],
    ]);

    const summary = await writeFiles(files, testDir, {
      existingFiles: 'backup',
      createBackups: true,
      verbose: false,
    });

    expect(summary.skipped).toBe(1);
    const content = readFileSync(learningsPath, 'utf-8');
    expect(content).toBe(original);
    const backups = readdirSync(ralphDir).filter((f) =>
      f.startsWith('.LEARNINGS.md.backup-')
    );
    expect(backups.length).toBe(0);
  });

  it('creates LEARNINGS.md when missing', async () => {
    const files = new Map<string, string>([
      ['.ralph/LEARNINGS.md', '# Learnings\n\n- Template\n'],
    ]);

    const summary = await writeFiles(files, testDir, {
      existingFiles: 'backup',
      createBackups: true,
      verbose: false,
    });

    const learningsPath = join(testDir, '.ralph', 'LEARNINGS.md');
    const content = readFileSync(learningsPath, 'utf-8');
    expect(content).toContain('# Learnings');
    expect(summary.created).toBe(1);
  });

  it('stores .ralph backups under .ralph/.backups', async () => {
    const ralphDir = join(testDir, '.ralph', 'guides');
    mkdirSync(ralphDir, { recursive: true });
    const targetPath = join(ralphDir, 'AGENTS.md');
    writeFileSync(targetPath, 'old content');

    const files = new Map<string, string>([
      ['.ralph/guides/AGENTS.md', 'new content'],
    ]);

    const summary = await writeFiles(files, testDir, {
      existingFiles: 'backup',
      createBackups: true,
      verbose: false,
    });

    expect(summary.backedUp).toBe(1);
    const backupsRoot = join(testDir, '.ralph', '.backups', 'guides');
    const backups = readdirSync(backupsRoot).filter((f) =>
      f.startsWith('AGENTS.md.backup-')
    );
    expect(backups.length).toBe(1);
  });

  it('skips backup when content is identical', async () => {
    const filePath = join(testDir, 'README.md');
    writeFileSync(filePath, 'same content');

    const files = new Map<string, string>([
      ['README.md', 'same content'],
    ]);

    const summary = await writeFiles(files, testDir, {
      existingFiles: 'backup',
      createBackups: true,
      verbose: false,
    });

    expect(summary.skipped).toBe(1);
    const dirEntries = readdirSync(testDir);
    const backups = dirEntries.filter((f) => f.includes('.backup-'));
    expect(backups.length).toBe(0);
  });
});
