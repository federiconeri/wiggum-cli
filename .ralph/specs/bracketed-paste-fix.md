# bracketed-paste-fix Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-02

---

## Purpose

Prevent single-chunk bracketed paste sequences from being silently dropped in the TUI `ChatInput` component by adjusting ESC handling so that bracketed paste content is correctly passed through to `normalizePastedText`, without changing any user-facing configuration or behavior outside of this bug fix.

---

## User Stories

- As a TUI user, I want text I paste into the input to always appear, regardless of how my terminal sends bracketed paste sequences, so that I can reliably paste commands and code.
- As a TUI user, I want keyboard navigation and editing shortcuts (like Option+arrow word navigation) to continue working as before, so that the paste fix doesn’t break my existing workflow.
- As a TUI user, I don’t want to configure anything or learn new behaviors; paste should “just work” and remain transparent.

---

## Requirements

### Functional Requirements

1. **Handle single-chunk bracketed paste correctly**
   - The input handler in `ChatInput.tsx` must recognize when an `input` chunk contains bracketed paste markers (`\u001b[200~` and/or `\u001b[201~`) and allow it to proceed to `normalizePastedText`.
   - It must not early-return just because the chunk starts with ESC when bracketed paste markers are present.

   **Acceptance Criteria**
   - [x] Given an input chunk `\u001b[200~hello world\u001b[201~`, after processing, the `ChatInput` internal buffer contains `hello world` (no markers, no ESC characters).
   - [x] For any chunk containing `\u001b[200~` or `\u001b[201~`, the code path does not return early solely due to `input.startsWith('\u001b')`.

2. **Preserve existing multi-chunk bracketed paste behavior**
   - The current behavior where some terminals send bracketed paste in multiple chunks (start marker, content, end marker) must continue to work unchanged.

   **Acceptance Criteria**
   - [x] When the sequence is received as:
     - Chunk 1: `\u001b[200~`
     - Chunk 2: `hello world`
     - Chunk 3: `\u001b[201~`
     the final buffer state is identical to the pre-fix behavior (e.g., `hello world` is present with no markers).
   - [x] Any existing tests for multi-chunk paste (if present) continue to pass without modification.

3. **Still ignore unknown, non-bracketed escape sequences**
   - Non-bracketed, unknown escape sequences (starting with ESC, not recognized by `handleEscapeSequence`, and without bracketed paste markers) must continue to be ignored to avoid inserting garbled characters.

   **Acceptance Criteria**
   - [x] Given an input chunk `\u001b[999~` that is not recognized by `handleEscapeSequence` and does not contain `\u001b[200~` or `\u001b[201~`, the `ChatInput` buffer remains unchanged.
   - [x] For other random ESC-prefixed garbage (e.g., `\u001babc`), the buffer remains unchanged.

4. **Preserve existing escape-based navigation and shortcuts**
   - Escape-sequence-based keybindings (such as arrow keys, Option+arrow for word navigation, etc.) must continue to behave as before.

   **Acceptance Criteria**
   - [x] Manual or automated tests confirm that Option+Right moves the cursor one word to the right exactly as it did before the fix.
   - [x] Manual or automated tests confirm that Option+Left moves the cursor one word to the left exactly as it did before the fix.
   - [x] Standard arrow keys and any other previously supported escape-based controls still function (no regression observed).

5. **User-facing behavior remains transparent**
   - The change is purely behavioral in paste handling; no new flags, configuration options, or UI elements are introduced.

   **Acceptance Criteria**
   - [x] No new CLI options, environment variables, or config fields are added related to paste/ESC handling.
   - [x] The TUI screens and prompts remain visually unchanged.

---

### Non-Functional Requirements

1. **Scope limitation**
   - All changes for this feature must be strictly confined to `src/tui/components/ChatInput.tsx`.

   **Acceptance Criteria**
   - [x] `git diff` for this feature shows modifications only in `src/tui/components/ChatInput.tsx` (plus test files if they co-locate or reside under the corresponding test directory).

2. **Maintainability**
   - The logic for distinguishing bracketed paste from other escape sequences must be clear and documented in-line.

   **Acceptance Criteria**
   - [x] The new bracketed paste check is implemented in a small, readable conditional, with a brief comment explaining why bracketed paste bypasses the generic unknown-ESC discard.
   - [x] Future maintainers can understand the intent by reading the code and a short comment without hunting external docs.

3. **Performance**
   - The additional checks for bracketed paste markers must not introduce noticeable latency or overhead in typical typing and navigation.

   **Acceptance Criteria**
   - [x] The feature relies only on simple string `includes` / `startsWith` checks on the `input` chunk and introduces no loops over large data structures.
   - [x] No regression is observed in manual testing for responsiveness of typing, navigation, or paste.

4. **Testability**
   - The behavior must be testable via unit tests or component tests (Vitest).

   **Acceptance Criteria**
   - [x] New tests are added or existing tests updated to cover:
     - single-chunk bracketed paste
     - unknown escape sequences
   - [x] All tests pass under `npm run test`.

---

## Technical Notes

### Context

- The TUI is React-based (Ink over Node) and uses `ChatInput.tsx` to handle user keystrokes and paste events.
- Current high-level flow in `ChatInput.tsx`:
  1. Incoming `input` string is received from Ink.
  2. If `input.includes('\u001b')`:
     - Call `handleEscapeSequence(input)`.
     - If that returns `true`, the event is considered handled and the function returns.
     - If it returns `false` and `input.startsWith('\u001b')`, the code returns early, discarding unknown ESC sequences.
  3. If not returned early, a `textToInsert` is computed as:
     ```ts
     const textToInsert =
       input.length > 1 ? normalizePastedText(input) : input;
     ```
  4. `textToInsert` is then inserted into the buffer.

