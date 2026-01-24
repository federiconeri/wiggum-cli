/**
 * Theme configuration for Ink-based Terminal UI
 *
 * Adapts the Simpson color palette for Ink's styling system.
 * Import from './theme.js' to use these constants in Ink components.
 */

/**
 * Simpson color palette - hex values for Ink components
 *
 * Usage in Ink:
 *   <Text color={colors.yellow}>Yellow text</Text>
 *   <Box borderColor={colors.brown}>...</Box>
 */
export const colors = {
  /** Marge Simpson hair / sky blue */
  blue: '#2f64d6',
  /** Simpson family skin tone - primary accent */
  yellow: '#f8db27',
  /** Homer's hair / wood tones - secondary/muted */
  brown: '#9c5b01',
  /** Highlights and emphasis */
  white: '#ffffff',
  /** Danger/warnings/errors */
  pink: '#ff81c1',
  /** Success/completion */
  green: '#4ade80',
  /** Warnings/caution */
  orange: '#fb923c',
} as const;

/**
 * Box drawing characters for custom borders
 */
export const box = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
} as const;

/**
 * Phase/progress indicator characters
 */
export const phase = {
  pending: '\u25cb', // ○
  active: '\u25d0', // ◐
  complete: '\u2713', // ✓
  error: '\u2717', // ✗
} as const;

/**
 * Phase status type for type-safe status handling
 */
export type PhaseStatus = keyof typeof phase;

/**
 * Color name type for type-safe color selection
 */
export type ColorName = keyof typeof colors;

/**
 * Get color hex value by name
 */
export function getColor(name: ColorName): string {
  return colors[name];
}

/**
 * Get phase character by status
 */
export function getPhaseChar(status: PhaseStatus): string {
  return phase[status];
}
