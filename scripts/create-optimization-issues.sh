#!/bin/bash
# Create GitHub issues for feature loop optimization epic
# Prerequisites: gh CLI authenticated (run: gh auth login)
# Usage: ./scripts/create-optimization-issues.sh

set -e

REPO="federiconeri/wiggum-cli"

echo "Creating optimization issues on $REPO..."
echo ""

# Create labels if they don't exist
echo "Ensuring labels exist..."
gh label create "performance" --color "0E8A16" --description "Performance optimization" -R "$REPO" 2>/dev/null || true
gh label create "P1" --color "D93F0B" --description "High priority" -R "$REPO" 2>/dev/null || true
gh label create "P2" --color "FBCA04" --description "Medium priority" -R "$REPO" 2>/dev/null || true
gh label create "P3" --color "C5DEF5" --description "Lower priority" -R "$REPO" 2>/dev/null || true
echo ""

# --- Sub-issue 1 ---
echo "Creating sub-issue #1..."
ISSUE1=$(gh issue create -R "$REPO" \
  --title "Use --resume for implementation loop iterations 2+" \
  --label "enhancement,performance,P1" \
  --body "$(cat <<'EOF'
## Problem

Each implementation iteration (up to 10 per feature) starts a **fresh** `claude -p` session, causing Claude to:
- Re-read the full PROMPT.md template (~2,000 tokens)
- Re-read 5-7 @file references (spec, plan, AGENTS.md, LEARNINGS.md, PERFORMANCE.md, SECURITY.md, FRONTEND.md — ~4,500 tokens)
- Rebuild its entire context from scratch

This accounts for the majority of cached token volume in the loop.

## Solution

Use `claude --resume $SESSION_ID -p` for iterations 2+ instead of a fresh `claude -p` with full PROMPT.md.

**Iteration 1:** Full PROMPT.md (captures `LAST_SESSION_ID`)
**Iteration 2+:** Short continuation prompt via `--resume`:

```bash
if [ $ITERATION -eq 1 ]; then
    run_claude_prompt "$PROMPTS_DIR/PROMPT.md" "$CLAUDE_CMD_IMPL" 2>&1 | tee "${CLAUDE_OUTPUT}.raw" || true
else
    RESUME_CMD="claude --resume $LAST_SESSION_ID -p --output-format json --dangerously-skip-permissions --model ${MODEL:-$DEFAULT_MODEL}"
    echo "Continue implementing remaining tasks from the implementation plan. Check for unchecked tasks (- [ ]) and implement them. Skip E2E tasks." \
      | $RESUME_CMD 2>&1 | tee "${CLAUDE_OUTPUT}.raw" || true
fi
```

Include fallback: if `--resume` fails (non-zero exit + no session_id in output), retry with a fresh full-prompt session.

## Files

- `src/templates/scripts/feature-loop.sh.tmpl` (lines 662-737)

## Estimated Savings

- **~$2.00/run** in API costs
- **~1.5 min** faster per loop
- **~60-70%** reduction in implementation phase cached tokens
EOF
)")
echo "  Created: $ISSUE1"

# --- Sub-issue 2 ---
echo "Creating sub-issue #2..."
ISSUE2=$(gh issue create -R "$REPO" \
  --title "Use --resume for E2E and review loop iterations" \
  --label "enhancement,performance,P2" \
  --body "$(cat <<'EOF'
## Problem

The E2E testing loop (up to 5 attempts) and review loop (up to 3 attempts) each start fresh `claude -p` sessions per iteration. The E2E prompt is the largest template (391 lines), so resending it repeatedly is wasteful.

## Solution

Apply the same `--resume` pattern from the implementation loop:

**E2E loop (lines 766-791):**
- Attempt 1: Full PROMPT_e2e.md
- Attempt 2+: `claude --resume $E2E_SESSION_ID -p` with "Continue executing remaining E2E scenarios. Check the implementation plan for scenarios still marked as `- [ ] E2E:`."

**Review loop (lines 893-958, auto/merge modes):**
- Iteration 1: Full review prompt
- Iteration 2+: Resume with "Review issues have been fixed. Re-run the code review and check for remaining issues."

Note: The E2E fix iteration between attempts currently uses full PROMPT.md — see issue for targeted E2E fix prompt.

## Files

- `src/templates/scripts/feature-loop.sh.tmpl` (lines 766-791, 893-958)

## Estimated Savings

- **~$0.80/run**
- **~1 min** faster
EOF
)")
echo "  Created: $ISSUE2"

