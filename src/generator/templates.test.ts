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

describe('feature-loop.sh.tmpl — CLI adapter routing', () => {
  it('defines implementation/review CLI defaults from config with claude fallback', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain("DEFAULT_CODING_CLI=$(node -e \"console.log(require('$CONFIG_PATH').loop?.codingCli || 'claude')\"");
    expect(template).toContain("DEFAULT_REVIEW_CLI=$(node -e \"console.log(require('$CONFIG_PATH').loop?.reviewCli || require('$CONFIG_PATH').loop?.codingCli || 'claude')\"");
  });

  it('parses --cli and --review-cli flags', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('--cli)');
    expect(template).toContain('--review-cli)');
    expect(template).toContain('CODING_CLI="${CLI_OVERRIDE:-$DEFAULT_CODING_CLI}"');
    expect(template).toContain('REVIEW_CLI="${REVIEW_CLI_OVERRIDE:-${DEFAULT_REVIEW_CLI:-$CODING_CLI}}"');
  });

  it('includes phase-aware CLI selection helpers', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('build_cli_cmd()');
    expect(template).toContain('get_phase_cli()');
    expect(template).toContain('get_phase_cmd()');
    expect(template).toContain('PLANNING_CMD=$(get_phase_cmd "planning")');
    expect(template).toContain('IMPL_CMD=$(get_phase_cmd "implementation")');
    expect(template).toContain('REVIEW_CMD=$(get_phase_cmd "review")');
  });

  it('supports codex exec and codex exec resume JSON paths', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toMatch(/codex exec --full-auto -C \\"\$APP_DIR\\" --model \\"\$\{model\}\\"/);
    expect(template).toContain('eval "$claude_cmd --json --output-last-message');
    expect(template).toContain('local resume_cmd="${claude_cmd/ exec / exec resume }"');
    expect(template).toContain('eval "$resume_cmd \\"$session_id\\" - --json --output-last-message \\"$LAST_MESSAGE_FILE\\""');
  });

  it('routes review phases independently from implementation phases', () => {
    const template = readFeatureLoopTemplate();
    const getPhaseCliSection = template.slice(
      template.indexOf('get_phase_cli()'),
      template.indexOf('get_phase_model()')
    );
    expect(getPhaseCliSection).toContain('review)');
    expect(getPhaseCliSection).toContain('echo "$REVIEW_CLI"');
    expect(getPhaseCliSection).toContain('echo "$CODING_CLI"');
    expect(template).toContain('run_claude_prompt "$PROMPTS_DIR/PROMPT_review_manual.md" "$REVIEW_CMD"');
    expect(template).toContain('run_claude_prompt "$PROMPTS_DIR/PROMPT.md" "$IMPL_CMD"');
  });

  it('checks required binaries for selected CLIs', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('check_cli_binary "$CODING_CLI"');
    expect(template).toContain('if [ "$REVIEW_CLI" != "$CODING_CLI" ]; then');
    expect(template).toContain('check_cli_binary "$REVIEW_CLI"');
  });
});

describe('feature-loop.sh.tmpl — E2E loop resume', () => {
  it('initializes E2E_SESSION_ID variable before E2E loop', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('E2E_SESSION_ID=""');
  });

  it('E2E loop branches on attempt 1 for full prompt', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('[ $E2E_ATTEMPT -eq 1 ]');
    expect(template).toContain('E2E attempt $E2E_ATTEMPT: using full prompt');
  });

  it('E2E loop uses run_claude_resume for attempts 2+', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('E2E attempt $E2E_ATTEMPT: using resume session');
    expect(template).toContain('run_claude_resume "$E2E_SESSION_ID"');
  });

  it('E2E_CONTINUATION_PROMPT contains instruction about unchecked E2E entries', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('E2E_CONTINUATION_PROMPT=');
    expect(template).toContain('unchecked');
    expect(template).toContain('E2E:');
  });

  it('E2E resume fallback logs warning and uses full prompt', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('E2E attempt $E2E_ATTEMPT: resume unavailable, using full prompt');
    // Fallback path re-runs run_claude_prompt with PROMPT_e2e.md
    const e2eSection = template.slice(
      template.indexOf('E2E TESTING PHASE'),
      template.indexOf('Phase 6')
    );
    const e2ePromptMatches = e2eSection.match(/run_claude_prompt "\$PROMPTS_DIR\/PROMPT_e2e\.md"/g) ?? [];
    expect(e2ePromptMatches.length).toBeGreaterThanOrEqual(2); // first attempt + fallback
  });

  it('E2E fix iteration uses resume when session ID available', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('E2E fix: using resume session');
    expect(template).toContain('E2E fix: resume unavailable, using full prompt');
  });
});

