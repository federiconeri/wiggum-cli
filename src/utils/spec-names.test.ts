import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listSpecNames } from './spec-names.js';

describe('listSpecNames', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-names-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty array for non-existent directory', async () => {
    const result = await listSpecNames(join(tempDir, 'does-not-exist'));
    expect(result).toEqual([]);
  });

  it('returns empty array for empty directory', async () => {
    const result = await listSpecNames(tempDir);
    expect(result).toEqual([]);
  });

  it('returns spec names without .md extension', async () => {
    writeFileSync(join(tempDir, 'auth-system.md'), '');
    writeFileSync(join(tempDir, 'user-profile.md'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['auth-system', 'user-profile']);
  });

  it('filters out non-.md files', async () => {
    writeFileSync(join(tempDir, 'spec.md'), '');
    writeFileSync(join(tempDir, 'notes.txt'), '');
    writeFileSync(join(tempDir, 'README'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['spec']);
  });

  it('excludes subdirectories', async () => {
    writeFileSync(join(tempDir, 'top-level.md'), '');
    const subDir = join(tempDir, 'nested');
    mkdirSync(subDir);
    writeFileSync(join(subDir, 'nested-spec.md'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['top-level']);
  });

  it('excludes README.md', async () => {
    writeFileSync(join(tempDir, 'README.md'), '');
    writeFileSync(join(tempDir, 'auth-system.md'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['auth-system']);
  });

  it('excludes files starting with underscore', async () => {
    writeFileSync(join(tempDir, '_example.md'), '');
    writeFileSync(join(tempDir, '_template.md'), '');
    writeFileSync(join(tempDir, 'real-spec.md'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['real-spec']);
  });

  it('excludes implementation plan files', async () => {
    writeFileSync(join(tempDir, 'auth-system.md'), '');
    writeFileSync(join(tempDir, 'auth-system-implementation-plan.md'), '');
    writeFileSync(join(tempDir, 'user-profile.md'), '');
    writeFileSync(join(tempDir, 'user-profile-implementation-plan.md'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['auth-system', 'user-profile']);
  });

  it('returns names sorted alphabetically', async () => {
    writeFileSync(join(tempDir, 'zebra.md'), '');
    writeFileSync(join(tempDir, 'apple.md'), '');
    writeFileSync(join(tempDir, 'mango.md'), '');

    const result = await listSpecNames(tempDir);
    expect(result).toEqual(['apple', 'mango', 'zebra']);
  });
});
