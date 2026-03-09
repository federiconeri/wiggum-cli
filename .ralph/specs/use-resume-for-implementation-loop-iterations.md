# use-resume-for-implementation-loop-iterations Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-03-09

## Purpose
Ensure implementation loop iterations 2+ use `claude --resume $LAST_SESSION_ID -p` by default to reuse existing Claude context/session, reducing token usage and runtime while preserving implementation correctness and loop reliability.

## User Stories
- As a feature developer, I want iterations 2+ to resume the previous Claude session so that I avoid repeatedly paying prompt/context reconstruction cost.
- As a CI/operator user, I want automatic fallback behavior when resume fails so that the loop remains robust and continues making progress.
- As a maintainer, I want deterministic, logged session-handling behavior so that failures are diagnosable and behavior is predictable.
- As a performance-conscious team member, I want lower token usage and shorter loop runtime so that implementation runs are cheaper and faster.

## Requirements

### Functional Requirements
- [x] **FR1: Iteration-aware invocation mode**
  - For implementation loop iteration `1`, the script MUST run Claude using the existing full prompt path (`PROMPT.md`) behavior.
  - For implementation loop iterations `>=2`, the script MUST attempt Claude invocation via `--resume $LAST_SESSION_ID -p` with a short continuation prompt (not full `PROMPT.md`).

- [x] **FR2: Resume command composition**
  - Resume invocation MUST include existing required flags used by implementation runs (e.g., JSON output format, model selection, permissions behavior) to preserve current downstream parsing.
  - The continuation prompt text MUST clearly instruct Claude to continue remaining implementation-plan tasks and skip E2E tasks (aligned with current loop intent).

- [x] **FR3: Session ID dependency and validation**
  - Before iteration `>=2` resume call, script MUST validate that `LAST_SESSION_ID` is non-empty.
  - If `LAST_SESSION_ID` is empty/missing, script MUST treat resume as failed and trigger fallback behavior.

- [x] **FR4: Fallback strategy on resume failure**
  - On resume failure, the system MUST automatically fallback to a fresh full `PROMPT.md` invocation for that same iteration.
  - Resume failure is defined as:
    - non-zero Claude process exit, OR
    - output that cannot produce a valid `session_id`, OR
    - explicit resume/session-related CLI error.
  - Fallback execution MUST preserve normal output capture (`*.raw`) and existing result extraction flow.

- [x] **FR5: State continuity**
  - After any successful Claude call (resumed or fallback fresh), the extracted `session_id` MUST be persisted to `LAST_SESSION_ID` for next iteration usage.
  - If fallback fresh run succeeds, its new session ID becomes the authoritative session for subsequent iterations.

- [x] **FR6: Logging/observability**
  - Script MUST emit clear log lines indicating:
    - whether iteration used “fresh prompt” or “resume mode,”
    - resume failure detection reason category,
    - whether fallback was invoked.
  - Logs MUST be concise and consistent with existing script log style.

- [x] **FR7: Scope guard**
  - Change MUST be limited to implementation-loop behavior (iterations in feature-loop implementation phase) and MUST NOT alter unrelated phases/commands.

### Non-Functional Requirements
- [x] **NFR1: Backward compatibility**
  - Existing iteration-1 behavior remains unchanged.
  - Existing output file naming and parsing contracts remain unchanged.

- [x] **NFR2: Reliability**
  - Resume failure MUST NOT abort loop by default when fallback succeeds.
  - Loop control flow must remain deterministic across up to configured max iterations.

- [x] **NFR3: Performance**
  - Iterations 2+ should avoid full prompt/context reconstruction when resume succeeds, targeting substantial cached-token reduction.
  - Added failure checks should impose negligible overhead (<1s per iteration excluding Claude runtime).

- [x] **NFR4: Maintainability**
  - Implementation should reuse existing helper functions (`run_claude_prompt`, `extract_session_result`, session state handling) rather than duplicating logic.

## Technical Notes
- **Primary file:** `src/templates/scripts/feature-loop.sh.tmpl` (implementation loop section around current Claude invocation logic).
- **Current architecture relevance:**
  - Template-driven script generates runtime loop script.
  - Existing state and helpers already handle session extraction and per-iteration outputs.
  - Existing loop tracks `LAST_SESSION_ID`; this should be the sole source for `--resume`.
- **Implementation approach:**
  1. Branch invocation logic by iteration index:
     - iteration 1 → existing full prompt path.
     - iteration 2+ → `claude --resume "$LAST_SESSION_ID" -p ...`.
  2. Pipe short continuation instruction into resume command.
  3. Detect resume failure conditions robustly.
  4. Execute automatic fallback to full prompt on failure.
  5. Keep extraction/persistence of `session_id` uniform after each successful run.
  6. Add explicit logs for mode/failure/fallback.
- **Dependencies:** No new npm dependencies required; shell/template-only change.
- **Testing notes:**
  - Validate template output script behavior in realistic loop runs.
  - Optionally add/update tests around script generation/invocation paths if harness exists.
- **Risk/edge cases:**
  - Stale/invalid session IDs.
  - Claude CLI transient errors.
  - Missing `session_id` in malformed/partial output.
  - Ensuring fallback does not double-apply iteration counters or corrupt output artifacts.

## Acceptance Criteria
- [x] **AC1:** On iteration 1, implementation phase uses full `PROMPT.md` invocation exactly as before.
- [x] **AC2:** On iteration 2 with valid `LAST_SESSION_ID`, script invokes `claude --resume <id> -p` (not full prompt path first).
- [x] **AC3:** On iteration 3+ with valid `LAST_SESSION_ID`, same resume-first behavior occurs.
- [x] **AC4:** If resume invocation exits non-zero, script logs resume failure and immediately performs full prompt fallback for the same iteration.
- [x] **AC5:** If resume invocation exits zero but no valid `session_id` can be extracted, script treats this as failure and performs full prompt fallback.
- [x] **AC6:** After successful fallback run, `LAST_SESSION_ID` is updated from fallback output and used for next iteration resume.
- [x] **AC7:** Raw output artifacts (`${CLAUDE_OUTPUT}.raw`) remain produced for both resume and fallback paths, preserving downstream diagnostics.
- [x] **AC8:** No regressions in non-implementation phases or iteration-limit behavior.
- [x] **AC9:** Logs clearly indicate mode per iteration (`fresh` vs `resume`) and when fallback is used.
- [x] **AC10:** End-to-end feature loop run demonstrates reduced repeated full-prompt usage for iterations 2+ when resume works.

## Out of Scope
- Adding interactive user choice for fallback behavior.
- Redesigning prompt contents or implementation-plan semantics beyond concise continuation text.
- Broader refactors of loop orchestration unrelated to implementation iteration invocation.
- Provider/model strategy changes outside existing environment/model selection flow.
- E2E task execution logic changes (other than preserving “skip E2E tasks” instruction in continuation prompt).

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #137
Use `--resume` for implementation loop iterations 2+ to reduce token and runtime costs while maintaining correctness and adding fallback safety.