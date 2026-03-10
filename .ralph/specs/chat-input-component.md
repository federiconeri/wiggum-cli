# Chat Input Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-02  

## Purpose

Improve the TUI chat input so that:

1. All paste scenarios (including large, multi-line text) are handled reliably and predictably.
2. Backspace/delete editing works correctly and consistently.

This replaces the fragile behavior from `ink-text-input@6.0.0` with a custom, robust input layer.

## User Stories

- As a user, I want any text I paste into the chat input to appear exactly as expected so I don’t lose or mangle parts of my prompt.
- As a user, I want multi-line text I paste to become a clean, single-line prompt so I can paste multi-line content without breaking the input.
- As a user, I want backspace/delete to remove characters in a normal, predictable way so I can confidently edit my message before sending it.
- As a user, I want these behaviors to work even for large pasted snippets and rapid editing so the chat feels responsive and reliable.

## Requirements

### Functional Requirements

#### FR1: Single-line Paste Behavior

- [x] Pasting single-line text into the chat input inserts the complete text at the current cursor position.
- [x] No characters are dropped, duplicated, or reordered during paste.
- [x] The cursor moves to the end of the newly inserted text.

**Acceptance Criteria**

- [x] Given an empty input, when the user pastes `hello world`, the input value becomes exactly `hello world` and the cursor is placed after `d`.
- [x] Given an input `foo baz` with cursor between `foo` and `baz` (`foo| baz`), when the user pastes ` bar`, the resulting input is `foo bar baz` and the cursor is placed after `r` in `bar`.
- [x] Rapidly pasting the same snippet (e.g., pressing paste shortcut multiple times quickly) results in a string containing the snippet repeated the correct number of times, with no truncation or corruption.

#### FR2: Multi-line Paste Flattening

- [x] Multi-line pasted text is normalized into a single line before insertion.
- [x] All newline variants (`\n`, `\r`, `\r\n`) are converted to spaces.
- [x] Consecutive whitespace sequences (including spaces introduced by newline replacement) are collapsed to a single space (optional but recommended).
- [x] The flattened text is inserted at the current cursor position.
- [x] The cursor moves to the end of the inserted flattened text.

**Acceptance Criteria**

- [x] Given an empty input, when the user pastes:

  ```text
  line one
  line two
  line three
  ```

  the resulting input is exactly `line one line two line three` (single spaces between words/lines) and the cursor is after `three`.

- [x] Given an existing input `prefix |suffix` (cursor at `|`), when the user pastes:

  ```text
  a
  b
  c
  ```

  the resulting input is `prefix a b c suffix` and the cursor is after `c`.

- [x] Pasting text with mixed line endings (e.g., `line1\r\nline2\nline3\rline4`) results in `line1 line2 line3 line4` with no stray newline characters.

#### FR3: Large/Bulk Paste Robustness

- [x] The component correctly handles pastes of at least 2–4 KB of text without lag severe enough to be noticeable in typical terminal environments.
- [x] Large pastes are inserted as a whole (no partial/half insertions).
- [x] No runtime errors or crashes occur during or after a large paste.

**Acceptance Criteria**

- [x] Pasting a 2 KB text snippet (e.g., a long prompt or code block) results in the full content being present in the input (subject to newline flattening), with the cursor at the end, and interaction remains responsive.
- [x] Running automated tests that simulate multiple consecutive large-paste events shows no thrown exceptions and the final value matches the concatenation of all pasted contents.

#### FR4: Backspace (Delete Backward) Behavior

- [x] Backspace removes the character immediately before the cursor when `cursorIndex > 0`.
- [x] When the cursor is at the start of the line (`cursorIndex === 0`), backspace does nothing.
- [x] Value and cursor position remain consistent with the rendered text.
- [x] Holding backspace repeatedly deletes characters until the input is empty, without corrupting the string.

**Acceptance Criteria**

- [x] Given input `abc|def` (cursor after `c`), pressing backspace once results in `ab|def` (removed `c`).
- [x] Given input `a|` (cursor after `a`), pressing backspace once results in `|` (empty string) with the cursor at position 0.
- [x] Given an empty input `|`, pressing backspace does not change the state and does not throw errors.
- [x] Holding backspace in a non-empty input deletes characters from the end one by one until the input is empty, with no visible control characters or artifacts.

#### FR5: Delete Forward (If Supported)

