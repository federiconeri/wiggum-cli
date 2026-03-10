# use-resume-e2e-review-loops Implementation Plan

**Spec:** .ralph/specs/use-resume-e2e-review-loops.md
**Branch:** feat/use-resume-e2e-review-loops
**Status:** Complete

## Summary

Add `--resume` session reuse to E2E and review loops in `feature-loop.sh.tmpl`, mirroring the existing pattern in the implementation loop (lines 711–733). Each phase (E2E, review-auto, review-merge) gets its own session ID variable. First iteration uses the full prompt; iterations 2+ use `run_claude_resume` with a concise continuation instruction. Fallback to full prompt on resume failure.

## Tasks

### Phase 1: E2E Loop Resume

- [x] Add `E2E_SESSION_ID=""` variable initialization before E2E loop (around line 798) - [complexity: S] - 001f94c
- [x] In E2E loop body (lines 800–825), branch on `E2E_ATTEMPT -eq 1` or empty `E2E_SESSION_ID`: attempt 1 uses full `run_claude_prompt` (existing behavior); attempts 2+ use `run_claude_resume "$E2E_SESSION_ID"` with concise E2E continuation prompt - [complexity: M] - 001f94c
- [x] Define `E2E_CONTINUATION_PROMPT` text: "Continue remaining E2E scenarios. Check the implementation plan for unchecked `- [ ] E2E:` entries and implement/run those tests. Run validation after completing each scenario." - [complexity: S] - 001f94c
- [x] After first E2E `run_claude_prompt`, capture session ID into `E2E_SESSION_ID` (use existing `extract_session_result` + `LAST_SESSION_ID`) - [complexity: S] - 001f94c
- [x] Add resume fallback logic for E2E: if `run_claude_resume` fails (non-zero exit or empty session ID after extraction), log warning and fall back to full `run_claude_prompt` with `PROMPT_e2e.md` - [complexity: S] - 001f94c
- [x] Add log lines: `"E2E attempt N: using resume session ..."` and `"E2E attempt N: resume unavailable, using full prompt"` - [complexity: S] - 001f94c
- [x] Also apply resume to the E2E fix iteration (line 821): when `E2E_SESSION_ID` is available, use resume with a fix-focused continuation prompt instead of `PROMPT.md`; fallback to `PROMPT.md` if unavailable - [complexity: S] - 001f94c

### Phase 2: Review Loop Resume (auto + merge)

- [x] Add `REVIEW_SESSION_ID=""` variable initialization before the review mode branches (around line 860) - [complexity: S] - 001f94c
- [x] Define `REVIEW_CONTINUATION_PROMPT` text: "The issues from the previous review have been fixed. Re-run the code review, checking only for remaining issues. Report your verdict." - [complexity: S] - 001f94c
- [x] In **merge** review loop (lines 920–955): branch on `REVIEW_ATTEMPT -eq 1` or empty `REVIEW_SESSION_ID`. Attempt 1 uses `run_claude_prompt` with `PROMPT_review_merge.md` (existing); attempts 2+ use `run_claude_resume "$REVIEW_SESSION_ID"` with `REVIEW_CONTINUATION_PROMPT` - [complexity: M] - 001f94c
- [x] In **auto** review loop (lines 963–986): same branching pattern — attempt 1 uses `run_claude_prompt` with `PROMPT_review_auto.md`; attempts 2+ use `run_claude_resume "$REVIEW_SESSION_ID"` with `REVIEW_CONTINUATION_PROMPT` - [complexity: M] - 001f94c
- [x] After first review `run_claude_prompt` in each mode, capture session ID into `REVIEW_SESSION_ID` via `extract_session_result` + `LAST_SESSION_ID` - [complexity: S] - 001f94c
- [x] Add resume fallback logic for review: if `run_claude_resume` fails, log warning and fall back to full review prompt - [complexity: S] - 001f94c
- [x] Add log lines: `"Review attempt N: using resume session ..."` and `"Review attempt N: resume unavailable, using full prompt"` - [complexity: S] - 001f94c
- [x] Verify `manual` review mode is NOT changed (single invocation, no loop, no resume) - [complexity: S] - 001f94c

### Phase 3: Safety & Guardrails

- [x] Verify loop counters remain unchanged: `MAX_E2E_ATTEMPTS`, `MAX_REVIEW_ATTEMPTS`, `MAX_ITERATIONS` — no modifications to these values or their gating conditions - [complexity: S] - 001f94c
- [x] Verify `E2E_SESSION_ID` and `REVIEW_SESSION_ID` are phase-scoped (not shared across phases) — E2E retries use E2E ID, review retries use review ID - [complexity: S] - 001f94c
- [x] Verify exit/error propagation from `run_claude_prompt` and `run_claude_resume` is preserved — `|| true` patterns and `RESUME_EXIT` capture remain consistent - [complexity: S] - 001f94c

### Phase 4: Tests

- [x] Add test: E2E loop branches on attempt 1 for full prompt (`E2E_ATTEMPT -eq 1`) - [complexity: S] - 001f94c
- [x] Add test: E2E loop uses `run_claude_resume` with `E2E_SESSION_ID` for attempts 2+ - [complexity: S] - 001f94c
- [x] Add test: `E2E_CONTINUATION_PROMPT` contains instruction about unchecked E2E entries - [complexity: S] - 001f94c
- [x] Add test: E2E resume fallback logic exists (warning + full prompt fallback) - [complexity: S] - 001f94c
- [x] Add test: `REVIEW_SESSION_ID` variable is initialized in template - [complexity: S] - 001f94c
- [x] Add test: merge review loop branches on attempt 1 for full prompt - [complexity: S] - 001f94c
- [x] Add test: merge review loop uses `run_claude_resume` for attempts 2+ - [complexity: S] - 001f94c
- [x] Add test: auto review loop branches on attempt 1 for full prompt - [complexity: S] - 001f94c
- [x] Add test: auto review loop uses `run_claude_resume` for attempts 2+ - [complexity: S] - 001f94c
- [x] Add test: `REVIEW_CONTINUATION_PROMPT` contains re-review instruction text - [complexity: S] - 001f94c
- [x] Add test: review resume fallback logic exists (warning + full prompt fallback) - [complexity: S] - 001f94c
- [x] Add test: manual review mode does NOT contain resume logic - [complexity: S] - 001f94c
- [x] Add test: E2E and review use separate session ID variables (`E2E_SESSION_ID` vs `REVIEW_SESSION_ID`) - [complexity: S] - 001f94c

### Phase 5: Validation

- [x] Run `npm run lint && npm run typecheck && npm run test && npm run build` — all must pass - [complexity: S] - 001f94c

## Done
