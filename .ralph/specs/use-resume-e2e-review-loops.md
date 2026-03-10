# use-resume-e2e-review-loops Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-03-10

## Purpose
Reduce token usage and runtime in the feature loop by reusing Claude sessions (`--resume`) for repeated **E2E** and **review** iterations, while preserving existing safety checks, loop limits, and current first-iteration behavior.

## User Stories
- As a developer running `feature-loop.sh`, I want E2E retries to resume the prior Claude session so that large E2E prompt templates are not resent every attempt.
- As a developer using auto/merge review modes, I want review reruns to resume the prior review session so that reruns are faster and cheaper.
- As a maintainer, I want all existing guardrails (attempt limits, failure handling, and mode-specific behavior) preserved so that reliability and safety are unchanged.
- As a CI/e2e operator, I want deterministic first-iteration behavior (full prompt on iteration 1) so that baseline runs remain stable and auditable.

## Requirements

### Functional Requirements
- [x] **E2E loop uses full prompt on first attempt**
  - In `src/templates/scripts/feature-loop.sh.tmpl`, E2E attempt 1 must continue using the existing full `PROMPT_e2e.md` flow.
  - Acceptance: logs/command path indicate full-prompt helper is used for attempt 1.

- [x] **E2E loop uses resume on attempts 2+**
  - For E2E attempt 2 and later, invoke Claude with `--resume <E2E_SESSION_ID>` and a concise continuation instruction.
  - Continuation instruction must direct Claude to continue remaining E2E scenarios by checking unchecked `- [ ] E2E:` entries in implementation plan artifacts.
  - Acceptance: attempts 2+ call resume helper/path and do not resend full E2E prompt body.

- [x] **Review loop uses full prompt on first iteration**
  - In review loop branches for both `auto` and `merge`, review iteration 1 must use current full review prompt behavior.
  - Acceptance: iteration 1 remains functionally identical to current behavior.

- [x] **Review loop uses resume on iterations 2+**
  - For review iteration 2 and later (auto/merge modes), invoke `--resume <REVIEW_SESSION_ID>` with concise re-review instruction.
  - Re-review instruction must indicate fixes were applied and Claude should re-run review for remaining issues.
  - Acceptance: iterations 2+ use resume path and skip full review prompt resend.

- [x] **Session ID capture and reuse for E2E/review**
  - Capture Claude session ID from first successful invocation in each phase and persist for subsequent iterations in that phase.
  - Maintain **separate phase-scoped IDs** (e.g., E2E vs review), not a single shared cross-phase ID.
  - Acceptance: E2E retries use the E2E ID; review retries use the review ID.

- [x] **Fallback safety if resume ID unavailable**
  - If no valid session ID exists at iteration 2+ (e.g., extraction failure, missing file), fallback to full prompt invocation for that iteration and continue loop safely.
  - Acceptance: no hard crash solely due to missing resume ID; warning logged.

- [x] **Preserve existing loop limits and branching**
  - E2E max attempts and review max iterations remain unchanged.
  - Existing behavior for non-auto/merge review paths remains unchanged.
  - Acceptance: loop counters and termination conditions are identical pre/post feature.

- [x] **Preserve existing safety checks and status handling**
  - Existing checks for command failure, validation, and break/continue logic remain intact.
  - Acceptance: existing failure modes still trigger same stop/retry semantics unless explicitly updated by this feature.

### Non-Functional Requirements
- [x] **Performance/Cost Efficiency**
  - Repeated E2E/review iterations should avoid retransmitting large prompt templates.
  - Expected improvement target: measurable reduction in runtime and token usage for multi-iteration runs.

- [x] **Reliability**
  - Resume behavior must not reduce successful completion rates of E2E/review loops.
  - Fallback behavior must keep runs operational even when session extraction fails.

- [x] **Observability**
  - Logs should clearly indicate whether each iteration used full prompt or resume path.
  - Session reuse decisions should be diagnosable from run logs.

- [x] **Backward Compatibility**
  - First-iteration behavior and output artifacts should remain compatible with existing scripts and workflows.