- [x] If terminal/Ink provides a distinct "delete forward" key event, it removes the character immediately after the cursor.
- [x] When the cursor is at the end of the line, delete-forward does nothing.
- [x] Value and cursor position remain consistent after the operation.

**Acceptance Criteria**

- [x] Given input `ab|cd` (cursor between `b` and `c`), pressing delete-forward once results in `ab|d` (removed `c`).
- [x] Given input `abcd|` (cursor at end), pressing delete-forward leaves the string unchanged and does not cause errors.

#### FR6: Maintain Existing Navigation & Submission Behavior

- [x] Existing left/right arrow navigation still works as before.
- [x] Existing history navigation, if present (e.g., up/down arrow cycling through previous inputs), is not broken by the new handling.
- [x] Enter/Return key submission behavior remains unchanged.

**Acceptance Criteria**

- [x] After the refactor, arrow keys move the cursor left/right through the line as they did previously.
- [x] If history is implemented, up/down still cycles through history items without being affected by pasted content or backspace behavior.
- [x] Enter still submits the current input and clears or persists the line according to existing behavior; paste and backspace do not interfere with submission.

### Non-Functional Requirements

- [x] Performance:
  - Paste and delete operations must complete and render updates without noticeable lag for inputs up to ~4 KB.
- [x] Robustness:
  - No unhandled exceptions related to input/paste/backspace across supported terminals (macOS and Linux).
- [x] Predictability:
  - Behavior must be deterministic and not depend on timing of character-by-character events from the terminal.
- [x] Cross-platform baseline:
  - Behavior must be correct on macOS (Terminal, iTerm2) and a common Linux terminal (e.g., GNOME Terminal, xterm).

## Technical Notes

### Current Context

- The project currently uses Ink (React for CLIs) with:
  - `ink-text-input@6.0.0`, which has known limitations:
    - Poor multi-line paste handling (processes character by character, no newline awareness).
    - Limited keyboard handling: only basic arrow keys; macOS modifier combos send unrecognized escape sequences that can appear as garbage input.
- There is a `ChatInput` component in `src/tui/components/ChatInput.tsx` that needs to be updated or replaced to implement this feature.

### Implementation Approach

#### TN1: Replace `ink-text-input` with Custom Input Handling

- Migrate `ChatInput` to use a custom input handler built on Ink’s `useInput` hook instead of relying on `ink-text-input`’s internal logic for paste and keys.
- Manage the following state inside `ChatInput`:
  - `value: string` – current input line.
  - `cursorIndex: number` – current cursor position in `value` (0 ≤ cursorIndex ≤ value.length).
  - Any existing history state (if already present) should be preserved.

#### TN2: Paste Detection and Normalization

- In the `useInput((input, key) => { ... })` handler:
  - Detect paste vs single keypress:

    ```ts
    const isBulkInput = input.length > 1;
    ```

  - Treat any `isBulkInput` case as a paste sequence and normalize:

    ```ts
    function normalizePastedText(raw: string): string {
      // Normalize line endings to \n
      const unified = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      // Replace newlines with spaces
      const noNewlines = unified.replace(/\n+/g, ' ');
      // Optionally collapse multiple spaces
      return noNewlines.replace(/\s+/g, ' ').trim();
    }
    ```

  - Insert the normalized string into `value` at `cursorIndex`:

    ```ts
    const normalized = normalizePastedText(input);
    const before = value.slice(0, cursorIndex);
    const after = value.slice(cursorIndex);
    const nextValue = before + normalized + after;
    const nextCursorIndex = cursorIndex + normalized.length;
    setValue(nextValue);
    setCursorIndex(nextCursorIndex);
    ```

- Ensure this logic is executed before any generic single-character input handling to prevent bulk paste from being processed char-by-char.

#### TN3: Single-character Input Handling

- For non-bulk inputs (`input.length === 1`) that are printable characters (not handled as special keys by Ink):
  - Insert the character at `cursorIndex` similar to how paste is handled, but with a single character.
  - Increment `cursorIndex` by 1.

#### TN4: Backspace Handling

- In `useInput`:

  ```ts
  if (key.backspace) {
    if (cursorIndex > 0) {
      const before = value.slice(0, cursorIndex - 1);
      const after = value.slice(cursorIndex);
      setValue(before + after);
      setCursorIndex(cursorIndex - 1);
    }
    return;
  }
  ```

