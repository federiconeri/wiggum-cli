import { describe, it, expect } from 'vitest';
import {
  parseInput,
  resolveCommandAlias,
  isSlashCommand,
  formatHelpText,
  parseSlashCommand,
  REPL_COMMANDS,
} from './command-parser.js';

describe('isSlashCommand', () => {
  it('returns true for input starting with /', () => {
    expect(isSlashCommand('/help')).toBe(true);
    expect(isSlashCommand('/init')).toBe(true);
  });

  it('returns true for input with leading whitespace', () => {
    expect(isSlashCommand('  /help')).toBe(true);
  });

  it('returns false for non-slash input', () => {
    expect(isSlashCommand('hello')).toBe(false);
    expect(isSlashCommand('help me')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isSlashCommand('')).toBe(false);
    expect(isSlashCommand('  ')).toBe(false);
  });
});

describe('parseSlashCommand', () => {
  it('parses command name', () => {
    const cmd = parseSlashCommand('/help');
    expect(cmd.name).toBe('help');
    expect(cmd.args).toEqual([]);
  });

  it('parses command with args', () => {
    const cmd = parseSlashCommand('/new my-feature');
    expect(cmd.name).toBe('new');
    expect(cmd.args).toEqual(['my-feature']);
  });

  it('parses command with multiple args', () => {
    const cmd = parseSlashCommand('/config set tavily abc123');
    expect(cmd.name).toBe('config');
    expect(cmd.args).toEqual(['set', 'tavily', 'abc123']);
  });

  it('preserves raw input', () => {
    const raw = '/new my-feature';
    const cmd = parseSlashCommand(raw);
    expect(cmd.raw).toBe(raw);
  });

  it('lowercases command name', () => {
    const cmd = parseSlashCommand('/HELP');
    expect(cmd.name).toBe('help');
  });
});

describe('parseInput', () => {
  it('returns empty for empty input', () => {
    expect(parseInput('')).toEqual({ type: 'empty' });
    expect(parseInput('   ')).toEqual({ type: 'empty' });
  });

  it('returns slash-command for /commands', () => {
    const result = parseInput('/help');
    expect(result.type).toBe('slash-command');
    expect(result.command).toBeDefined();
    expect(result.command!.name).toBe('help');
  });

  it('returns natural-language for non-slash input', () => {
    const result = parseInput('tell me about this project');
    expect(result.type).toBe('natural-language');
    expect(result.text).toBe('tell me about this project');
  });

  it('trims whitespace from natural-language input', () => {
    const result = parseInput('  hello world  ');
    expect(result.type).toBe('natural-language');
    expect(result.text).toBe('hello world');
  });
});

describe('resolveCommandAlias', () => {
  it('resolves direct command names', () => {
    expect(resolveCommandAlias('help')).toBe('help');
    expect(resolveCommandAlias('init')).toBe('init');
    expect(resolveCommandAlias('new')).toBe('new');
    expect(resolveCommandAlias('exit')).toBe('exit');
  });

  it('resolves aliases', () => {
    expect(resolveCommandAlias('h')).toBe('help');
    expect(resolveCommandAlias('?')).toBe('help');
    expect(resolveCommandAlias('i')).toBe('init');
    expect(resolveCommandAlias('n')).toBe('new');
    expect(resolveCommandAlias('q')).toBe('exit');
    expect(resolveCommandAlias('quit')).toBe('exit');
    expect(resolveCommandAlias('s')).toBe('sync');
    expect(resolveCommandAlias('r')).toBe('run');
    expect(resolveCommandAlias('m')).toBe('monitor');
    expect(resolveCommandAlias('cfg')).toBe('config');
  });

  it('returns null for unknown commands', () => {
    expect(resolveCommandAlias('unknown')).toBeNull();
    expect(resolveCommandAlias('foo')).toBeNull();
    expect(resolveCommandAlias('')).toBeNull();
  });
});

describe('formatHelpText', () => {
  it('includes header', () => {
    const help = formatHelpText();
    expect(help).toContain('Available commands');
  });

  it('includes all commands', () => {
    const help = formatHelpText();
    for (const name of Object.keys(REPL_COMMANDS)) {
      expect(help).toContain(name);
    }
  });

  it('includes aliases', () => {
    const help = formatHelpText();
    expect(help).toContain('/h');
    expect(help).toContain('/n');
    expect(help).toContain('/q');
  });

  it('includes usage examples', () => {
    const help = formatHelpText();
    expect(help).toContain('/new <feature-name>');
    expect(help).toContain('/run <feature-name>');
  });
});
