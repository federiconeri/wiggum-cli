/**
 * Tests for extractVariables appDir resolution
 *
 * Run with: npx vitest run src/generator/templates.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractVariables } from './templates.js';
import type { ScanResult } from '../scanner/types.js';

function makeScanResult(overrides: {
  projectRoot: string;
  frameworkVariant?: string;
}): ScanResult {
  return {
    projectRoot: overrides.projectRoot,
    stack: {
      framework: {
        name: 'react',
        confidence: 100,
        evidence: [],
        variant: overrides.frameworkVariant,
      },
    },
    scanTime: 0,
  };
}

describe('extractVariables - appDir resolution', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `wiggum-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('defaults appDir to "." when no src entry files exist', () => {
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('.');
  });

  it('sets appDir to "src" when src/index.ts exists', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.ts'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('src');
  });

  it('sets appDir to "src" when src/index.tsx exists', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.tsx'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('src');
  });

  it('sets appDir to "src" when src/main.ts exists', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'main.ts'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('src');
  });

  it('sets appDir to "app" when frameworkVariant is "app-router"', () => {
    // Even if src entry files exist, app-router takes precedence
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.ts'), '');
    const result = extractVariables(
      makeScanResult({ projectRoot: testDir, frameworkVariant: 'app-router' })
    );
    expect(result.appDir).toBe('app');
  });

  it('defaults appDir to "." when src dir exists but has no entry files', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'utils.ts'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('.');
  });
});

describe('extractVariables - isTui detection', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `wiggum-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('sets isTui to "true" when ink is in dependencies', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'tui-app',
      dependencies: { ink: '^5.0.0', react: '^18.0.0' },
    }));
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.isTui).toBe('true');
  });

  it('sets isTui to "true" when ink is in devDependencies', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'tui-app',
      devDependencies: { ink: '^5.0.0' },
    }));
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.isTui).toBe('true');
  });

  it('sets isTui to "" when ink is not present', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'web-app',
      dependencies: { react: '^18.0.0', next: '^14.0.0' },
    }));
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.isTui).toBe('');
  });

  it('sets isTui to "" when no package.json exists', () => {
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.isTui).toBe('');
  });
});
