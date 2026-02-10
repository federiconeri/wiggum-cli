/**
 * Ink test utilities
 *
 * Helpers for rendering and interacting with Ink components in tests.
 * Built on top of ink-testing-library.
 */

import { render } from 'ink-testing-library';

type Instance = ReturnType<typeof render>;

/**
 * Wait for a short period to let React effects settle.
 */
export function wait(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Render and wait for effects to settle.
 * Returns the ink-testing-library Instance.
 *
 * IMPORTANT: Always use this (or manually wait after render) before
 * writing to stdin, because React 18 useEffect runs asynchronously.
 */
export async function renderAndWait(
  renderFn: () => Instance,
  delayMs = 50,
): Promise<Instance> {
  const instance = renderFn();
  await wait(delayMs);
  return instance;
}

/**
 * Strip ANSI escape codes from a string for clean assertions.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Send a string of text as key-by-key input.
 * Each character is written individually to simulate real typing,
 * which is required because Ink's useInput processes multi-char
 * writes as paste events.
 *
 * Waits before and after writing to allow React effects to settle.
 */
export async function type(instance: Instance, text: string): Promise<void> {
  for (const char of text) {
    instance.stdin.write(char);
    // Yield to let React commit the state update before the next char.
    // Without this, React batches consecutive synchronous writes and
    // only the last write in each batch survives (stale closure values).
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await wait(30);
}

/**
 * Press Enter (carriage return).
 */
export function pressEnter(instance: Instance): void {
  instance.stdin.write('\r');
}

/**
 * Press Escape.
 */
export function pressEscape(instance: Instance): void {
  instance.stdin.write('\u001b');
}
