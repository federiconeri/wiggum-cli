# merge-verification-review-phase Implementation Plan

**Spec:** .ralph/specs/merge-verification-review-phase.md
**Branch:** feat/merge-verification-review-phase
**Status:** Complete

## Tasks

### Phase 1: Remove verify invocation from feature loop

- [x] Remove Phase 6 verify block from `src/templates/scripts/feature-loop.sh.tmpl` — Remove lines 834-844 (the `run_claude_prompt "$PROMPTS_DIR/PROMPT_verify.md"` block) while keeping `write_phase_start "verification"` / `write_phase_end "verification" "skipped"` as a no-op marker for TUI backward compatibility - [complexity: S] - f386df1
- [x] Update phase comments and numbering in `src/templates/scripts/feature-loop.sh.tmpl` — Change "Phase 6: Spec Verification" comment to indicate merged/skipped status, update "Phase 7" label to reflect it now includes verification responsibilities - [complexity: S] - f386df1

### Phase 2: Merge verification into review prompts

- [x] Add "Step 0: Verify Spec Requirements" section to `src/templates/prompts/PROMPT_review_manual.md.tmpl` — Insert before existing Step 1, derived from PROMPT_verify.md content: validate spec requirement completion, update spec status/progress, check acceptance criteria, ensure README/docs updated - [complexity: M] - f386df1
- [x] Add "Step 0: Verify Spec Requirements" section to `src/templates/prompts/PROMPT_review_auto.md.tmpl` — Same verification section as manual, inserted before existing Step 1 - [complexity: S] - f386df1
- [x] Add "Step 0: Verify Spec Requirements" section to `src/templates/prompts/PROMPT_review_merge.md.tmpl` — Same verification section as merge, inserted before existing Step 1 - [complexity: S] - f386df1

### Phase 3: Mark verify prompt as reference-only

- [x] Add reference-only header to `src/templates/prompts/PROMPT_verify.md.tmpl` — Add a clear note at the top stating this file is not invoked by the loop and exists only as reference documentation for the verification steps now embedded in review prompts - [complexity: S] - f386df1

### Phase 4: Update TUI phase detection

- [x] Update `detectPhase` in `src/tui/utils/loop-status.ts` — Remove `isProcessRunning('PROMPT_verify.md')` check at line 146 since the verify prompt is no longer invoked. The `PHASE_LABELS` map and `readCurrentPhase`/`parsePhases` functions can keep the `verification` key for backward compat with existing `.phases` files - [complexity: S] - f386df1

### Phase 5: Tests

- [x] Update `src/tui/utils/build-run-summary.test.ts` — Update existing test that includes `verification|success` in phases data to use `verification|skipped` instead, and verify the total duration calculation adjusts accordingly (verification no longer contributes duration) - [complexity: S] - f386df1
- [x] Add test in `src/generator/templates.test.ts` verifying feature-loop template no longer contains `run_claude_prompt.*PROMPT_verify` invocation - [complexity: S] - f386df1
- [x] Add test in `src/generator/templates.test.ts` verifying all 3 review templates contain "Step 0" or "Verify Spec Requirements" section - [complexity: S] - f386df1

### Phase 6: Polish

- [x] Remove stale comments referencing standalone verify call throughout templates — Audit `feature-loop.sh.tmpl` and review prompt templates for outdated references to "Spec Verification phase" as a separate Claude call. Update "Note: Spec status updates are handled in the Spec Verification phase" in review_manual to reflect merged behavior - [complexity: S] - f386df1

## Done

All tasks complete in commit f386df1.
