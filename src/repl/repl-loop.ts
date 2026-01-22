/**
 * REPL Loop
 * Main interactive loop for the Wiggum CLI
 */

import readline from 'node:readline';
import pc from 'picocolors';
import { logger } from '../utils/logger.js';
import { simpson } from '../utils/colors.js';
import { runCommand } from '../commands/run.js';
import { monitorCommand } from '../commands/monitor.js';
import { runInitWorkflow } from '../commands/init.js';
import { hasConfig } from '../utils/config.js';
import type { SessionState } from './session-state.js';
import { updateSessionState } from './session-state.js';
import {
  parseInput,
  resolveCommandAlias,
  formatHelpText,
  type ReplCommandName,
} from './command-parser.js';

const PROMPT = `${simpson.yellow('wiggum')}${simpson.brown('>')} `;

/**
 * Clear any buffered stdin data
 * Prevents leaked input after subcommands that use their own stdin handling
 */
async function clearStdinBuffer(): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      // Set raw mode temporarily to drain buffer
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.once('readable', () => {
        // Drain any buffered data
        while (process.stdin.read() !== null) {
          // discard
        }
        process.stdin.setRawMode(wasRaw);
        resolve();
      });
      // Trigger readable if nothing buffered
      setTimeout(resolve, 10);
    } else {
      resolve();
    }
  });
}

/**
 * Handler for the /init command
 */
async function handleInitCommand(
  _args: string[],
  state: SessionState,
  rl: readline.Interface
): Promise<SessionState> {
  // Check if already initialized
  if (state.initialized && hasConfig(state.projectRoot)) {
    logger.warn('Project is already initialized. Re-running init will update configuration.');
    console.log('');
  }

  // Close REPL readline to avoid conflicts with subcommand's stdin usage
  // We'll signal to recreate it after the command completes
  rl.close();

  try {
    const result = await runInitWorkflow(state.projectRoot, {
      yes: false, // Always interactive in REPL
    });

    if (result) {
      // Update state with init result
      return updateSessionState(state, {
        provider: result.provider,
        model: result.model,
        scanResult: result.scanResult,
        config: result.config,
        initialized: true,
      });
    }

    // User cancelled
    return state;
  } catch (error) {
    logger.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
    return state;
  }
}

/**
 * Handler for the /new command
 * Always uses AI interview mode in REPL (falls back to template if no API key)
 */