describe('PROMPT_e2e_fix.md.tmpl — content requirements', () => {
  function readPromptTemplate(name: string): string {
    const templatePath = join(__dirname, '..', 'templates', 'prompts', name);
    return readFileSync(templatePath, 'utf-8');
  }

  it('PROMPT_e2e_fix.md.tmpl exists', () => {
    expect(() => readPromptTemplate('PROMPT_e2e_fix.md.tmpl')).not.toThrow();
  });

  it('references implementation plan for failure details', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).toContain('$FEATURE-implementation-plan.md');
  });

  it('references spec file for behavioral constraints', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).toContain('$FEATURE.md');
  });

  it('includes testCommand validation step', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).toContain('{{testCommand}}');
  });

  it('contains isTui conditional block', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).toContain('{{#if isTui}}');
    expect(template).toContain('{{else}}');
  });

  it('does not reference PERFORMANCE.md', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).not.toContain('PERFORMANCE.md');
  });

  it('does not reference SECURITY.md', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).not.toContain('SECURITY.md');
  });

  it('does not reference FRONTEND.md', () => {
    const template = readPromptTemplate('PROMPT_e2e_fix.md.tmpl');
    expect(template).not.toContain('FRONTEND.md');
  });
});

describe('feature-loop.sh.tmpl — E2E fix prompt reference', () => {
  it('E2E fix fallback uses PROMPT_e2e_fix.md not PROMPT.md', () => {
    const template = readFeatureLoopTemplate();
    const e2eFixSection = template.slice(
      template.indexOf('E2E tests have failures'),
      template.indexOf('E2E tests have failures') + 1000
    );
    expect(e2eFixSection).toContain('PROMPT_e2e_fix.md');
    expect(e2eFixSection).not.toContain('"$PROMPTS_DIR/PROMPT.md"');
  });

  it('E2E initial attempt still uses PROMPT_e2e.md', () => {
    const template = readFeatureLoopTemplate();
    const e2eSection = template.slice(
      template.indexOf('E2E TESTING PHASE'),
      template.indexOf('Phase 6')
    );
    expect(e2eSection).toMatch(/run_claude_prompt "\$PROMPTS_DIR\/PROMPT_e2e\.md"/);
  });
});

describe('feature-loop.sh.tmpl — review loop resume', () => {
  it('initializes REVIEW_SESSION_ID variable before review branches', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('REVIEW_SESSION_ID=""');
  });

  it('REVIEW_CONTINUATION_PROMPT contains re-review instruction', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('REVIEW_CONTINUATION_PROMPT=');
    expect(template).toContain('issues from the previous review have been fixed');
  });

  it('merge review loop branches on attempt 1 for full prompt', () => {
    const template = readFeatureLoopTemplate();
    const mergeSection = template.slice(
      template.indexOf("REVIEW_MODE\" = \"merge\""),
      template.indexOf("REVIEW_MODE\" = \"merge\"") + 2000
    );
    expect(mergeSection).toContain('Review attempt $REVIEW_ATTEMPT: using full prompt');
    expect(mergeSection).toContain('PROMPT_review_merge.md');
  });

  it('merge review loop uses run_claude_resume for attempts 2+', () => {
    const template = readFeatureLoopTemplate();
    const mergeSection = template.slice(
      template.indexOf("REVIEW_MODE\" = \"merge\""),
      template.indexOf("REVIEW_MODE\" = \"merge\"") + 2000
    );
    expect(mergeSection).toContain('Review attempt $REVIEW_ATTEMPT: using resume session');
    expect(mergeSection).toContain('run_claude_resume "$REVIEW_SESSION_ID"');
  });

  it('auto review loop branches on attempt 1 for full prompt', () => {
    const template = readFeatureLoopTemplate();
    // auto mode is in the else branch after merge
    const autoSection = template.slice(
      template.indexOf('Auto mode: create PR'),
      template.indexOf('Auto mode: create PR') + 2000
    );
    expect(autoSection).toContain('Review attempt $REVIEW_ATTEMPT: using full prompt');
    expect(autoSection).toContain('PROMPT_review_auto.md');
  });

  it('auto review loop uses run_claude_resume for attempts 2+', () => {
    const template = readFeatureLoopTemplate();
    const autoSection = template.slice(
      template.indexOf('Auto mode: create PR'),
      template.indexOf('Auto mode: create PR') + 2000
    );
    expect(autoSection).toContain('Review attempt $REVIEW_ATTEMPT: using resume session');
    expect(autoSection).toContain('run_claude_resume "$REVIEW_SESSION_ID"');
  });

  it('review resume fallback logs warning and uses full prompt', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('Review attempt $REVIEW_ATTEMPT: resume unavailable, using full prompt');
  });

  it('manual review mode does NOT contain resume logic', () => {
    const template = readFeatureLoopTemplate();
    const manualSection = template.slice(
      template.indexOf("REVIEW_MODE\" = \"manual\""),
      template.indexOf("REVIEW_MODE\" = \"merge\"")
    );
    expect(manualSection).not.toContain('run_claude_resume');
  });

  it('E2E and review use separate session ID variables', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('E2E_SESSION_ID');
    expect(template).toContain('REVIEW_SESSION_ID');
    // They should be different variables
    expect(template.indexOf('E2E_SESSION_ID')).not.toBe(template.indexOf('REVIEW_SESSION_ID'));
  });
});