# --- Sub-issue 3 ---
echo "Creating sub-issue #3..."
ISSUE3=$(gh issue create -R "$REPO" \
  --title "Merge verification phase into review phase" \
  --label "enhancement,performance,P1" \
  --body "$(cat <<'EOF'
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
   - Remove Phase 6 block (lines 800-810)
   - Update phase tracking to skip verification or mark it as part of review
   - Keep `write_phase_start/end` for backwards compat with TUI

3. **Keep `PROMPT_verify.md.tmpl`** as a reference but stop calling it in the loop

## Files

- `src/templates/scripts/feature-loop.sh.tmpl` (lines 800-810)
- `src/templates/prompts/PROMPT_verify.md.tmpl`
- `src/templates/prompts/PROMPT_review_manual.md.tmpl`
- `src/templates/prompts/PROMPT_review_auto.md.tmpl`
- `src/templates/prompts/PROMPT_review_merge.md.tmpl`

## Estimated Savings

- **~$1.80/run** (entire Opus session eliminated)
- **~1.5 min** faster
EOF
)")
echo "  Created: $ISSUE3"

# --- Sub-issue 4 ---
echo "Creating sub-issue #4..."
ISSUE4=$(gh issue create -R "$REPO" \
  --title "Create targeted E2E fix prompt instead of using full PROMPT.md" \
  --label "enhancement,performance,P2" \
  --body "$(cat <<'EOF'
## Problem

When E2E tests fail (line 787), the loop runs the full `PROMPT.md` (implementation prompt) which:
- Reads ALL guide files (PERFORMANCE.md, SECURITY.md, FRONTEND.md)
- Instructs Claude to work through ALL incomplete implementation tasks
- Runs full validation (lint, typecheck, test, build)

But at this point, only specific E2E tests failed. The generic implementation prompt wastes time on unnecessary context and validation.

## Solution

Create a new `PROMPT_e2e_fix.md.tmpl` that:
- Only focuses on E2E test failures
- Includes specific failure details from the implementation plan
- Only runs E2E-relevant validation
- Skips guide file references irrelevant to E2E fixes

```markdown
## Context
Study @.ralph/specs/$FEATURE-implementation-plan.md for E2E test failures.
Study @.ralph/specs/$FEATURE.md for feature specification.

## Task
Fix the failing E2E test scenarios listed in the implementation plan.
For each scenario marked as `- [ ] E2E: ... - FAILED`:
1. Read the failure details
2. Fix the underlying code issue
3. Run the relevant test to verify the fix
4. Commit the fix

## Validation
After fixes, run: `cd {{appDir}} && {{testCommand}}`
```

Update `feature-loop.sh.tmpl` line 787 to use the new prompt.

## Files

- `src/templates/prompts/PROMPT_e2e_fix.md.tmpl` (new)
- `src/templates/scripts/feature-loop.sh.tmpl` (line 787)

## Estimated Savings

- **~$0.50/run**
- **~45s** faster (fewer file reads, more focused work)
EOF
)")
echo "  Created: $ISSUE4"

# --- Sub-issue 5 ---
echo "Creating sub-issue #5..."
ISSUE5=$(gh issue create -R "$REPO" \
  --title "Trim PROMPT_e2e.md.tmpl — remove reference material Claude already knows" \
  --label "enhancement,performance,P3" \
  --body "$(cat <<'EOF'
## Problem

`PROMPT_e2e.md.tmpl` is 391 lines. It includes reference material that Claude Code already knows natively:

- Playwright MCP Tool Reference table (lines 286-300, ~15 lines)
- Assertion Patterns section (lines 301-327, ~27 lines)
- Browser State Management section (lines 329-333, ~5 lines)
- Troubleshooting section (lines 362-374, ~13 lines)
- Verbose TUI Interaction Cheatsheet (lines 96-117, ~22 lines)

## Solution

Remove ~80 lines of reference material:
- **Delete** Playwright MCP Tool Reference table — Claude knows its available MCP tools
- **Delete** Assertion Patterns section — standard Playwright patterns
- **Delete** Browser State Management section — obvious browser behavior
- **Delete** Troubleshooting section — standard debugging Claude can figure out
- **Condense** TUI Interaction Cheatsheet to 3-4 key commands (open, read screen, type, close)
- **Condense** Learning Capture to: "If useful E2E patterns found, append to @.ralph/LEARNINGS.md"

## Files

- `src/templates/prompts/PROMPT_e2e.md.tmpl`

## Estimated Reduction

~80 lines removed, ~20% smaller prompt
EOF
)")
echo "  Created: $ISSUE5"

