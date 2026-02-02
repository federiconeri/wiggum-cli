/**
 * Input manipulation utilities for ChatInput component
 *
 * Pure functions for text normalization, cursor manipulation, and word navigation.
 * These are extracted for testability and reusability.
 */

/**
 * Result of a cursor manipulation operation
 */
export interface CursorManipulationResult {
  /** The new value after manipulation */
  newValue: string;
  /** The new cursor index after manipulation */
  newCursorIndex: number;
}

/**
 * Normalizes pasted text for single-line input
 *
 * Handles:
 * - Strips bracket paste mode markers (`\u001b[200~`, `\u001b[201~`)
 * - Converts all newline variants (`\n`, `\r`, `\r\n`) to spaces
 * - Converts tabs to spaces
 * - Strips escape sequences
 *
 * @param input - Raw pasted text (potentially multi-line)
 * @returns Normalized single-line text suitable for insertion
 *
 * @example
 * ```ts
 * normalizePastedText("line1\nline2") // => "line1 line2"
 * normalizePastedText("a\r\nb\nc") // => "a b c"
 * normalizePastedText("hello\tworld") // => "hello world"
 * ```
 */
export function normalizePastedText(input: string): string {
  // Strip bracket paste mode markers
  let cleaned = input.replace(/\u001b\[200~|\u001b\[201~/g, '');

  // Replace all newline variants with spaces
  cleaned = cleaned.replace(/[\r\n]+/g, ' ');

  // Replace tabs with spaces
  cleaned = cleaned.replace(/\t/g, ' ');

  // Strip remaining escape sequences
  cleaned = cleaned.replace(/\u001b/g, '');

  return cleaned;
}

/**
 * Inserts text at a specific cursor position
 *
 * @param value - Current input value
 * @param cursorIndex - Current cursor position (0 <= cursorIndex <= value.length)
 * @param text - Text to insert
 * @returns New value and cursor index after insertion
 *
 * @example
 * ```ts
 * insertTextAtCursor("hello", 5, " world")
 * // => { newValue: "hello world", newCursorIndex: 11 }
 *
 * insertTextAtCursor("foobar", 3, "baz")
 * // => { newValue: "foobazbar", newCursorIndex: 6 }
 * ```
 */
export function insertTextAtCursor(
  value: string,
  cursorIndex: number,
  text: string
): CursorManipulationResult {
  const before = value.slice(0, cursorIndex);
  const after = value.slice(cursorIndex);
  const newValue = before + text + after;
  const newCursorIndex = cursorIndex + text.length;

  return { newValue, newCursorIndex };
}

/**
 * Deletes the character before the cursor (backspace behavior)
 *
 * @param value - Current input value
 * @param cursorIndex - Current cursor position
 * @returns New value and cursor index after deletion
 *
 * @example
 * ```ts
 * deleteCharBefore("hello", 5)
 * // => { newValue: "hell", newCursorIndex: 4 }
 *
 * deleteCharBefore("hello", 0)
 * // => { newValue: "hello", newCursorIndex: 0 } (no-op at start)
 * ```
 */
export function deleteCharBefore(
  value: string,
  cursorIndex: number
): CursorManipulationResult {
  if (cursorIndex <= 0) {
    // At start of line, nothing to delete
    return { newValue: value, newCursorIndex: 0 };
  }

  const before = value.slice(0, cursorIndex - 1);
  const after = value.slice(cursorIndex);
  const newValue = before + after;
  const newCursorIndex = cursorIndex - 1;

  return { newValue, newCursorIndex };
}

/**
 * Deletes the character after the cursor (delete-forward behavior)
 *
 * @param value - Current input value
 * @param cursorIndex - Current cursor position
 * @returns New value and cursor index after deletion
 *
 * @example
 * ```ts
 * deleteCharAfter("hello", 0)
 * // => { newValue: "ello", newCursorIndex: 0 }
 *
 * deleteCharAfter("hello", 5)
 * // => { newValue: "hello", newCursorIndex: 5 } (no-op at end)
 * ```
 */
export function deleteCharAfter(
  value: string,
  cursorIndex: number
): CursorManipulationResult {
  if (cursorIndex >= value.length) {
    // At end of line, nothing to delete
    return { newValue: value, newCursorIndex: cursorIndex };
  }

  const before = value.slice(0, cursorIndex);
  const after = value.slice(cursorIndex + 1);
  const newValue = before + after;
  // Cursor stays in same position
  const newCursorIndex = cursorIndex;

  return { newValue, newCursorIndex };
}

/**
 * Moves cursor to the start of the previous word (word-left navigation)
 *
 * A "word" is defined as a contiguous sequence of alphanumeric characters and underscores.
 * The cursor skips over whitespace, then moves to the start of the word.
 *
 * @param value - Current input value
 * @param cursorIndex - Current cursor position
 * @returns New cursor index at the start of the previous word
 *
 * @example
 * ```ts
 * moveCursorByWordLeft("hello world", 11) // => 6 (start of "world")
 * moveCursorByWordLeft("foo  bar", 8) // => 5 (start of "bar")
 * moveCursorByWordLeft("test", 0) // => 0 (no-op at start)
 * ```
 */
export function moveCursorByWordLeft(value: string, cursorIndex: number): number {
  let idx = cursorIndex;

  // Skip trailing whitespace
  while (idx > 0 && /\s/.test(value[idx - 1]!)) {
    idx -= 1;
  }

  // Skip word characters
  while (idx > 0 && /[A-Za-z0-9_]/.test(value[idx - 1]!)) {
    idx -= 1;
  }

  return idx;
}

/**
 * Moves cursor to the end of the next word (word-right navigation)
 *
 * A "word" is defined as a contiguous sequence of alphanumeric characters and underscores.
 * The cursor skips over whitespace, then moves to the end of the word.
 *
 * @param value - Current input value
 * @param cursorIndex - Current cursor position
 * @returns New cursor index at the end of the next word
 *
 * @example
 * ```ts
 * moveCursorByWordRight("hello world", 0) // => 5 (end of "hello")
 * moveCursorByWordRight("foo  bar", 3) // => 8 (end of "bar")
 * moveCursorByWordRight("test", 4) // => 4 (no-op at end)
 * ```
 */
export function moveCursorByWordRight(value: string, cursorIndex: number): number {
  let idx = cursorIndex;

  // Skip leading whitespace
  while (idx < value.length && /\s/.test(value[idx]!)) {
    idx += 1;
  }

  // Skip word characters
  while (idx < value.length && /[A-Za-z0-9_]/.test(value[idx]!)) {
    idx += 1;
  }

  return idx;
}
