/**
 * Theme configuration for Ink-based Terminal UI
 *
 * Simpson-inspired semantic color system for professional CLI aesthetics.
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
  /** Gray for hints and secondary text */
  gray: '#6b7280',
  /** Dark gray for separators */
  separator: '#374151',
} as const;

/**
 * Semantic color system for TUI components
 */
export const theme = {
  colors: {
    /** Brand color - Simpson yellow for banner, headers */
    brand: colors.yellow,
    /** Green prompt character › */
    prompt: colors.green,
    /** White user text */
    userText: colors.white,
    /** Simpson yellow for AI responses */
    aiText: colors.yellow,
    /** Brown for dimmed AI/thinking */
    aiDim: colors.brown,
    /** Tool call status colors */
    tool: {
      pending: colors.gray,
      running: colors.yellow,
      success: colors.green,
      error: colors.pink,
    },
    /** Separator color for pipes and borders */
    separator: colors.separator,
    /** Hint text color */
    hint: colors.gray,
    /** Semantic colors */
    success: colors.green,
    warning: colors.orange,
    error: colors.pink,
    link: colors.blue,
  },
  /** Status line formatting */
  statusLine: {
    separator: ' │ ',
  },
  /** Consistent spacing */
  spacing: {
    indent: 2,
    sectionGap: 1,
  },
  /** Characters */
  chars: {
    prompt: '›',
    bullet: '●',
    linePrefix: '│',
    lineEnd: '└',
  },
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