# --- Sub-issue 6 ---
echo "Creating sub-issue #6..."
ISSUE6=$(gh issue create -R "$REPO" \
  --title "Trim PROMPT_feature.md.tmpl — remove 80-line example format" \
  --label "enhancement,performance,P3" \
  --body "$(cat <<'EOF'
## Problem

`PROMPT_feature.md.tmpl` includes an ~80-line Implementation Plan Format example (lines 17-97) that shows Claude the exact markdown structure to use. Claude can produce well-structured markdown plans without a full example. The only critical requirement is the `- [ ]` checkbox syntax for task tracking.

## Solution

Replace the 80-line example with a ~10-line description:

```markdown
## Implementation Plan Format
Create @.ralph/specs/$FEATURE-implementation-plan.md with:
- Header: feature name, spec path, branch name, status
- Tasks organized by phase (Setup, Core, Tests, Polish, E2E)
- **CRITICAL:** Use `- [ ] Task description` checkbox format for each task (the loop tracks progress by counting checkboxes)
- E2E scenarios: `- [ ] E2E: Scenario name` with URL, steps, and verify fields
- Mark complexity: [S], [M], or [L] per task
```

Also condense:
- CRITICAL CONSTRAINT section (lines 99-107) from 9 lines to 3 lines
- Remove explicit MCP references (Claude discovers available MCPs)

## Files

- `src/templates/prompts/PROMPT_feature.md.tmpl`

## Estimated Reduction

~70 lines removed, ~58% smaller prompt
EOF
)")
echo "  Created: $ISSUE6"

# --- Sub-issue 7 ---
echo "Creating sub-issue #7..."
ISSUE7=$(gh issue create -R "$REPO" \
  --title "Trim PROMPT.md.tmpl and review prompts — condense boilerplate" \
  --label "enhancement,performance,P3" \
  --body "$(cat <<'EOF'
## Problem

Several prompt templates have verbose sections that can be condensed:

### PROMPT.md.tmpl (~81 lines)
- Design Quality Check (lines 45-54): 10 lines of checklist → 2 lines referencing the guide
- Security Review (lines 35-43): 9 lines → 2 lines referencing the guide
- Learning Capture (lines 63-70): 7 lines → 1 line
- Rules (lines 72-80): mostly duplicates Task section instructions

### Review prompts (PROMPT_review_*.md.tmpl)
- 3 prompts with ~80% overlap (manual=121 lines, auto=155 lines, merge=194 lines)
- Each has Troubleshooting section (~6 lines) — Claude knows gh CLI
- Each has Learning Capture boilerplate (~7 lines)
- Each has verbose inline Claude review prompt (~20 lines)

## Solution

### PROMPT.md.tmpl
- Condense Design Quality Check to: "Before marking UI tasks complete, verify against @.ralph/guides/FRONTEND.md checklist."
- Condense Security Review to: "Review changes against @.ralph/guides/SECURITY.md. Run `{{packageManager}} audit`."
- Condense Learning Capture to: "If this iteration revealed useful patterns or mistakes, append to @.ralph/LEARNINGS.md."
- Remove redundant Rules that duplicate Task section

### Review prompts
- Remove Troubleshooting sections from all 3
- Condense Learning Capture to 1 line in all 3
- Condense inline Claude review prompt

## Files

- `src/templates/prompts/PROMPT.md.tmpl`
- `src/templates/prompts/PROMPT_review_auto.md.tmpl`
- `src/templates/prompts/PROMPT_review_merge.md.tmpl`
- `src/templates/prompts/PROMPT_review_manual.md.tmpl`

## Estimated Reduction

~15 lines from PROMPT.md, ~20 lines per review prompt
EOF
)")
echo "  Created: $ISSUE7"

