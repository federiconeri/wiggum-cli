# use-resume-for-implementation-loop-iterations Implementation Plan

**Spec:** .ralph/specs/use-resume-for-implementation-loop-iterations.md
**Branch:** feat/use-resume-for-implementation-loop-iterations
**Status:** Completed

## Tasks

### Phase 1: Core — Resume Invocation in Implementation Loop

- [x] Add `run_claude_resume` helper function to `feature-loop.sh.tmpl` (near `run_claude_prompt` at line ~145) — accepts session_id and a short continuation prompt string, builds `claude --resume "$session_id" -p --output-format json --dangerously-skip-permissions --model $MODEL` and pipes the continuation prompt + AUTOMATION_FOOTER into it [complexity: M]
- [x] Branch the implementation loop invocation (line ~697) by iteration: iteration 1 uses existing `run_claude_prompt` path; iterations 2+ check `LAST_SESSION_ID` is non-empty and call `run_claude_resume`, falling back to `run_claude_prompt` if session ID is missing [complexity: M]
- [x] Define the continuation prompt text as a heredoc/variable — concise instruction telling Claude to continue remaining implementation-plan tasks, skip E2E tasks, reference the plan file path, and follow existing conventions [complexity: S]
- [x] Add logging lines indicating invocation mode per iteration: "Mode: fresh" for iteration 1 / missing session, "Mode: resume (session: <id>)" for resume attempts [complexity: S]

### Phase 2: Fallback on Resume Failure

- [x] Detect resume failure conditions after `run_claude_resume` call: non-zero exit code OR `extract_session_result` yields empty `LAST_SESSION_ID` [complexity: M]
- [x] On resume failure, log the failure reason category ("resume_exit_nonzero" or "resume_no_session_id") and immediately invoke full `run_claude_prompt` fallback for the same iteration [complexity: M]
- [x] Log "Fallback: using fresh prompt" when fallback is triggered [complexity: S]
- [x] Ensure `LAST_SESSION_ID` is updated from whichever invocation succeeds (resume or fallback), preserving existing `extract_session_result` + `accumulate_tokens_from_session` flow for both paths [complexity: S]

### Phase 3: Tests

- [x] Add unit test in `src/generator/templates.test.ts` (or new test file) verifying the rendered `feature-loop.sh` template contains the `run_claude_resume` helper function [complexity: S]
- [x] Add unit test verifying the rendered template's implementation loop section contains iteration-branching logic (iteration 1 → fresh, 2+ → resume attempt) [complexity: S]
- [x] Add unit test verifying the continuation prompt variable is present in the rendered template [complexity: S]
- [x] Add unit test verifying fallback logic block exists in the rendered template (checks for "Fallback" log string and secondary `run_claude_prompt` call after resume) [complexity: S]

### Phase 4: Polish & Verification

- [x] Verify `run_claude_resume` preserves all existing flags from `CLAUDE_CMD_IMPL` (json output, permissions, model) — the `--resume` flag replaces `-p` as the primary mode flag but `-p` is still needed for piping the continuation prompt [complexity: S]
- [x] Verify raw output artifacts (`${CLAUDE_OUTPUT}.raw`) are produced for both resume and fallback paths via `tee` [complexity: S]
- [x] Verify no changes to non-implementation phases (planning, e2e, verification, review) — scope guard check [complexity: S]
- [x] Run `npm run typecheck && npm run test && npm run build` to confirm no regressions [complexity: S]

## Implementation Notes

### Key Architecture Decisions

**Where the change lives:** Only `src/templates/scripts/feature-loop.sh.tmpl`, specifically:
1. New helper function `run_claude_resume` near line 145 (alongside existing `run_claude_prompt`)
2. Modified implementation loop body at lines 696-699 (iteration-branching + fallback)
3. New continuation prompt variable/heredoc near the helper functions

**`run_claude_resume` function signature:**
```bash
run_claude_resume() {
    local session_id="$1"
    local continuation_prompt="$2"
    local claude_cmd="$3"
    # Replace '-p' with '--resume "$session_id" -p' in the claude command
    local resume_cmd="${claude_cmd/ -p / --resume \"$session_id\" -p }"
    { echo "$continuation_prompt"; echo "$AUTOMATION_FOOTER"; } | $resume_cmd
}
```

**Continuation prompt content (concise):**
```
Continue implementing the remaining tasks in the implementation plan at $SPEC_DIR/${FEATURE}-implementation-plan.md.
Check off completed tasks as you go. Skip any E2E testing tasks.
Run validation (lint, typecheck, test) after completing tasks.
```

**Iteration branching logic:**
```bash
if [ $ITERATION -eq 1 ] || [ -z "$LAST_SESSION_ID" ]; then
    echo "Mode: fresh"
    run_claude_prompt "$PROMPTS_DIR/PROMPT.md" "$CLAUDE_CMD_IMPL" 2>&1 | tee "${CLAUDE_OUTPUT}.raw" || true
else
    echo "Mode: resume (session: $LAST_SESSION_ID)"
    RESUME_EXIT=0
    run_claude_resume "$LAST_SESSION_ID" "$CONTINUATION_PROMPT" "$CLAUDE_CMD_IMPL" 2>&1 | tee "${CLAUDE_OUTPUT}.raw" || RESUME_EXIT=$?
    extract_session_result "${CLAUDE_OUTPUT}.raw"
    if [ $RESUME_EXIT -ne 0 ] || [ -z "$LAST_SESSION_ID" ]; then
        echo "Resume failed (exit=$RESUME_EXIT, session=${LAST_SESSION_ID:-empty}). Fallback: using fresh prompt"
        run_claude_prompt "$PROMPTS_DIR/PROMPT.md" "$CLAUDE_CMD_IMPL" 2>&1 | tee "${CLAUDE_OUTPUT}.raw" || true
    fi
fi
extract_session_result "${CLAUDE_OUTPUT}.raw"
accumulate_tokens_from_session "$LAST_SESSION_ID"
```

**What NOT to change:**
- Planning phase invocation (line 638) — always fresh, uses OPUS model
- E2E testing phase (line 771) — different prompt, different concern
- Verification phase (line 805) — always fresh
- Review phases (lines 883, 896, 939) — always fresh
- `extract_session_result` and `accumulate_tokens_from_session` functions — reused as-is
- `CLAUDE_CMD_IMPL` / `CLAUDE_CMD_OPUS` definitions — unchanged

## Done
