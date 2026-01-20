/**
 * Simpson Color Palette
 * Custom ANSI color utilities for the CLI
 */

/**
 * Simpson color palette hex values
 */
export const SIMPSON_COLORS = {
  blue: '#2f64d6',
  yellow: '#f8db27',
  brown: '#9c5b01',
  white: '#ffffff',
  pink: '#ff81c1',
} as const;

/**
 * Convert hex to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Create ANSI escape code for foreground color from hex
 */
function fgHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Reset ANSI escape code
 */
const reset = '\x1b[0m';

/**
 * Simpson color functions for terminal output
 */
export const simpson = {
  yellow: (text: string): string => `${fgHex(SIMPSON_COLORS.yellow)}${text}${reset}`,
  blue: (text: string): string => `${fgHex(SIMPSON_COLORS.blue)}${text}${reset}`,
  brown: (text: string): string => `${fgHex(SIMPSON_COLORS.brown)}${text}${reset}`,
  white: (text: string): string => `${fgHex(SIMPSON_COLORS.white)}${text}${reset}`,
  pink: (text: string): string => `${fgHex(SIMPSON_COLORS.pink)}${text}${reset}`,
};

/**
 * Box drawing characters
 */
export const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
};

/**
 * Draw a horizontal line
 */
export function drawLine(width: number = 50): string {
  return simpson.brown(box.horizontal.repeat(width));
}

/**
 * Strip ANSI escape codes from text to get visible length
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Draw a box around text
 */
export function drawBox(text: string, padding: number = 1): string {
  const paddedText = ' '.repeat(padding) + text + ' '.repeat(padding);
  const visibleWidth = stripAnsi(paddedText).length;

  const top = simpson.brown(box.topLeft + box.horizontal.repeat(visibleWidth) + box.topRight);
  const middle = simpson.brown(box.vertical) + paddedText + simpson.brown(box.vertical);
  const bottom = simpson.brown(box.bottomLeft + box.horizontal.repeat(visibleWidth) + box.bottomRight);

  return `${top}\n${middle}\n${bottom}`;
}

/**
 * Section header with horizontal lines
 */
export function sectionHeader(title: string): string {
  const line = drawLine(50);
  return `\n${line}\n${simpson.yellow(title)}\n${line}`;
}