# --- Sub-issue 8 ---
echo "Creating sub-issue #8..."
ISSUE8=$(gh issue create -R "$REPO" \
  --title "Fix loop inefficiencies: double test run, sleep, config loading" \
  --label "enhancement,performance,P3" \
  --body "$(cat <<'EOF'
## Problem

Several small inefficiencies in `feature-loop.sh.tmpl` add up:

### 1. Double baseline test run (lines 620-628)
Tests run twice when any fail: once to check exit code, again to capture failures.

```bash
if (cd "$APP_DIR" && eval "$TEST_COMMAND" 2>&1) > /dev/null 2>&1; then
    : > "$BASELINE_FAILURES_FILE"
else
    (cd "$APP_DIR" && eval "$TEST_COMMAND" 2>&1) | normalize_test_failures > ...
fi
```

**Fix:** Run once, capture output, check both exit code and parse failures:
```bash
TEST_OUTPUT=$( (cd "$APP_DIR" && eval "$TEST_COMMAND") 2>&1) || true
TEST_EXIT=$?
if [ $TEST_EXIT -eq 0 ]; then
    : > "$BASELINE_FAILURES_FILE"
else
    echo "$TEST_OUTPUT" | normalize_test_failures > "$BASELINE_FAILURES_FILE"
fi
```

### 2. Unconditional sleep 2 (line 736)
2-second sleep after every implementation iteration. Over 6 iterations = 12 wasted seconds.

**Fix:** Remove the sleep entirely, or only sleep on failure (to throttle retries).

### 3. Config loaded via 9 separate node -e calls (lines 18-52)
Each reads one value from ralph.config.cjs, spawning a separate Node process.

**Fix:** Single node call outputting all values:
```bash
eval $(node -e "
  const c = require('$CONFIG_PATH');
  console.log('RALPH_ROOT=' + (c.paths?.root || '.ralph'));
  console.log('SPEC_DIR=' + (c.paths?.specs || '.ralph/specs'));
  // ... etc
" 2>/dev/null) || { RALPH_ROOT=".ralph"; SPEC_DIR=".ralph/specs"; ... }
```

### 4. Git diff computed 4 times identically (lines 707, 740, 835, 1001)
Same baseline-vs-HEAD diff pattern repeated. Could be a cached function.

## Files

- `src/templates/scripts/feature-loop.sh.tmpl`

## Estimated Savings

- ~10-30s from fixing double test run
- ~12s from removing sleep
- ~2-3s from consolidating config loading
- **~30s total**
EOF
)")
echo "  Created: $ISSUE8"

# --- Epic Issue ---
echo ""
echo "Creating epic issue..."
EPIC=$(gh issue create -R "$REPO" \
  --title "Optimize feature loop: reduce token usage and improve speed" \
  --label "enhancement,performance" \
  --body "$(cat <<EOF
## Overview

The feature loop runs 13+ \`claude -p\` sessions per feature. Each session starts fresh, re-sends full prompt templates, and causes Claude to re-read the same @file references. This results in high cached token volume, unnecessary wall-clock time, and elevated API costs.

## Current Baseline (per feature loop)

| Metric | Value |
|---|---|
| Total duration | ~30-40 min |
| Claude sessions | ~13 |
| Total cost | ~\$12.40 |
| Cached token volume | ~3.1M (73% of total) |

## Expected After Optimization

| Metric | Value | Improvement |
|---|---|---|
| Total duration | ~24-32 min | **~6-8 min faster (20%)** |
| Claude sessions | ~8-9 | **4-5 fewer sessions** |
| Total cost | ~\$8-9 | **~\$3.50-4.50 saved (28-36%)** |
| Cached token volume | ~2.0-2.3M | **~30-35% reduction** |

## Sub-issues (ordered by impact)

### P1 — High Impact
- [ ] $ISSUE1
- [ ] $ISSUE3

### P2 — Medium Impact
- [ ] $ISSUE2
- [ ] $ISSUE4

### P3 — Lower Impact (prompt trimming & small fixes)
- [ ] $ISSUE5
- [ ] $ISSUE6
- [ ] $ISSUE7
- [ ] $ISSUE8

## Savings Breakdown

| Optimization | Cost Saved | Time Saved |
|---|---|---|
| \`--resume\` for implementation loop | ~\$2.00 | ~1.5 min |
| Merge verification into review | ~\$1.80 | ~1.5 min |
| \`--resume\` for E2E/review loops | ~\$0.80 | ~1 min |
| Targeted E2E fix prompt | ~\$0.50 | ~45s |
| Trim PROMPT_e2e.md | ~\$0.10 | — |
| Trim PROMPT_feature.md | ~\$0.10 | — |
| Trim PROMPT.md + review prompts | ~\$0.20 | — |
| Loop inefficiencies (sleep, config, tests) | — | ~30s |
| **Total** | **~\$3.50-4.50** | **~6-8 min** |

Over 10 features: **~\$35-45 saved** and **~1 hour less** wall-clock time.
EOF
)")
echo "  Created: $EPIC"

echo ""
echo "========================================"
echo "All issues created successfully!"
echo ""
echo "Epic: $EPIC"
echo ""
echo "Sub-issues:"
echo "  #1 --resume impl loop:     $ISSUE1"
echo "  #2 --resume E2E/review:    $ISSUE2"
echo "  #3 Merge verify+review:    $ISSUE3"
echo "  #4 E2E fix prompt:         $ISSUE4"
echo "  #5 Trim E2E prompt:        $ISSUE5"
echo "  #6 Trim feature prompt:    $ISSUE6"
echo "  #7 Trim impl+review:       $ISSUE7"
echo "  #8 Loop inefficiencies:    $ISSUE8"
echo "========================================"
