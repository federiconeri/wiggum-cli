/**
 * Clear the terminal screen to prevent stale PTY scroll buffer artifacts.
 *
 * When Ink re-renders significantly shorter output (e.g. after dismissing a
 * 25-row IssuePicker), the old content remains in the PTY scroll buffer,
 * causing visual duplication of the banner and other content. This sends
 * ANSI escape sequences to clear the entire screen and reset the cursor.
 *
 * This is an intentional mix of imperative stdout writes with Ink's
 * declarative rendering — Ink has no API to flush the PTY scroll buffer.
 * Call this *before* state updates that shrink the rendered output so
 * Ink's next render paints onto a clean screen.
 */
export function clearScreen(stdout: NodeJS.WriteStream): void {
  stdout.write('\x1b[2J\x1b[H');
}