- Ensure no earlier logic in the handler returns early and prevents this from executing.
- Guard against negative indices and ensure that every state update is consistent (`cursorIndex` always within 0–`value.length`).

#### TN5: Delete-forward Handling (If Exposed by Ink)

- If Ink exposes a `key.delete` (or similar) flag:

  ```ts
  if (key.delete) {
    if (cursorIndex < value.length) {
      const before = value.slice(0, cursorIndex);
      const after = value.slice(cursorIndex + 1);
      setValue(before + after);
      // cursorIndex remains unchanged
    }
    return;
  }
  ```

- If Ink does not expose such a flag in the current version, this part can be skipped or left as a no-op, but the spec remains future-compatible.

#### TN6: Cursor & Navigation Integration

- Existing left/right arrow handling:

  ```ts
  if (key.leftArrow) {
    if (cursorIndex > 0) setCursorIndex(cursorIndex - 1);
    return;
  }
  if (key.rightArrow) {
    if (cursorIndex < value.length) setCursorIndex(cursorIndex + 1);
    return;
  }
  ```

- Ensure history navigation (if present) is processed before character/paste edits and correctly resets `cursorIndex` to the end (or appropriate position) of the recalled history entry.

#### TN7: Prevent Garbage from Unrecognized Escape Sequences

- While full macOS modifier support is out of scope, the input handler should avoid interpreting unrecognized escape sequences as literal characters where possible.
- Minimal safeguard (optional enhancement, not required for this version):
  - If `input` starts with `\x1b` and matches a known problematic pattern (e.g., `\x1bb`, `\x1bf`, `\x1b[H`, `\x1b[F`), ignore it instead of inserting the characters.
  - This prevents visible garbage (`b`, `f`, `[H`, `[F`) even if no navigation feature is implemented for those combos.

#### TN8: Testing Strategy

- Unit tests (Vitest) for `ChatInput` logic or extracted helper functions:
  - Pure functions:
    - `normalizePastedText`:
      - Converts multi-line to single-line.
      - Handles mixed newline types.
      - Collapses spaces as expected.
  - Component-level tests:
    - Simulate `useInput` callbacks with:
      - Single-line bulk `input` strings.
      - Multi-line bulk `input` strings.
      - Backspace `key.backspace` events at various `cursorIndex` positions.
- Manual integration tests in the running TUI:
  - macOS Terminal and iTerm2, and at least one Linux terminal:
    - Paste single-line text.
    - Paste multi-line text.
    - Paste large text (~2 KB).
    - Use backspace to edit repeatedly.
    - Verify that Enter and arrow keys still behave as before.

### Key Dependencies

- Ink (React for CLI; version consistent with project).
- React v^18.3.1.
- Vitest for unit tests.
- Existing TUI/repl orchestration that wires `ChatInput` into the chat flow.

## Acceptance Criteria (Consolidated)

- [x] Single-line paste inserts the full text at the cursor with no character loss or duplication.
- [x] Multi-line paste is flattened to a single line, with newlines replaced by spaces and no raw newline characters remaining.
- [x] Large pastes (2–4 KB) are handled without noticeable lag or truncation, and the final input value is correct.
- [x] Backspace:
  - [x] Deletes the character before the cursor when not at the start.
  - [x] Has no effect and causes no errors at the start of the line.
  - [x] Works continuously when held down until the input is empty.
- [x] Delete-forward (if implemented) removes characters after the cursor correctly and is a no-op at the end of the line.
- [x] Existing arrow-key navigation, history navigation (if present), and Enter submission behavior are unchanged and still work.
- [x] No garbage sequences (`b`, `f`, `[H`, `[F`) are inserted as visible characters when using unsupported macOS shortcuts, or at minimum, no regressions are introduced compared to current behavior.
- [x] All new logic is covered by unit tests, and manual tests on macOS and Linux validate behavior.

## Out of Scope

- Full, correct support for macOS word/line navigation shortcuts (opt+←/→, cmd+←/→) as true cursor-movement operations.
- Multi-line editing within the chat input (the field remains conceptually single-line).
- Customizable keybinding profiles or terminal-specific keymap configuration beyond Ink’s default behavior.

## Project Tech Stack

- Framework: React v^18.3.1 (via Ink)
- Unit Testing: Vitest
- Package Manager: npm