# create-targeted-e2e-fix-prompt Implementation Plan

**Spec:** .ralph/specs/create-targeted-e2e-fix-prompt.md
**Branch:** feat/create-targeted-e2e-fix-prompt
**Status:** Completed

## Tasks

### Phase 1: Core Implementation

- [x] Create `src/templates/prompts/PROMPT_e2e_fix.md.tmpl` with targeted E2E remediation instructions - [complexity: M] - f697b8f
  - Model after existing prompt template conventions (same `{{variable}}` syntax, `$FEATURE` env var)
  - **Context section:** Read `@.ralph/guides/AGENTS.md` (commands/patterns), `@.ralph/specs/$FEATURE-implementation-plan.md` (failure details), `@.ralph/specs/$FEATURE.md` (behavioral guardrails)
  - **Learnings section:** Read `@.ralph/LEARNINGS.md` but only E2E-related patterns
  - **Task section:** Focus exclusively on fixing scenarios marked `- [ ] E2E: ... - FAILED` in the implementation plan
  - **Validation section:** Only E2E-relevant: `cd {{appDir}} && {{testCommand}}` (no lint, typecheck, or build — those passed before E2E phase)
  - **Completion section:** Update plan checkboxes, commit, push (same convention as other prompts)
  - **NO references to:** PERFORMANCE.md, SECURITY.md, FRONTEND.md, design quality checks, or broad implementation guide-reading
  - Include `{{#if isTui}}` / `{{else}}` conditional for TUI vs browser-based E2E context (reference `PROMPT_e2e.md.tmpl` interaction cheatsheets as lightweight reminders)
  - Include Learning Capture section scoped to E2E patterns only

- [x] Update `src/templates/scripts/feature-loop.sh.tmpl` E2E fix fallback to use `PROMPT_e2e_fix.md` instead of `PROMPT.md` - [complexity: S] - f697b8f
  - Line 845: Change `"$PROMPTS_DIR/PROMPT.md"` to `"$PROMPTS_DIR/PROMPT_e2e_fix.md"`
  - Line 849: Change `"$PROMPTS_DIR/PROMPT.md"` to `"$PROMPTS_DIR/PROMPT_e2e_fix.md"`
  - No other lines or phases should be modified — only the E2E fix fallback branch

### Phase 2: Tests

- [x] Add template test asserting `PROMPT_e2e_fix.md.tmpl` exists and contains required sections - [complexity: S] - f697b8f
  - In `src/generator/templates.test.ts`, add test that reads the new template file
  - Assert it contains: `$FEATURE-implementation-plan.md` reference, `$FEATURE.md` reference, `{{testCommand}}` validation, `{{#if isTui}}` conditional
  - Assert it does NOT contain: `PERFORMANCE.md`, `SECURITY.md`, `FRONTEND.md` references

- [x] Add template test asserting feature-loop E2E fix branch references `PROMPT_e2e_fix.md` - [complexity: S] - f697b8f
  - In `src/generator/templates.test.ts`, add test that reads `feature-loop.sh.tmpl`
  - Assert E2E fix fallback lines contain `PROMPT_e2e_fix.md` (not `PROMPT.md`)
  - Assert E2E initial attempt still references `PROMPT_e2e.md` (unchanged)

### Phase 3: Validation & Polish

- [x] Verify build succeeds with new template included in `dist/` - [complexity: S] - f697b8f
  - Run `npm run build`
  - Confirm `dist/templates/prompts/PROMPT_e2e_fix.md.tmpl` exists in output

- [x] Run full validation suite: `npm run lint && npm run typecheck && npm run test && npm run build` - [complexity: S] - f697b8f

### Phase 4: Spec Updates

- [x] Update `.ralph/specs/create-targeted-e2e-fix-prompt.md` status from Planned to In Progress - [complexity: S] - f697b8f

- [x] Update `.ralph/specs/README.md` active specs table with new entry - [complexity: S] - f697b8f

## Done
