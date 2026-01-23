/**
 * StreamingText - Renders AI response text with optional cursor
 *
 * Displays text as it streams in from the AI. The parent component
 * is responsible for accumulating text chunks and passing them via
 * the `text` prop. This component simply renders what it receives,
 * optionally showing a cursor when streaming is in progress.
 */

import React from 'react';
import { Text } from 'ink';
import { colors } from '../theme.js';

/**
 * Block cursor character (U+2588 - Full Block)
 */
const CURSOR_CHAR = '\u2588';

/**
 * Props for the StreamingText component
 */
export interface StreamingTextProps {
  /** The accumulated text to display */
  text: string;
  /** Whether streaming is still in progress */
  isStreaming: boolean;
  /** Optional text color (defaults to white) */
  color?: string;
  /** Whether to show cursor when streaming (defaults to true) */
  showCursor?: boolean;
}

/**
 * StreamingText component
 *
 * Renders text with an optional cursor indicator when streaming.
 * The cursor appears at the end of the text while `isStreaming` is true.
 *
 * @example
 * ```tsx
 * // During streaming
 * <StreamingText
 *   text="Hello, world"
 *   isStreaming={true}
 * />
 * // Renders: "Hello, world█"
 *
 * // After streaming completes
 * <StreamingText
 *   text="Hello, world!"
 *   isStreaming={false}
 * />
 * // Renders: "Hello, world!"
 * ```
 */
export function StreamingText({
  text,
  isStreaming,
  color = colors.white,
  showCursor = true,
}: StreamingTextProps): React.ReactElement {
  // Determine if cursor should be visible
  const displayCursor = isStreaming && showCursor;

  // Build the display text with optional cursor
  const displayText = displayCursor ? `${text}${CURSOR_CHAR}` : text;

  return <Text color={color}>{displayText}</Text>;
}