async function handleNewCommand(
  args: string[],
  state: SessionState,
  rl: readline.Interface
): Promise<SessionState> {
  // Check if initialized
  if (!state.initialized && !hasConfig(state.projectRoot)) {
    logger.warn('Project not initialized. Run /init first.');
    return state;
  }

  if (args.length === 0) {
    logger.error('Feature name required. Usage: /new <feature-name>');
    return state;
  }

  const featureName = args[0];

  // Close REPL readline to avoid stdin conflicts with subcommand prompts
  rl.close();

  try {
    // Delegate to the existing new command behavior
    // Always use AI mode in REPL (the command handles fallback to template if no API key)
    const { newCommand } = await import('../commands/new.js');
    await newCommand(featureName, {
      yes: false,
      scanResult: state.scanResult,
      provider: state.provider ?? undefined,
      model: state.model,
      ai: true, // Always use AI interview in REPL
    });
  } catch (error) {
    logger.error(`New command failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return state;
}

/**
 * Handler for the /run command
 */
async function handleRunCommand(
  args: string[],
  state: SessionState,
  rl: readline.Interface
): Promise<SessionState> {
  // Check if initialized
  if (!state.initialized && !hasConfig(state.projectRoot)) {
    logger.warn('Project not initialized. Run /init first.');
    return state;
  }

  if (args.length === 0) {
    logger.error('Feature name required. Usage: /run <feature-name>');
    return state;
  }

  const featureName = args[0];

  // Close REPL readline to avoid stdin conflicts with subcommand
  rl.close();

  try {
    await runCommand(featureName, {});
  } catch (error) {
    logger.error(`Run command failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return state;
}

/**
 * Handler for the /monitor command
 */
async function handleMonitorCommand(
  args: string[],
  state: SessionState,
  rl: readline.Interface
): Promise<SessionState> {
  if (args.length === 0) {
    logger.error('Feature name required. Usage: /monitor <feature-name>');
    return state;
  }

  const featureName = args[0];

  // Close REPL readline to avoid stdin conflicts with subcommand
  rl.close();

  try {
    await monitorCommand(featureName, {});
  } catch (error) {
    logger.error(`Monitor command failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return state;
}

/**
 * Handler for the /help command
 */
function handleHelpCommand(): void {
  console.log('');
  console.log(formatHelpText());
  console.log('');
}

/**
 * Execute a REPL command
 */
async function executeCommand(
  commandName: ReplCommandName,
  args: string[],
  state: SessionState,
  rl: readline.Interface
): Promise<{ state: SessionState; shouldExit: boolean; needsRlRecreate: boolean }> {
  switch (commandName) {
    case 'init':
      // Init closes the readline to avoid stdin conflicts
      return { state: await handleInitCommand(args, state, rl), shouldExit: false, needsRlRecreate: true };

    case 'new':
      return { state: await handleNewCommand(args, state, rl), shouldExit: false, needsRlRecreate: true };

    case 'run':
      return { state: await handleRunCommand(args, state, rl), shouldExit: false, needsRlRecreate: true };

    case 'monitor':
      return { state: await handleMonitorCommand(args, state, rl), shouldExit: false, needsRlRecreate: true };

    case 'help':
      handleHelpCommand();
      return { state, shouldExit: false, needsRlRecreate: false };

    case 'exit':
      return { state, shouldExit: true, needsRlRecreate: false };

    default:
      logger.warn(`Unknown command: ${commandName}`);
      return { state, shouldExit: false, needsRlRecreate: false };
  }
}

/**
 * Handle natural language input
 * For now, just shows a message. Will be enhanced in Phase 3.
 */
async function handleNaturalLanguage(
  text: string,
  state: SessionState
): Promise<SessionState> {
  if (state.conversationMode) {
    // In conversation mode, pass to the conversation handler
    // This will be implemented in Phase 3
    console.log(pc.dim('(Conversation mode not yet implemented)'));
  } else {
    console.log('');
    console.log(pc.dim('Tip: Use /help to see available commands, or /new <feature> to create a spec.'));
    console.log('');
  }

  return state;
}

/**
 * Process a single line of input
 */
async function processInput(
  input: string,
  state: SessionState,
  rl: readline.Interface
): Promise<{ state: SessionState; shouldExit: boolean; needsRlRecreate: boolean }> {
  const parsed = parseInput(input);

  switch (parsed.type) {
    case 'empty':
      return { state, shouldExit: false, needsRlRecreate: false };

    case 'slash-command': {
      const { command } = parsed;
      if (!command) {
        return { state, shouldExit: false, needsRlRecreate: false };
      }

      const resolvedName = resolveCommandAlias(command.name);
      if (!resolvedName) {
        logger.warn(`Unknown command: /${command.name}. Type /help for available commands.`);
        return { state, shouldExit: false, needsRlRecreate: false };
      }

      return executeCommand(resolvedName, command.args, state, rl);
    }

    case 'natural-language': {
      const newState = await handleNaturalLanguage(parsed.text!, state);
      return { state: newState, shouldExit: false, needsRlRecreate: false };
    }

    default:
      return { state, shouldExit: false, needsRlRecreate: false };
  }
}

/**
 * Create a new readline interface
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
  });
}

/**
 * Read a single line from readline
 */
function readLine(rl: readline.Interface): Promise<string | null> {
  return new Promise((resolve) => {
    rl.once('line', (line) => resolve(line));
    rl.once('close', () => resolve(null));
    rl.once('SIGINT', () => {
      console.log('');
      logger.info('Use /exit to quit');
      rl.prompt();
    });
  });
}

/**
 * Start the REPL loop
 */
export async function startRepl(initialState: SessionState): Promise<void> {
  let state = initialState;

  console.log('');
  console.log(simpson.yellow('Wiggum Interactive Mode'));

  // Show context-aware welcome message
  if (!state.initialized && !hasConfig(state.projectRoot)) {
    console.log(pc.dim('Not initialized. Run /init to set up this project.'));
  } else {
    console.log(pc.dim('Type /help for commands, /exit to quit'));
  }
  console.log('');

  let rl = createReadline();
  let running = true;

  while (running) {
    rl.prompt();
    const line = await readLine(rl);

    // Handle EOF (Ctrl+D)
    if (line === null) {
      console.log('');
      logger.info('Goodbye!');
      running = false;
      break;
    }

    try {
      const result = await processInput(line, state, rl);
      state = result.state;

      if (result.shouldExit) {
        console.log('');
        logger.info('Goodbye!');
        rl.close();
        running = false;
        break;
      }

      // Recreate readline if needed (after commands that closed it)
      if (result.needsRlRecreate) {
        rl = createReadline();
      }
    } catch (error) {
      logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Export for testing
 */
export { processInput, executeCommand };
