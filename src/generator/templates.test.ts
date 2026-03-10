/**
 * Tests for extractVariables appDir resolution
 *
 * Run with: npx vitest run src/generator/templates.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractVariables } from './templates.js';
import type { ScanResult } from '../scanner/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readFeatureLoopTemplate(): string {
  const templatePath = join(__dirname, '..', 'templates', 'scripts', 'feature-loop.sh.tmpl');
  return readFileSync(templatePath, 'utf-8');
}

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

describe('feature-loop.sh.tmpl — verify phase removal', () => {
  it('does not invoke run_claude_prompt with PROMPT_verify.md', () => {
    const template = readFeatureLoopTemplate();
    // No line should call run_claude_prompt with PROMPT_verify.md
    expect(template).not.toMatch(/run_claude_prompt[^#\n]*PROMPT_verify\.md/);
  });

  it('keeps write_phase_start and write_phase_end for verification as no-op marker', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('write_phase_start "verification"');
    expect(template).toContain('write_phase_end "verification" "skipped"');
  });
});

describe('review prompt templates — Step 0 verification', () => {
  function readReviewTemplate(name: string): string {
    const templatePath = join(__dirname, '..', 'templates', 'prompts', name);
    return readFileSync(templatePath, 'utf-8');
  }

  it('PROMPT_review_manual.md.tmpl contains Step 0: Verify Spec Requirements', () => {
    const template = readReviewTemplate('PROMPT_review_manual.md.tmpl');
    expect(template).toMatch(/Step 0.*Verify Spec Requirements/i);
  });

  it('PROMPT_review_auto.md.tmpl contains Step 0: Verify Spec Requirements', () => {
    const template = readReviewTemplate('PROMPT_review_auto.md.tmpl');
    expect(template).toMatch(/Step 0.*Verify Spec Requirements/i);
  });

  it('PROMPT_review_merge.md.tmpl contains Step 0: Verify Spec Requirements', () => {
    const template = readReviewTemplate('PROMPT_review_merge.md.tmpl');
    expect(template).toMatch(/Step 0.*Verify Spec Requirements/i);
  });

  it('all 3 review templates include spec status update instruction', () => {
    const templates = [
      readReviewTemplate('PROMPT_review_manual.md.tmpl'),
      readReviewTemplate('PROMPT_review_auto.md.tmpl'),
      readReviewTemplate('PROMPT_review_merge.md.tmpl'),
    ];
    for (const template of templates) {
      expect(template).toContain('**Status:**');
    }
  });

  it('all 3 review templates include acceptance criteria check instruction', () => {
    const templates = [
      readReviewTemplate('PROMPT_review_manual.md.tmpl'),
      readReviewTemplate('PROMPT_review_auto.md.tmpl'),
      readReviewTemplate('PROMPT_review_merge.md.tmpl'),
    ];
    for (const template of templates) {
      expect(template).toContain('Acceptance Criteria');
    }
  });

  it('all 3 review templates include README/docs update instruction', () => {
    const templates = [
      readReviewTemplate('PROMPT_review_manual.md.tmpl'),
      readReviewTemplate('PROMPT_review_auto.md.tmpl'),
      readReviewTemplate('PROMPT_review_merge.md.tmpl'),
    ];
    for (const template of templates) {
      expect(template).toContain('README.md');
    }
  });
});

describe('feature-loop.sh.tmpl — resume invocation', () => {
  it('contains run_claude_resume helper function', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('run_claude_resume()');
  });

  it('run_claude_resume builds resume command with --resume flag', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('--resume');
    expect(template).toContain('run_claude_resume');
  });

  it('contains CONTINUATION_PROMPT variable', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('CONTINUATION_PROMPT=');
  });

  it('CONTINUATION_PROMPT instructs to continue implementation tasks', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('Continue implementing the remaining tasks');
    expect(template).toContain('Skip any E2E testing tasks');
  });

  it('implementation loop branches on iteration 1 for fresh prompt', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('[ $ITERATION -eq 1 ]');
    expect(template).toContain('Mode: fresh');
  });

  it('implementation loop uses resume for iterations 2+', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('Mode: resume (session:');
    expect(template).toContain('run_claude_resume "$LAST_SESSION_ID"');
  });

  it('contains fallback logic that triggers run_claude_prompt on resume failure', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('Fallback: using fresh prompt');
    // After resume path, there must be a fallback run_claude_prompt call
    const resumeIndex = template.indexOf('run_claude_resume "$LAST_SESSION_ID"');
    const fallbackIndex = template.indexOf('Fallback: using fresh prompt');
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(resumeIndex);
  });

  it('logs resume failure reason categories', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('resume_exit_nonzero');
    expect(template).toContain('resume_no_session_id');
  });

  it('produces raw output artifacts for both resume and fallback paths via tee', () => {
    const template = readFeatureLoopTemplate();
    // Count tee occurrences in the implementation loop section — both paths use tee
    const implSection = template.slice(
      template.indexOf('IMPLEMENTATION PHASE'),
      template.indexOf('E2E PHASE') !== -1 ? template.indexOf('E2E PHASE') : template.length
    );
    const teeMatches = implSection.match(/\| tee "\$\{CLAUDE_OUTPUT\}\.raw"/g) ?? [];
    expect(teeMatches.length).toBeGreaterThanOrEqual(3); // fresh, resume, and fallback paths
  });
});
