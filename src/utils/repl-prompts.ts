/**
 * REPL-Friendly Prompts
 * Simple prompts using readline that work properly in REPL context
 * (Clack prompts conflict with REPL readline management)
 */

import readline from 'node:readline';
import pc from 'picocolors';
import { simpson } from './colors.js';

export interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Simple select prompt for REPL
 */
export async function select<T>(options: {
  message: string;
  options: SelectOption<T>[];
}): Promise<T | null> {
  const { message, options: choices } = options;

  console.log('');
  console.log(`${simpson.yellow('?')} ${message}`);
  console.log('');

  choices.forEach((choice, index) => {
    const hint = choice.hint ? pc.dim(` (${choice.hint})`) : '';
    console.log(`  ${pc.cyan(`${index + 1})`)} ${choice.label}${hint}`);
  });

  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${pc.dim('Enter number (1-' + choices.length + '):')} `, (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (num >= 1 && num <= choices.length) {
        const selected = choices[num - 1];
        console.log(`${pc.green('✓')} Selected: ${selected.label}`);
        resolve(selected.value);
      } else {
        console.log(pc.red('Invalid selection'));
        resolve(null);
      }
    });

    rl.on('SIGINT', () => {
      rl.close();
      resolve(null);
    });
  });
}

/**
 * Simple password prompt for REPL
 * Masks input with asterisks
 */
export async function password(options: {
  message: string;
}): Promise<string | null> {
  const { message } = options;

  console.log('');
  console.log(`${simpson.yellow('?')} ${message}`);

  return new Promise((resolve) => {
    let input = '';

    // Show initial cursor position
    process.stdout.write(`${pc.dim('>')} `);

    const onData = (char: string) => {
      // Ctrl+C
      if (char === '\u0003') {
        cleanup();
        console.log('');
        resolve(null);
        return;
      }

      // Enter
      if (char === '\r' || char === '\n') {
        cleanup();
        // Clear the line and show fixed mask
        process.stdout.write('\r' + pc.dim('>') + ' ' + '*'.repeat(32) + '\n');
        console.log(`${pc.green('✓')} API key entered`);
        resolve(input.trim() || null);
        return;
      }

      // Backspace
      if (char === '\u007F' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          // Clear and rewrite asterisks
          process.stdout.write('\r' + pc.dim('>') + ' ' + '*'.repeat(input.length) + ' \b');
        }
        return;
      }

      // Regular character
      if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
        input += char;
        process.stdout.write('*');
      }
    };

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

/**
 * Simple confirm prompt for REPL
 */
export async function confirm(options: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean | null> {
  const { message, initialValue = true } = options;

  console.log('');
  const defaultHint = initialValue ? 'Y/n' : 'y/N';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${simpson.yellow('?')} ${message} ${pc.dim(`(${defaultHint}):`)} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === '') {
        console.log(`${pc.green('✓')} ${initialValue ? 'Yes' : 'No'}`);
        resolve(initialValue);
      } else if (trimmed === 'y' || trimmed === 'yes') {
        console.log(`${pc.green('✓')} Yes`);
        resolve(true);
      } else if (trimmed === 'n' || trimmed === 'no') {
        console.log(`${pc.green('✓')} No`);
        resolve(false);
      } else {
        console.log(pc.red('Invalid input, using default'));
        resolve(initialValue);
      }
    });

    rl.on('SIGINT', () => {
      rl.close();
      resolve(null);
    });
  });
}

/**
 * Check if user cancelled (similar to clack's isCancel)
 */
export function isCancel(value: unknown): value is null {
  return value === null;
}

/**
 * Multi-line input for paste support
 * Reads input until an empty line (after content) or Ctrl+D
 *
 * @param prompt - The prompt to display
 * @returns The collected input or null if cancelled
 */
export async function multilineInput(options: {
  prompt?: string;
  /** Hint to show for how to end input */
  endHint?: string;
}): Promise<string | null> {
  const { prompt = '>', endHint = 'Press Enter twice when done' } = options;

  console.log(pc.dim(`  (${endHint})`));

  return new Promise((resolve) => {
    const lines: string[] = [];
    let lastLineEmpty = false;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${pc.dim(prompt)} `,
    });

    rl.prompt();

    rl.on('line', (line) => {
      const trimmed = line.trim();

      // If we get an empty line after having content, we're done
      if (trimmed === '' && lines.length > 0 && lastLineEmpty) {
        rl.close();
        // Remove the trailing empty line we added
        const result = lines.slice(0, -1).join('\n').trim();
        if (result) {
          console.log(pc.green('✓') + pc.dim(` Received ${result.split('\n').length} line(s)`));
        }
        resolve(result || null);
        return;
      }

      lastLineEmpty = trimmed === '';
      lines.push(line);
      rl.prompt();
    });

    rl.on('close', () => {
      // Ctrl+D or EOF
      const result = lines.join('\n').trim();
      if (result) {
        console.log(pc.green('✓') + pc.dim(` Received ${result.split('\n').length} line(s)`));
      }
      resolve(result || null);
    });

    rl.on('SIGINT', () => {
      rl.close();
      console.log('');
      resolve(null);
    });
  });
}

/**
 * Simple text input prompt
 *
 * @param prompt - The prompt to display
 * @returns The input text or null if cancelled
 */
export async function textInput(options: {
  message: string;
  placeholder?: string;
}): Promise<string | null> {
  const { message, placeholder } = options;

  const hint = placeholder ? pc.dim(` (${placeholder})`) : '';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${simpson.yellow('?')} ${message}${hint}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed) {
        resolve(trimmed);
      } else {
        resolve(null);
      }
    });

    rl.on('SIGINT', () => {
      rl.close();
      console.log('');
      resolve(null);
    });
  });
}
