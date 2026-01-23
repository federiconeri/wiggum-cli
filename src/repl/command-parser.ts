/**
 * Command Parser
 * Parses slash commands and natural language input for the REPL
 */

/**
 * Parsed slash command
 */
export interface SlashCommand {
  /** Command name (without slash) */
  name: string;
  /** Command arguments */
  args: string[];
  /** Raw input string */
  raw: string;
}

/**
 * Input types
 */
export type InputType = 'slash-command' | 'natural-language' | 'empty';

/**
 * Parsed input result
 */
export interface ParsedInput {
  type: InputType;
  command?: SlashCommand;
  text?: string;
}

/**
 * Available REPL commands
 */
export const REPL_COMMANDS = {
  init: {
    description: 'Initialize Wiggum in this project',
    usage: '/init',
    aliases: ['i'],
  },
  new: {
    description: 'Create a new feature specification',
    usage: '/new <feature-name>',
    aliases: ['n'],
  },
  run: {
    description: 'Run the feature development loop',
    usage: '/run <feature-name>',
    aliases: ['r'],
  },
  monitor: {
    description: 'Monitor a running feature loop',
    usage: '/monitor <feature-name>',
    aliases: ['m'],
  },
  config: {
    description: 'Manage API keys and settings',
    usage: '/config [set <service> <key>]',
    aliases: ['cfg'],
  },
  help: {
    description: 'Show available commands',
    usage: '/help',
    aliases: ['h', '?'],
  },
  exit: {
    description: 'Exit the REPL',
    usage: '/exit',
    aliases: ['quit', 'q'],
  },
} as const;

export type ReplCommandName = keyof typeof REPL_COMMANDS;

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/**
 * Parse a slash command from input
 */
export function parseSlashCommand(input: string): SlashCommand {
  const trimmed = input.trim();
  const parts = trimmed.slice(1).split(/\s+/);

  return {
    name: parts[0]?.toLowerCase() || '',
    args: parts.slice(1),
    raw: input,
  };
}

/**
 * Resolve command aliases to canonical command names
 */
export function resolveCommandAlias(name: string): ReplCommandName | null {
  // Check direct match
  if (name in REPL_COMMANDS) {
    return name as ReplCommandName;
  }

  // Check aliases
  for (const [cmdName, cmdDef] of Object.entries(REPL_COMMANDS)) {
    if ((cmdDef.aliases as readonly string[]).includes(name)) {
      return cmdName as ReplCommandName;
    }
  }

  return null;
}

/**
 * Parse user input into structured format
 */
export function parseInput(input: string): ParsedInput {
  const trimmed = input.trim();

  if (!trimmed) {
    return { type: 'empty' };
  }

  if (isSlashCommand(trimmed)) {
    return {
      type: 'slash-command',
      command: parseSlashCommand(trimmed),
    };
  }

  return {
    type: 'natural-language',
    text: trimmed,
  };
}

/**
 * Format help text for all commands
 */
export function formatHelpText(): string {
  const lines: string[] = [
    'Available commands:',
    '',
  ];

  for (const [name, def] of Object.entries(REPL_COMMANDS)) {
    const aliases = def.aliases.length > 0
      ? ` (aliases: ${def.aliases.map(a => '/' + a).join(', ')})`
      : '';
    lines.push(`  ${def.usage}${aliases}`);
    lines.push(`    ${def.description}`);
    lines.push('');
  }

  lines.push('Or just type naturally to chat with the AI.');

  return lines.join('\n');
}
