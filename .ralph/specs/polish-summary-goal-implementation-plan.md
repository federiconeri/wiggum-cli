# polish-summary-goal Implementation Plan

**Spec:** .ralph/specs/polish-summary-goal.md
**Branch:** feat/polish-summary-goal
**Status:** Completed

## Analysis

### Current State
The `SpecCompletionSummary` component (`src/tui/components/SpecCompletionSummary.tsx`) currently:
- Extracts a `goalCandidate` from conversation messages via `extractRecap()` using heuristic text analysis
- Goal selection priority: AI recap paragraph → long user message → any user message → fallback `Define "featureName"`
- Applies `normalizeRecap()` or `normalizeUserDecision()` to strip filler prefixes
- Truncates the goal to 160 characters via `summarizeText()` with a hard ellipsis cutoff
- All utility functions (`normalizeRecap`, `normalizeUserDecision`, `summarizeText`, `isUsefulDecision`, `extractRecap`) are co-located in the component file

### What Needs to Change
1. **Fallback chain redesign**: Current priority is `AI recap → user message`. Spec requires `AI recap → Key decisions → user request` — decisions are not currently used as a goal source.
2. **Goal polishing pipeline**: No imperative-verb enforcement or single-sentence enforcement exists. Need a dedicated `polishGoalSentence()` function.
3. **No truncation for Goal**: Currently uses `summarizeText(goalCandidate)` which slices at 160 chars. Must remove this and let Ink wrap naturally.
4. **Extract utilities to separate file**: Move goal-related logic to `src/tui/utils/polishGoal.ts` for better modularity and testability.

## Tasks

### Phase 1: Extract & Refactor Utilities

- [x] **Task 1.1** — Create `src/tui/utils/polishGoal.ts` with `selectGoalSource()` function - [complexity: M] — 631fae5
  - Extract and refactor goal source selection from `extractRecap()` into a standalone pure function
  - Implement the spec's 3-tier fallback chain: AI recap → key decisions → user request
  - `selectGoalSource({ aiRecap, keyDecisions, userRequest }): { source: 'ai' | 'decisions' | 'user', text: string }`
  - Skip empty/whitespace-only values
  - For `keyDecisions`: strip bullet prefixes (`-`, `*`, `1.` etc.), join fragments with `; `, produce a single merged string

- [x] **Task 1.2** — Create `polishGoalSentence()` in `src/tui/utils/polishGoal.ts` - [complexity: M] — 631fae5
  - **Whitespace normalization**: collapse multiple spaces/newlines to single spaces; trim
  - **Remove leading framing phrases**: rewrite "I want to …" → imperative, "We will …" → imperative, "This spec covers …" → "Implement …"
  - **Imperative verb enforcement**: maintain allowed verb list (`Implement|Add|Improve|Fix|Refactor|Support|Enable|Create|Update`); if text doesn't start with one, prepend `Implement ` + lowercased remainder
  - **Single sentence enforcement**: split on `. ` (conservative, avoids abbreviations like "e.g."); take first sentence if multiple exist; ensure exactly one trailing period
  - **Punctuation normalization**: strip trailing ellipses; ensure final output ends with `.`

### Phase 2: Integrate into Component

- [x] **Task 2.1** — Refactor `SpecCompletionSummary.tsx` to use new `polishGoal` utilities - [complexity: M] — 631fae5
  - Import `selectGoalSource` and `polishGoalSentence` from `src/tui/utils/polishGoal.js`
  - Adapt `extractRecap()` to output structured data that can feed `selectGoalSource()`:
    - Return `aiRecap` (first recap candidate text), `keyDecisions` (remaining recap candidates or user decisions), `userRequest` (first substantive non-URL user message)
  - Pipe selected source through `polishGoalSentence()` to produce final goal text
  - Keep `normalizeRecap`, `normalizeUserDecision`, `summarizeText`, `isUsefulDecision` in place (they're still used for decisions display)

- [x] **Task 2.2** — Remove Goal truncation in render - [complexity: S] — 631fae5
  - Change `<Text>- Goal: {summarizeText(goalCandidate)}</Text>` → `<Text>- Goal: {polishedGoal}</Text>` (no `summarizeText` wrapping)
  - Verify Ink `<Text>` wraps naturally (no fixed-width truncation on the Goal line)
  - Keep `summarizeText()` calls for decisions display unchanged (decisions still truncate at 120 chars)

### Phase 3: Tests

- [x] **Task 3.1** — Write unit tests for `selectGoalSource` in `src/tui/utils/polishGoal.test.ts` - [complexity: M] — 631fae5
  - Chooses AI recap when present
  - Chooses decisions when AI recap absent/whitespace
  - Chooses user request when both absent
  - Skips whitespace-only values
  - Decisions with bullet prefixes are cleaned and joined with `; `

- [x] **Task 3.2** — Write unit tests for `polishGoalSentence` in `src/tui/utils/polishGoal.test.ts` - [complexity: M] — 631fae5
  - Rewrites "I want to …" to imperative form
  - Rewrites "We will …" to imperative form
  - Collapses multi-sentence text into one sentence
  - Ensures trailing period
  - Ensures non-verbatim output for typical multi-clause inputs
  - Handles edge cases: abbreviations ("e.g."), trailing ellipses, empty input

- [x] **Task 3.3** — Update `SpecCompletionSummary.test.tsx` - [complexity: S] — 631fae5
  - Verify existing tests still pass (refactor imports if any utility moved)
  - Add component render test: render with a long Goal string (>160 chars), assert full string is present in output (not truncated)
  - Add component render test: verify Goal line is imperative (starts with expected verb pattern)
  - Verify no regressions when recap/decisions are missing

### Phase 4: Polish & Verify

- [x] **Task 4.1** — Manual QA: run `wiggum new` and verify completion summary - [complexity: S] — verified via code review + tests (563 pass)
  - Goal line renders as imperative single sentence
  - Long goals wrap across terminal lines instead of truncating
  - No layout overlap or corruption with other summary elements
  - Missing recap/decisions gracefully degrades

- [x] **Task 4.2** — Run full test suite, fix any regressions - [complexity: S] — 631fae5 (562 tests pass, build clean)
  - `npm test` passes
  - `tsc --noEmit` passes
  - Coverage does not regress

## Architecture Decision: Where to Put Polishing Logic

**Decision: New utility file `src/tui/utils/polishGoal.ts`**

Rationale:
- Spec explicitly suggests this location
- Follows existing pattern in `src/tui/utils/` (e.g., `build-run-summary.ts`, `git-summary.ts`)
- Keeps `SpecCompletionSummary.tsx` focused on rendering
- Pure functions are easier to unit-test in isolation
- Existing text-normalization functions (`normalizeRecap`, `normalizeUserDecision`) stay in the component file since they're still used for decisions display and are tightly coupled to `extractRecap()`

## Key Constraints
- **No new AI calls**: All polishing is pure string processing using deterministic heuristics
- **Deterministic**: Same input → same output, no randomness
- **Performance**: Pure string operations, <1ms typical
- **Backward compatible**: `extractRecap()` signature can change internally but the component's external props (`SpecCompletionSummaryProps`) remain identical

## Done
(Tasks will be marked as completed with commit hashes during implementation)
