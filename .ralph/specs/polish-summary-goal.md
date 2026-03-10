# polish-summary-goal Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-17

## Purpose
Polish the `/new` completion Summary “Goal” line so it is an agent-authored, imperative, single-sentence recap (not verbatim user input), sourced via a defined fallback chain (AI recap → Key decisions → user request), and displayed without naive truncation (wrap to terminal width).

## User Stories
- As a user completing `/new`, I want the “Goal” line to be a synthesized recap so I can quickly verify the outcome without rereading my original prompt.
- As a user, I want the “Goal” line to be action-oriented and consistent with the summary’s “Key decisions” tone so the completion screen feels cohesive.
- As a user, I want the “Goal” line to wrap naturally in the terminal (not be cut mid-sentence) so I can read it cleanly.

## Requirements

### Functional Requirements
- [x] **FR1: Goal source selection uses deterministic fallback chain**  
  The Goal recap source MUST be selected in this order, taking the first non-empty candidate:
  1) AI recap (if present)  
  2) Key decisions (if present)  
  3) User request (final user input / normalized user message)
  - **Acceptance criteria:** Given contexts where multiple sources exist, the chosen source matches the priority list.
  - **Acceptance criteria:** If a source is empty/whitespace, it is skipped.

- [x] **FR2: Goal is agent-authored (rewrite), not verbatim**  
  The displayed Goal MUST be a rewritten sentence derived from the selected source, not a direct copy.
  - **Acceptance criteria:** For typical multi-clause user inputs, the Goal output is not identical to the raw user request string (after whitespace normalization).
  - **Acceptance criteria:** If the selected source is already a clean imperative sentence, minimal edits are allowed (capitalization, punctuation), but the system should still pass through the same “polish” pipeline.

- [x] **FR3: Goal is exactly one sentence**  
  The displayed Goal MUST be a single sentence.
  - **Acceptance criteria:** The final Goal contains no more than one sentence-ending punctuation boundary (`.`, `!`, `?`) at the end (allow internal abbreviations if present; see Technical Notes for heuristic).
  - **Acceptance criteria:** If source contains multiple sentences/bullets, only one sentence is produced (merge into one sentence or take first sentence based on deterministic rule).

- [x] **FR4: Goal is imperative/action-oriented**  
  The Goal sentence MUST be written in an imperative, action-oriented style (e.g., “Implement…”, “Add…”, “Improve…”).
  - **Acceptance criteria:** Output begins with an allowed imperative verb from a controlled set OR matches an imperative template produced by the polisher.
  - **Acceptance criteria:** Output does not start with “I want…”, “We will…”, “This spec…”, or other non-imperative scaffolding; these must be rewritten.

- [x] **FR5: No truncation; wrap to terminal width**  
  The Goal line MUST NOT be truncated via naive character slicing for the completion summary. It should wrap naturally in Ink.
  - **Acceptance criteria:** For long Goal strings, the component renders full text (no `slice`-based truncation) and Ink wraps across lines.
  - **Acceptance criteria:** The rest of the completion summary remains readable (no layout overlap/corruption).

### Non-Functional Requirements
- [x] **NFR1: Deterministic output**  
  For the same stored context (AI recap/decisions/user request), the Goal text must be stable across runs (no randomness).
- [x] **NFR2: Performance**  
  Polishing should be pure string processing; negligible runtime impact (<1ms typical).
- [x] **NFR3: Robustness**  
  Missing/partial fields must not crash the TUI; Goal should degrade gracefully using the fallback chain.
- [x] **NFR4: Test coverage**  
  Add/adjust unit tests (Vitest) for source selection and formatting rules.

## Technical Notes

### Relevant code locations (expected touchpoints)
- `src/tui/components/SpecCompletionSummary.tsx`  
  Currently responsible for rendering the completion Summary including the “Goal” line; contains existing recap extraction and truncation behavior.
- `src/tui/components/SpecCompletionSummary.test.tsx`  
  Existing tests should be expanded to cover rewritten imperative goal and non-truncation.
- `src/tui/screens/InterviewScreen.tsx`  
  Invokes/displays the completion summary after `/new` interview completion (verify where Goal text is passed/derived).

