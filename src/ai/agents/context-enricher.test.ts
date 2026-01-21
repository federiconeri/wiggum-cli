/**
 * Tests for Context Enricher
 *
 * Run with: npx vitest run src/ai/agents/context-enricher.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deriveCommandsFromScripts, SCRIPT_MAPPINGS } from './context-enricher.js';

describe('deriveCommandsFromScripts', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `wiggum-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty object when package.json does not exist', () => {
    const result = deriveCommandsFromScripts(testDir);
    expect(result).toEqual({});
  });

  it('returns empty object when package.json has no scripts', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result).toEqual({});
  });

  it('returns empty object when scripts is empty', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ scripts: {} }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result).toEqual({});
  });

  it('detects test script', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest run' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.test).toBe('npm run test');
  });

  it('detects vitest as test command', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { vitest: 'vitest' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.test).toBe('npm run vitest');
  });

  it('prefers test over vitest (first match wins)', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'npm run vitest',
        vitest: 'vitest',
      },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.test).toBe('npm run test');
  });

  it('detects lint script', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { lint: 'eslint .' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.lint).toBe('npm run lint');
  });

  it('detects eslint as lint command', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { eslint: 'eslint .' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.lint).toBe('npm run eslint');
  });

  it('detects typecheck script', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { typecheck: 'tsc --noEmit' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.typecheck).toBe('npm run typecheck');
  });

  it('detects tsc as typecheck command', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { tsc: 'tsc --noEmit' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.typecheck).toBe('npm run tsc');
  });

  it('detects build script', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { build: 'tsc' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.build).toBe('npm run build');
  });

  it('detects dev script', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { dev: 'next dev' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.dev).toBe('npm run dev');
  });

  it('detects format script', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { format: 'prettier --write .' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.format).toBe('npm run format');
  });

  it('detects prettier as format command', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: { prettier: 'prettier --write .' },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result.format).toBe('npm run prettier');
  });

  it('detects multiple commands', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'vitest run',
        lint: 'eslint .',
        build: 'tsc',
        dev: 'tsx watch src/index.ts',
      },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result).toEqual({
      test: 'npm run test',
      lint: 'npm run lint',
      build: 'npm run build',
      dev: 'npm run dev',
    });
  });

  it('handles malformed JSON gracefully', () => {
    writeFileSync(join(testDir, 'package.json'), '{ invalid json }');
    const result = deriveCommandsFromScripts(testDir);
    expect(result).toEqual({});
  });

  it('ignores scripts not in SCRIPT_MAPPINGS', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      scripts: {
        'custom-script': 'do something',
        'my-task': 'run task',
        test: 'vitest',
      },
    }));
    const result = deriveCommandsFromScripts(testDir);
    expect(result).toEqual({ test: 'npm run test' });
    expect(result['custom-script']).toBeUndefined();
    expect(result['my-task']).toBeUndefined();
  });
});

describe('SCRIPT_MAPPINGS', () => {
  it('has all expected command categories', () => {
    expect(SCRIPT_MAPPINGS).toHaveProperty('test');
    expect(SCRIPT_MAPPINGS).toHaveProperty('lint');
    expect(SCRIPT_MAPPINGS).toHaveProperty('typecheck');
    expect(SCRIPT_MAPPINGS).toHaveProperty('build');
    expect(SCRIPT_MAPPINGS).toHaveProperty('dev');
    expect(SCRIPT_MAPPINGS).toHaveProperty('format');
  });

  it('has patterns for each category', () => {
    for (const [category, patterns] of Object.entries(SCRIPT_MAPPINGS)) {
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    }
  });
});