## Technical Notes
- **Primary file to modify**
  - `src/templates/scripts/feature-loop.sh.tmpl`
  - Target regions: E2E loop block and review loop block (auto/merge branches).

- **Existing script primitives to leverage**
  - Full prompt runner (e.g., `run_claude_prompt`-style helper).
  - Resume runner (e.g., `run_claude_resume`-style helper).
  - Session extraction helper (e.g., `extract_session_result`) and existing session persistence mechanism (`SESSIONS_FILE`).

- **Implementation approach**
  1. **E2E phase**
     - Attempt 1: current full prompt path unchanged.
     - On successful response, extract/store `E2E_SESSION_ID`.
     - Attempt 2+: if `E2E_SESSION_ID` present, call resume helper with concise continue instruction; else fallback to full prompt and try extraction again.
  2. **Review phase (auto/merge)**
     - Iteration 1: current full review prompt unchanged.
     - On successful response, extract/store `REVIEW_SESSION_ID`.
     - Iteration 2+: if `REVIEW_SESSION_ID` present, call resume helper with concise re-review instruction; else fallback to full prompt and extract again.
  3. **Logging**
     - Add explicit log lines like:
       - `E2E attempt N: using resume session ...`
       - `E2E attempt N: resume unavailable, using full prompt`
       - equivalent review messages.
  4. **Safety**
     - Do not alter loop counters, max retry constants, gating checks, or mode selection logic.
     - Preserve exit/error propagation from current helpers.

- **Prompt text guidance**
  - E2E resume instruction (concise): continue remaining E2E scenarios; check implementation plan for unchecked `- [ ] E2E:` items.
  - Review resume instruction (concise): issues have been fixed; rerun review and report remaining issues only.

- **Testing impact**
  - Add/update tests around generated template behavior if script template snapshot/unit tests exist.
  - If no direct template tests exist, add focused test coverage at generator/output level and verify in e2e fixtures.

- **Database changes**
  - None.

## Acceptance Criteria
- [x] In generated `feature-loop.sh`, E2E attempt 1 invokes full E2E prompt logic.
- [x] In generated `feature-loop.sh`, E2E attempt 2+ invokes resume logic with `--resume` when session ID is available.
- [x] E2E resume instruction text is concise and references remaining unchecked E2E scenarios.
- [x] Review iteration 1 in `auto` mode invokes full review prompt logic.
- [x] Review iteration 2+ in `auto` mode invokes resume logic with concise re-review instruction.
- [x] Review iteration 1 in `merge` mode invokes full review prompt logic.
- [x] Review iteration 2+ in `merge` mode invokes resume logic with concise re-review instruction.
- [x] Missing/invalid E2E session ID on retry causes fallback to full prompt (not script failure).
- [x] Missing/invalid review session ID on retry causes fallback to full prompt (not script failure).
- [x] Existing max attempts/iterations for E2E and review remain unchanged.
- [x] Existing non-targeted phases (implementation loop and unrelated commands) show no behavioral regressions.
- [x] Logs clearly show whether each E2E/review iteration used full prompt or resume.
- [x] `npm run test`, `npm run typecheck`, and `npm run build` pass after changes.

## Out of Scope
- Changing implementation-loop resume behavior (already existing pattern).
- Redesigning prompt templates beyond concise continuation/re-review instructions.
- Modifying attempt limits, retry policy, or review mode semantics.
- Introducing new external dependencies or changing AI provider abstractions.
- Refactoring broader CLI/TUI orchestration outside the script template.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #138
# Use --resume for E2E and review loop iterations

- Problem summary: repeated full prompt sends in E2E/review loops are wasteful.
- Requested behavior:
  - E2E: full prompt on first attempt, resume on later attempts.
  - Review (auto/merge): full prompt first iteration, resume on later iterations.
- Target file:
  - `src/templates/scripts/feature-loop.sh.tmpl` (noted sections around E2E and review loops).
- Expected impact:
  - Reduced cost and runtime per multi-iteration run.