- Issue:
  - A single chunk like `\u001b[200~hello world\u001b[201~`:
    - Contains ESC (`includes('\u001b')` is true).
    - Is not recognized by `handleEscapeSequence`, so it returns `false`.
    - Starts with ESC, so `input.startsWith('\u001b')` is true and the function `return`s.
    - Therefore, `normalizePastedText` is never called and the paste is silently dropped.

### Implementation Approach

1. **Add a bracketed paste detection guard**
   - In `ChatInput.tsx`, within the `if (input.includes('\u001b')) { ... }` block, add a check for bracketed paste markers:
     ```ts
     const hasBracketedPaste =
       input.includes('\u001b[200~') || input.includes('\u001b[201~');
     ```
   - Use this flag to decide whether to apply the generic unknown-ESC discard logic.

2. **Adjust the ESC handling logic**
   - Pseudocode outlining the revised structure:

     ```ts
     if (input.includes('\u001b')) {
       const hasBracketedPaste =
         input.includes('\u001b[200~') || input.includes('\u001b[201~');

       // Only treat as a pure escape sequence if NOT bracketed paste
       if (!hasBracketedPaste) {
         if (handleEscapeSequence(input)) {
           return; // known escape (navigation, etc.) handled
         }

         // Unknown escape starting with ESC: discard as before
         if (input.startsWith('\u001b')) {
           return;
         }
       }

       // If hasBracketedPaste, we deliberately do NOT early-return here.
       // We let it fall through to paste normalization.
     }

     const textToInsert =
       input.length > 1 ? normalizePastedText(input) : input;
     ```

   - Notes:
     - The `hasBracketedPaste` condition is evaluated before the unknown-ESC discard.
     - Known escape sequences (`handleEscapeSequence` returning `true`) still short-circuit as they do today.
     - Unknown ESC sequences are discarded only when they are not bracketed paste.

3. **Ensure `normalizePastedText` supports bracketed paste**
   - Confirm that `normalizePastedText`:
     - Strips `\u001b[200~` and `\u001b[201~` markers.
     - Normalizes the pasted content (e.g., line endings) as currently designed.
   - If not already implemented, update `normalizePastedText` to:
     - Remove both start and end markers.
     - Return the content between them unchanged except for its existing normalization behavior.

4. **No changes outside `ChatInput.tsx`**
   - Do not modify:
     - Shared terminal utilities in `src/terminal`
     - TUI hooks in `src/tui/hooks`
     - Other components in `src/tui/components`
   - All behavior changes should originate only from the revised logic inside `ChatInput.tsx`.

5. **Testing strategy (Vitest)**
   - Add tests around the `ChatInput` input handling function (or the smallest unit that processes `input` chunks) to cover:
     - **Single-chunk bracketed paste**
       - Mock an input event: `\u001b[200~hello world\u001b[201~`.
       - Assert final buffer state is `hello world`.
     - **Multi-chunk bracketed paste (regression)**
       - Feed `\u001b[200~`, then `hello world`, then `\u001b[201~`.
       - Assert final buffer state is correct and unchanged from previous behavior.
     - **Unknown escape sequence**
       - Feed `\u001b[999~`.
       - Assert buffer remains unchanged.
     - **Known escape sequence (navigation)**
       - Feed known escape input representing Option+Right, with a pre-populated buffer.
       - Assert that cursor position changes appropriately and no text is inserted.
   - Tests should run as part of `npm run test` with Vitest.

---

## Acceptance Criteria

- [x] **Single-chunk bracketed paste works:** Sending `\u001b[200~hello world\u001b[201~` as one input chunk results in `hello world` being inserted into the `ChatInput` buffer, with no escape markers present.
- [x] **Multi-chunk bracketed paste unchanged:** When start marker, content, and end marker arrive in separate chunks, the resulting buffer state matches the behavior before this change (e.g., `hello world` is inserted once, no extra characters).
- [x] **Unknown ESC still ignored:** Inputs that start with ESC, are not recognized by `handleEscapeSequence`, and lack bracketed paste markers do not change the buffer.
- [x] **Navigation shortcuts unchanged:** Option+arrow and other known escape-based controls still work exactly as they did before the change (verified by tests and/or targeted manual checks).
- [x] **Scope confined to ChatInput:** Only `src/tui/components/ChatInput.tsx` (and its associated test file) is modified for this feature.
- [x] **Tests updated and passing:** New unit tests for single-chunk bracketed paste and unknown ESC handling are added or updated, and the entire test suite passes via `npm run test`.

---

## Out of Scope

- Introducing new configuration flags or environment variables for paste or ESC handling.
- Changes to any other TUI components, hooks, or terminal-level utilities.
- Redesigning or refactoring the entire escape-sequence handling system beyond the minimal modifications needed to support bracketed paste.
- Enhancements to non-bracketed paste behavior beyond what `normalizePastedText` already does (e.g., content transformations, formatting).

---

## Project Tech Stack

- **Framework:** React v^18.3.1 (with Ink for TUI)
- **Unit Testing:** Vitest
- **Package Manager:** npm