### Proposed design
1. **Introduce a dedicated goal-polishing helper**
   - Create a pure function, e.g.:
     - `src/tui/utils/polishGoal.ts` exporting:
       - `selectGoalSource({ aiRecap, keyDecisions, userRequest }): { source: 'ai'|'decisions'|'user', text: string }`
       - `polishGoalSentence(text: string): string`
   - Keep logic unit-testable without Ink rendering.

2. **Source extraction rules**
   - AI recap: use the best available recap field already produced by the flow (do not add a new AI call).
   - Key decisions: if stored as bullets/array/string, normalize by:
     - stripping bullet prefixes (`-`, `*`, `1.` etc.)
     - joining key fragments deterministically (e.g., `; `) before polishing into one sentence.
   - User request: use the final user intent text; normalize whitespace.

3. **Polishing rules (deterministic heuristics)**
   - **Whitespace normalization:** collapse multiple spaces/newlines to single spaces; trim.
   - **Remove leading framing phrases:** rewrite starts like:
     - “I want to …” → “Implement …” / “Add …”
     - “We will …” → imperative form
     - “This spec covers …” → “Implement …”
   - **Imperative verb enforcement:**
     - Maintain an allowed verb list, e.g. `Implement|Add|Improve|Fix|Refactor|Support|Enable|Create|Update`
     - If text does not start with one, rewrite to: `Implement ${nounPhraseOrClause}` (best-effort using remaining text).
   - **Single sentence enforcement:**
     - Prefer: take the first complete sentence if present; otherwise merge clauses into one sentence with commas and “and”.
     - Ensure exactly one final period.
   - **Punctuation normalization:**
     - Strip trailing ellipses.
     - Ensure final output ends with `.`

4. **Rendering (no truncation)**
   - Remove/disable `summarizeText()` truncation for Goal.
   - Ensure Ink `<Text>` is allowed to wrap naturally (avoid fixed-width truncation).
   - If the component is using any manual width constraints, keep them but do not slice the string; rely on wrapping.

### Edge cases & considerations
- Empty AI recap and empty decisions: must fall back to user request.
- Decisions-only context: decisions may be multiple bullets; must still produce one imperative sentence.
- Very long user request: still one sentence; wraps across lines.
- Abbreviations (“e.g.”) may contain periods; sentence-detection should be simple and conservative. Prefer a heuristic such as:
  - If splitting on `. ` yields multiple parts, take first part unless it looks like an abbreviation sequence; otherwise merge into one sentence via comma joining. (Keep implementation simple and tested against a few representative cases.)

### Testing approach (Vitest)
- **Unit tests for `selectGoalSource`:**
  - chooses AI when present
  - chooses decisions when AI absent
  - chooses user request when both absent
  - skips whitespace-only values
- **Unit tests for `polishGoalSentence`:**
  - rewrites “I want to …” to imperative
  - collapses bullets into one sentence
  - ensures exactly one sentence + trailing period
  - ensures non-verbatim for typical inputs (string inequality after normalization)
- **Component render test(s):**
  - Render `SpecCompletionSummary` with a long Goal and assert the full string is present in output (not truncated).

## Acceptance Criteria
- [x] The `/new` completion Summary "Goal" line is generated via fallback chain **AI recap → Key decisions → user request** (verified by tests).
- [x] The "Goal" line is **imperative** and **exactly one sentence** (verified by tests on `polishGoalSentence`).
- [x] The "Goal" line is **agent-authored** (not verbatim user input in typical cases), demonstrated by at least one test where input ≠ output after normalization.
- [x] The "Goal" line is **not truncated** by character slicing and **wraps** in the TUI; a render test confirms the full string is present.
- [x] No regressions in the completion summary layout or runtime errors when recap/decisions are missing.

## Out of Scope
- Generating a new AI recap specifically for the Goal line (must reuse existing data).
- Changing the content/formatting of other summary fields beyond what’s needed to maintain layout stability.
- Persisting the polished Goal to new files or config formats unless already part of existing artifacts.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm  

## Reference Documents

### Inline context
Follow-up from #8: the completion Summary “Goal” line still mirrors the user’s input and gets truncated. Improve it by: generating a concise agent-authored recap (not verbatim user input) smarter truncation (prefer clause/word boundary, avoid mid-sentence cut) keep summary tone consistent with Key decisions Acceptance: Goal line reads like a synthesized summary and does not truncate mid‑sentence in typical cases.