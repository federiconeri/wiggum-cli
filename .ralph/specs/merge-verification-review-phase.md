# merge-verification-review-phase Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-03-10

## Purpose
Reduce cost and runtime by eliminating the standalone verification Claude call and merging verification responsibilities into the review phase prompts, while preserving phase tracking compatibility for the TUI and existing telemetry/log expectations.

## User Stories
- As a developer running the feature loop, I want verification checks included in review so that only one Opus session is required.
- As a maintainer, I want phase tracking to remain compatible so that TUI/status tooling does not break.
- As a reviewer, I want review prompts to explicitly require spec status updates, acceptance criteria checks, and README updates so that quality gates remain intact.
- As a template maintainer, I want `PROMPT_verify` retained as reference-only so historical guidance remains available without runtime invocation.

## Requirements

### Functional Requirements
- [x] **Remove standalone verify invocation from feature loop**
  - Update `src/templates/scripts/feature-loop.sh.tmpl` to remove direct execution block for Phase 6 verification (`PROMPT_verify.md` call).
  - Acceptance criteria:
    - Generated loop script no longer executes a separate Claude call for verify.
    - No code path in the loop invokes `PROMPT_verify.md` during normal run.

- [x] **Preserve phase tracking compatibility**
  - Keep `write_phase_start` / `write_phase_end` compatibility behavior for downstream TUI/log readers.
  - Preferred behavior: maintain legacy phase markers such that phase 6 can still be represented (as merged/no-op) while review executes verification responsibilities.
  - Acceptance criteria:
    - Phase events remain parseable by current TUI expectations.
    - No runtime errors in phase display/progress logic due to missing phase entry.

- [x] **Merge verification responsibilities into review prompts**
  - Update:
    - `src/templates/prompts/PROMPT_review_manual.md.tmpl`
    - `src/templates/prompts/PROMPT_review_auto.md.tmpl`
    - `src/templates/prompts/PROMPT_review_merge.md.tmpl`
  - Add a top-level pre-review section (e.g., “Step 0: Verify Spec Requirements”) derived from verify prompt intent:
    - Validate spec requirement completion against implementation plan.
    - Update spec status/progress explicitly.
    - Check acceptance criteria completeness with pass/fail notes.
    - Ensure README/documentation update expectations are included.
  - Acceptance criteria:
    - All 3 review templates contain explicit verification step language.
    - Each template includes explicit instructions for spec status, AC check, and README/doc updates.

- [x] **Retain verify prompt as reference-only**
  - Keep `src/templates/prompts/PROMPT_verify.md.tmpl` in repo.
  - Add/adjust header note clarifying it is not invoked by loop and is informational/reference.
  - Acceptance criteria:
    - File remains present.
    - File or nearby template docs clearly indicate non-invocation status.

- [x] **Align prompt flow documentation/comments**
  - Update inline comments and phase labels in template script to reflect merge.
  - Acceptance criteria:
    - No stale comments indicating an active standalone verify call.
    - Phase naming in script/prompt references accurately describes merged behavior.

### Non-Functional Requirements
- [x] **Performance/Cost**
  - Remove one Opus session from default loop path.
  - Target outcome: approximately 1 Claude call fewer per run.
- [x] **Backward compatibility**
  - No breaking change for existing TUI phase parsing and progress rendering.
- [x] **Reliability**
  - Prompt execution order remains deterministic and stable.
- [x] **Maintainability**
  - Prompt responsibilities are clear and non-duplicative across review templates.

## Technical Notes
- Implementation is template-driven:
  - Script orchestration: `src/templates/scripts/feature-loop.sh.tmpl`
  - Prompt content: `src/templates/prompts/*.md.tmpl`
- CLI/TUI stack context:
  - Node/TypeScript project generates assets from templates.
  - TUI relies on phase tracking events (`write_phase_start/end`) and should continue to parse expected structure.
- Recommended implementation approach:
  1. Remove verify invocation block from feature loop template.
  2. Keep compatible phase signaling (legacy phase marker or merged label strategy).
  3. Add “Step 0: Verify Spec Requirements” to each review prompt template.
  4. Mark verify template as reference-only.
  5. Validate generated script and prompts in a sample output run.
- Testing approach:
  - Unit/template snapshot tests (if present) for prompt content changes.
  - Script-level test or golden-file check for phase flow.
  - End-to-end smoke run to confirm single review Claude call path with intact TUI progress behavior.
- No database or schema changes required.

## Acceptance Criteria
- [x] `feature-loop.sh` template no longer directly invokes `PROMPT_verify.md`.
- [x] Loop still emits compatible phase start/end tracking for TUI consumption.
- [x] Review prompt templates (`manual`, `auto`, `merge`) each include:
  - [x] Step 0 verification section
  - [x] Spec status update requirement
  - [x] Acceptance criteria verification requirement
  - [x] README/documentation update requirement
- [x] `PROMPT_verify.md.tmpl` remains in repository and is labeled/reference-positioned as non-executed.
- [x] A full loop run performs verification checks during review phase and not as a separate phase call.
- [x] No regressions in phase rendering/progress behavior in TUI.
- [x] Documentation/comments reflect merged phase architecture.

## Out of Scope
- Rewriting verification logic beyond prompt consolidation and flow wiring.
- Changing model/provider selection behavior outside removal of standalone verify invocation.
- Broad redesign of phase numbering semantics across unrelated features.
- Changes to non-review prompts unrelated to merged verification responsibilities.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #139
# Merge verification phase into review phase

## Problem

The verification phase (Phase 6) and review phase (Phase 7) both:
- Read the spec file and implementation plan
- Check implementation completeness
- Review code quality
- Commit updates

This means **two separate Opus-model `claude -p` sessions** that largely overlap in context and purpose.

## Solution

Eliminate Phase 6 (verification) as a standalone claude call. Move spec requirement verification into the review prompts so one Opus session handles both:

1. **Modify review prompts** (`PROMPT_review_manual.md`, `PROMPT_review_auto.md`, `PROMPT_review_merge.md`):
   - Add a "Step 0: Verify Spec Requirements" section from `PROMPT_verify.md`
   - Include spec status update, acceptance criteria check, README update

2. **Modify `feature-loop.sh.tmpl`**:
   - Remove Phase 6 block
   - Update phase tracking to skip verification or mark it as part of review
   - Keep `write_phase_start/end` for backwards compat with TUI

3. **Keep `PROMPT_verify.md.tmpl`** as a reference but stop calling it in the loop

## Files

- `src/templates/scripts/feature-loop.sh.tmpl`
- `src/templates/prompts/PROMPT_verify.md.tmpl`
- `src/templates/prompts/PROMPT_review_manual.md.tmpl`
- `src/templates/prompts/PROMPT_review_auto.md.tmpl`
- `src/templates/prompts/PROMPT_review_merge.md.tmpl`

## Estimated Savings

- **~$1.80/run** (entire Opus session eliminated)
- **~1.5 min** faster