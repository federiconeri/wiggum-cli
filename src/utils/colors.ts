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

/**
 * Compact section header (single line style)
 */
export function compactHeader(title: string): string {
  const titlePart = `─── ${title} ───`;
  return simpson.yellow(titlePart);
}

/**
 * Progress phase indicators
 */
export const phase = {
  pending: '○',
  active: '◐',
  complete: '✓',
  error: '✗',
};

/**
 * Display a stack info box (with properly colored borders)
 */
export function stackBox(stack: {
  framework?: string;
  language?: string;
  testing?: string;
  packageManager?: string;
}): string {
  const lines: string[] = [];
  const maxLabelWidth = 10;
  const boxWidth = 45;

  const addLine = (label: string, value: string | undefined) => {
    if (value) {
      const paddedLabel = label.padEnd(maxLabelWidth);
      const content = `  ${paddedLabel} ${value}`;
      const visibleLen = content.length;
      const padding = boxWidth - visibleLen;
      // Color the labels but not the values, color the borders
      const coloredContent = `  ${simpson.brown(paddedLabel)} ${value}`;
      lines.push(simpson.brown('│') + coloredContent + ' '.repeat(Math.max(0, padding)) + simpson.brown('│'));
    }
  };

  lines.push(simpson.brown('┌─ Detected Stack ' + '─'.repeat(boxWidth - 17) + '┐'));
  addLine('Framework:', stack.framework);
  addLine('Language:', stack.language);
  addLine('Testing:', stack.testing);
  addLine('Package:', stack.packageManager);
  lines.push(simpson.brown('└' + '─'.repeat(boxWidth) + '┘'));

  return lines.join('\n');
}

/**
 * Progress phases display
 */
export interface ProgressPhase {
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  detail?: string;
}

export function progressPhases(phases: ProgressPhase[]): string {
  return phases.map((p, i) => {
    const num = `${i + 1}.`;
    const icon = phase[p.status];
    const statusColor = p.status === 'complete' ? simpson.yellow :
                        p.status === 'active' ? simpson.white :
                        p.status === 'error' ? simpson.pink :
                        simpson.brown;
    const detail = p.detail ? simpson.brown(` (${p.detail})`) : '';
    return `  ${num} ${statusColor(icon)} ${p.name}${detail}`;
  }).join('\n');
}

/**
 * File tree display for generated files
 */
export function fileTree(basePath: string, files: string[]): string {
  // Group files by directory
  const tree: Record<string, string[]> = {};

  for (const file of files) {
    const parts = file.split('/');
    if (parts.length === 1) {
      tree[''] = tree[''] || [];
      tree[''].push(parts[0]);
    } else {
      const dir = parts.slice(0, -1).join('/');
      const filename = parts[parts.length - 1];
      tree[dir] = tree[dir] || [];
      tree[dir].push(filename);
    }
  }

  const lines: string[] = [`  ${simpson.yellow(basePath + '/')}`];
  const dirs = Object.keys(tree).sort();

  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const isLastDir = i === dirs.length - 1;
    const dirPrefix = isLastDir ? '  └── ' : '  ├── ';
    const filePrefix = isLastDir ? '      ' : '  │   ';

    if (dir) {
      lines.push(`${dirPrefix}${simpson.brown(dir + '/')}`);
    }

    const filesInDir = tree[dir].sort();
    for (let j = 0; j < filesInDir.length; j++) {
      const file = filesInDir[j];
      const isLastFile = j === filesInDir.length - 1;
      const connector = dir ? (isLastFile ? '└── ' : '├── ') : (isLastFile && isLastDir ? '└── ' : '├── ');
      const prefix = dir ? filePrefix : '  ';
      lines.push(`${prefix}${connector}${file}`);
    }
  }

  return lines.join('\n');
}

/**
 * Next steps box
 */
export function nextStepsBox(steps: Array<{ command: string; description: string }>): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(compactHeader('Next Steps'));
  lines.push('');

  for (const step of steps) {
    lines.push(`  ${simpson.yellow('$')} ${step.command}`);
    lines.push(`    ${simpson.brown(step.description)}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Fixed-length password mask (32 characters)
 */
export const PASSWORD_MASK_LENGTH = 32;
export const PASSWORD_MASK = '▪'.repeat(PASSWORD_MASK_LENGTH);
