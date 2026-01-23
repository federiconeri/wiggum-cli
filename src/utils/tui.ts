/**
 * TUI (Text User Interface) Utilities
 * Claude Code-like display helpers for the interview agent
 */

import pc from 'picocolors';
import { simpson } from './colors.js';

/**
 * Generation phases for the spec generator
 */
export type Phase = 'context' | 'goals' | 'interview' | 'generation' | 'complete';

/**
 * Phase display configuration
 */
interface PhaseConfig {
  label: string;
  description: string;
}

const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  context: { label: 'Context', description: 'Share reference URLs or files' },
  goals: { label: 'Goals', description: 'Describe what you want to build' },
  interview: { label: 'Interview', description: 'Answer clarifying questions' },
  generation: { label: 'Spec', description: 'Generate specification' },
  complete: { label: 'Complete', description: 'Spec generated' },
};

/**
 * Tool icons for display
 */
const TOOL_ICONS: Record<string, string> = {
  read_file: '📂',
  search_codebase: '🔍',
  list_directory: '📁',
  tavily_search: '🌐',
  resolveLibraryId: '📚',
  queryDocs: '📚',
  context7: '📚',
  default: '🔧',
};

/**
 * Display the phase header (Claude Code style box)
 */
export function displayPhaseHeader(
  featureName: string,
  currentPhase: Phase,
  questionCount?: { current: number; max: number }
): void {
  const width = 66;

  // Build phase indicators
  const phases: Phase[] = ['context', 'goals', 'interview', 'generation'];
  const phaseLabels = phases.map(phase => {
    const config = PHASE_CONFIG[phase];
    if (phase === currentPhase) {
      return `[${config.label}]`;
    }
    return config.label;
  });

  const phaseString = phaseLabels.join(' → ');

  // Build right-side info (question count)
  const rightInfo = questionCount
    ? `Questions: ${questionCount.current}/${questionCount.max}`
    : '';

  // Create the header box
  const title = `Feature: ${featureName}`;
  const topLine = '┌─' + ' '.repeat(width - 4) + '─┐';
  const bottomLine = '└─' + ' '.repeat(width - 4) + '─┘';

  // Title line
  const titlePadding = width - 4 - title.length;
  const titleLine = `│ ${simpson.yellow(title)}${' '.repeat(Math.max(0, titlePadding))} │`;

  // Phase line with right info
  const phasePadding = width - 4 - phaseString.length - rightInfo.length;
  const phaseLine = `│ ${pc.dim(phaseString)}${' '.repeat(Math.max(0, phasePadding))}${pc.dim(rightInfo)} │`;

  console.log('');
  console.log(pc.dim(topLine));
  console.log(titleLine);
  console.log(phaseLine);
  console.log(pc.dim(bottomLine));
  console.log('');
}

/**
 * Display a tool usage indicator (like Claude Code)
 */
export function displayToolUse(toolName: string, args: Record<string, unknown>): void {
  const icon = TOOL_ICONS[toolName] || TOOL_ICONS.default;
  const formattedCall = formatToolCall(toolName, args);
  console.log(pc.dim(`    ${icon} ${formattedCall}`));
}

/**
 * Format a tool call for display
 */
function formatToolCall(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return `Reading ${args.path}`;

    case 'search_codebase':
      const dir = args.directory ? ` in ${args.directory}/` : '';
      return `Searching for "${args.pattern}"${dir}`;

    case 'list_directory':
      return `Listing ${args.path || '.'}`;

    case 'tavily_search':
      return `Web: "${args.query}"`;

    case 'resolveLibraryId':
      return `Looking up library: ${args.libraryName}`;

    case 'queryDocs':
      return `Docs: ${args.libraryId} - "${(args.query as string)?.slice(0, 40)}..."`;

    default:
      // Generic format
      const argStr = Object.entries(args)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`.slice(0, 30))
        .join(', ');
      return `${toolName}(${argStr})`;
  }
}

/**
 * Display session context (project info)
 */
export function displaySessionContext(context: {
  projectName?: string;
  stack?: string;
  entryPoints?: string[];
  tools?: { tavily: boolean; context7: boolean; codebase: boolean };
}): void {
  const width = 66;
  const topLine = '┌─' + ' '.repeat(width - 4) + '─┐';
  const bottomLine = '└─' + ' '.repeat(width - 4) + '─┘';

  const lines: string[] = [];

  if (context.projectName) {
    lines.push(`Project: ${context.projectName}`);
  }
  if (context.stack) {
    lines.push(`Stack: ${context.stack}`);
  }
  if (context.entryPoints && context.entryPoints.length > 0) {
    lines.push(`Entry: ${context.entryPoints.slice(0, 2).join(', ')}`);
  }
  if (context.tools) {
    const toolList = [];
    if (context.tools.tavily) toolList.push('Tavily ✓');
    if (context.tools.context7) toolList.push('Context7 ✓');
    if (context.tools.codebase) toolList.push('Codebase ✓');
    if (toolList.length > 0) {
      lines.push(`Tools: ${toolList.join('  ')}`);
    }
  }

  if (lines.length === 0) return;

  console.log(pc.dim(topLine));
  for (const line of lines) {
    const padding = width - 4 - line.length;
    console.log(`│ ${pc.dim(line)}${' '.repeat(Math.max(0, padding))} │`);
  }
  console.log(pc.dim(bottomLine));
  console.log('');
}

/**
 * Display progress phases with visual indicators
 */
export function displayProgressPhases(currentPhase: Phase): void {
  const phases: Phase[] = ['context', 'goals', 'interview', 'generation'];

  console.log('');
  for (const phase of phases) {
    const config = PHASE_CONFIG[phase];
    let indicator: string;
    let style: (text: string) => string;

    if (phase === currentPhase) {
      indicator = '◐'; // In progress
      style = simpson.yellow;
    } else if (getPhaseIndex(phase) < getPhaseIndex(currentPhase)) {
      indicator = '●'; // Completed
      style = pc.green;
    } else {
      indicator = '○'; // Pending
      style = pc.dim;
    }

    const current = phase === currentPhase ? ' ← current' : '';
    console.log(`  ${style(indicator)} ${style(config.label)}  ${pc.dim(`- ${config.description}`)}${pc.dim(current)}`);
  }
  console.log('');
}

/**
 * Get the index of a phase for comparison
 */
function getPhaseIndex(phase: Phase): number {
  const order: Phase[] = ['context', 'goals', 'interview', 'generation', 'complete'];
  return order.indexOf(phase);
}

/**
 * Display a warning for garbled input
 */
export function displayGarbledInputWarning(received: string): void {
  console.log('');
  console.log(pc.yellow(`⚠️  Received incomplete input: "${received.slice(0, 50)}${received.length > 50 ? '...' : ''}"`));
  console.log(pc.dim('    Please paste again or type your answer.'));
}

/**
 * Display AI prefix before streaming
 */
export function displayAIPrefix(): void {
  process.stdout.write(simpson.blue('AI: '));
}

/**
 * Display a simple separator line
 */
export function displaySeparator(): void {
  console.log(pc.dim('─'.repeat(60)));
}

/**
 * Display thinking indicator
 */
export function displayThinking(): void {
  process.stdout.write(pc.dim('Thinking...'));
}

/**
 * Clear thinking indicator
 */
export function clearThinking(): void {
  // Move cursor back and clear line
  process.stdout.write('\r' + ' '.repeat(20) + '\r');
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
