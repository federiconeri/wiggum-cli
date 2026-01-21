/**
 * Tests for Codebase Analyzer
 *
 * Run with: npx vitest run src/ai/agents/codebase-analyzer.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deriveEntryPointsFromPackageJson } from './codebase-analyzer.js';

describe('deriveEntryPointsFromPackageJson', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `wiggum-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty array when package.json does not exist', () => {
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when package.json has no bin, main, or module', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toEqual([]);
  });

  it('extracts bin field as string', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-cli',
      bin: 'bin/cli.js',
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toContain('bin/cli.js');
  });

  it('extracts bin field as object', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-cli',
      bin: {
        'my-cli': 'bin/cli.js',
        'my-tool': 'bin/tool.js',
      },
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toContain('bin/cli.js');
    expect(result).toContain('bin/tool.js');
  });

  it('extracts main field', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-lib',
      main: 'src/index.js',
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toContain('src/index.js');
  });

  it('extracts module field', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-lib',
      module: 'src/index.mjs',
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toContain('src/index.mjs');
  });

  it('deduplicates entry points', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-lib',
      main: 'src/index.js',
      module: 'src/index.js', // Same as main
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toEqual(['src/index.js']);
  });

  it('filters out dist/ paths', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-lib',
      main: 'dist/index.js',
      module: 'src/index.mjs',
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).not.toContain('dist/index.js');
    expect(result).toContain('src/index.mjs');
  });

  it('handles combined bin, main, and module fields', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-cli',
      bin: { cli: 'bin/cli.js' },
      main: 'src/index.js',
      module: 'src/index.mjs',
    }));
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toContain('bin/cli.js');
    expect(result).toContain('src/index.js');
    expect(result).toContain('src/index.mjs');
  });

  it('handles invalid JSON gracefully', () => {
    writeFileSync(join(testDir, 'package.json'), 'not valid json');
    const result = deriveEntryPointsFromPackageJson(testDir);
    expect(result).toEqual([]);
  });
});
