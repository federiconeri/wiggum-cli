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

  it('auto and merge review templates require waiting for CI checks before approval', () => {
    const autoTemplate = readReviewTemplate('PROMPT_review_auto.md.tmpl');
    const mergeTemplate = readReviewTemplate('PROMPT_review_merge.md.tmpl');
    expect(autoTemplate).toContain('gh pr checks feat/$FEATURE --watch --interval 10');
    expect(mergeTemplate).toContain('gh pr checks feat/$FEATURE --watch --interval 10');
  });

  it('merge review template delegates final merge to harness', () => {
    const template = readReviewTemplate('PROMPT_review_merge.md.tmpl');
    expect(template).toContain('Do **NOT** run `gh pr merge` in this prompt.');
    expect(template).toContain('The loop harness performs the final merge');
    expect(template).not.toContain('### Step 7: Post-Merge Cleanup');
    expect(template).not.toContain('git -C {{appDir}} checkout main && git -C {{appDir}} pull');
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
    expect(template).toContain("DEFAULT_CODEX_MODEL=$(node -e \"console.log(require('$CONFIG_PATH').loop?.codexModel || 'gpt-5.3-codex')\"");
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
    expect(template).toContain('resolve_codex_model()');
    expect(template).toContain('get_phase_cmd()');
    expect(template).toContain('PLANNING_CMD=$(get_phase_cmd "planning")');
    expect(template).toContain('IMPL_CMD=$(get_phase_cmd "implementation")');
    expect(template).toContain('REVIEW_CMD=$(get_phase_cmd "review")');
  });

  it('supports codex exec and codex exec resume JSON paths', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toMatch(/codex exec --full-auto -C \\"\$APP_DIR\\" --model \\"\$\{model\}\\"/);
    expect(template).toContain('eval "$claude_cmd --json --output-last-message \\"$LAST_MESSAGE_FILE\\" -"');
    expect(template).toContain('local resume_cmd="${claude_cmd/ exec / exec resume }"');
    expect(template).toContain('resume_cmd="${resume_cmd/ -C \\"$APP_DIR\\"/}"');
    expect(template).toContain('cd "$APP_DIR" && eval "$resume_cmd \\"$session_id\\" - --json --output-last-message \\"$LAST_MESSAGE_FILE\\""');
  });

  it('extracts Codex token usage using multiple key shapes without overcounting repeated events', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain("or to_int(usage.get('prompt_tokens'))");
    expect(template).toContain("or to_int(usage.get('completion_tokens'))");
    expect(template).toContain('Use the highest observed values from a single run to avoid overcounting');
    expect(template).toContain('print(f\\"{max_input}|{max_output}|0|0\\")');
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

  it('uses a Codex model default across Codex phases and keeps Claude models Claude-only', () => {
    const template = readFeatureLoopTemplate();
    const getPhaseModelSection = template.slice(
      template.indexOf('get_phase_model()'),
      template.indexOf('get_phase_cmd()')
    );
    expect(getPhaseModelSection).toContain('if [ "$cli" = "codex" ]; then');
    expect(getPhaseModelSection).toContain('resolve_codex_model');
    expect(getPhaseModelSection).toContain('planning|review');
    expect(template).toContain("WARNING: --model '$MODEL' is Claude-specific. Codex phases will use '$DEFAULT_CODEX_MODEL'.");
  });

  it('checks required binaries for selected CLIs', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('check_cli_binary "$CODING_CLI"');
    expect(template).toContain('if [ "$REVIEW_CLI" != "$CODING_CLI" ]; then');
    expect(template).toContain('check_cli_binary "$REVIEW_CLI"');
  });

  it('parses review-fix output with implementation CLI adapter', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('local impl_cli="$CODING_CLI"');
    expect(template).toContain('impl_cmd="$IMPL_CMD --json --output-last-message \\"$LAST_MESSAGE_FILE\\""');
    expect(template).toContain('extract_session_result "${CLAUDE_OUTPUT}.raw" "$impl_cli"');
    expect(template).toContain('accumulate_tokens_from_session "$LAST_SESSION_ID" "${CLAUDE_OUTPUT}.raw" "$impl_cli"');
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

describe('PROMPT_e2e.md.tmpl — trimmed content requirements', () => {
  function readE2ePromptTemplate(): string {
    const templatePath = join(__dirname, '..', 'templates', 'prompts', 'PROMPT_e2e.md.tmpl');
    return readFileSync(templatePath, 'utf-8');
  }

  it('does not contain Playwright MCP Tool Reference section', () => {
    const template = readE2ePromptTemplate();
    expect(template).not.toContain('Playwright MCP Tool Reference');
  });

  it('does not contain Assertion Patterns section', () => {
    const template = readE2ePromptTemplate();
    expect(template).not.toContain('## Assertion Patterns');
  });

  it('does not contain Browser State Management section', () => {
    const template = readE2ePromptTemplate();
    expect(template).not.toContain('## Browser State Management');
  });

  it('does not contain Troubleshooting section', () => {
    const template = readE2ePromptTemplate();
    expect(template).not.toContain('## Troubleshooting');
  });

  it('TUI cheatsheet has 4 or fewer data rows', () => {
    const template = readE2ePromptTemplate();
    const tuiBlock = template.slice(0, template.indexOf('{{else}}'));
    const cheatsheetStart = tuiBlock.indexOf('### TUI Interaction Cheatsheet');
    const cheatsheetEnd = tuiBlock.indexOf('### Key Rules');
    const cheatsheet = tuiBlock.slice(cheatsheetStart, cheatsheetEnd);
    // Count data rows (lines starting with | but not the header or separator rows)
    const rows = cheatsheet.split('\n').filter((line) => {
      return line.startsWith('|') && !line.includes('---') && !line.includes('Action');
    });
    expect(rows.length).toBeLessThanOrEqual(4);
  });

  it('Learning Capture is a single concise directive referencing LEARNINGS.md', () => {
    const template = readE2ePromptTemplate();
    // Check TUI Learning Capture (before {{else}})
    const tuiBlock = template.slice(0, template.indexOf('{{else}}'));
    const tuiLearningStart = tuiBlock.indexOf('## Learning Capture\n');
    const tuiLearningContent = tuiBlock.slice(tuiLearningStart);
    expect(tuiLearningContent).toContain('LEARNINGS.md');
    // Should not have bullet-point list (was condensed from multi-line)
    const tuiLines = tuiLearningContent.split('\n').filter((l) => l.startsWith('-'));
    expect(tuiLines.length).toBe(0);

    // Check non-TUI Learning Capture (after {{else}})
    const nonTuiBlock = template.slice(template.indexOf('{{else}}'));
    const nonTuiLearningStart = nonTuiBlock.indexOf('## Learning Capture\n');
    const nonTuiLearningContent = nonTuiBlock.slice(nonTuiLearningStart);
    expect(nonTuiLearningContent).toContain('LEARNINGS.md');
    const nonTuiLines = nonTuiLearningContent.split('\n').filter((l) => l.startsWith('-'));
    expect(nonTuiLines.length).toBe(0);
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

describe('PROMPT_feature.md.tmpl — trimmed content requirements', () => {
  function readFeaturePromptTemplate(): string {
    const templatePath = join(__dirname, '..', 'templates', 'prompts', 'PROMPT_feature.md.tmpl');
    return readFileSync(templatePath, 'utf-8');
  }

  it('does not contain the full worked Implementation Plan example', () => {
    const template = readFeaturePromptTemplate();
    expect(template).not.toContain('Submit Survey');
    expect(template).not.toContain('Init in bare project');
  });

  it('contains checkbox syntax instruction', () => {
    const template = readFeaturePromptTemplate();
    expect(template).toContain('- [ ]');
  });

  it('contains E2E task pattern instruction', () => {
    const template = readFeaturePromptTemplate();
    expect(template).toContain('- [ ] E2E:');
  });

  it('contains required phase names', () => {
    const template = readFeaturePromptTemplate();
    expect(template).toContain('Setup');
    expect(template).toContain('Core Implementation');
    expect(template).toContain('Tests');
    expect(template).toContain('Polish');
    expect(template).toContain('E2E Testing');
  });

  it('contains complexity markers', () => {
    const template = readFeaturePromptTemplate();
    expect(template).toContain('[S');
    expect(template).toContain('M/L');
  });

  it('does not contain explicit MCP tool references', () => {
    const template = readFeaturePromptTemplate();
    expect(template).not.toContain('Supabase MCP');
    expect(template).not.toContain('PostHog MCP');
    expect(template).not.toContain('/frontend-design');
  });

  it('is 50 lines or fewer', () => {
    const template = readFeaturePromptTemplate();
    const lines = template.split('\n').length;
    expect(lines).toBeLessThanOrEqual(50);
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

  it('merge mode blocks on CI checks and merges through script gate', () => {
    const template = readFeatureLoopTemplate();
    expect(template).toContain('wait_for_ci_checks()');
    expect(template).toContain('gh pr checks "$pr_ref" --watch --interval 10');
    expect(template).toContain('merge_pr_after_ci_gate()');
    expect(template).toContain('wait_for_ci_checks "$BRANCH"');
    expect(template).toContain('merge_pr_after_ci_gate "$BRANCH"');
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
