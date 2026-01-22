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

  // Pause REPL readline to avoid conflicts with subcommand's stdin usage
  rl.pause();

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
  } finally {
    // Resume REPL readline after subcommand completes
    rl.resume();
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

  // Pause REPL readline to avoid conflicts with subcommand's stdin usage
  rl.pause();

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
  } finally {
    // Resume REPL readline after subcommand completes
    rl.resume();
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

  // Pause REPL readline to avoid conflicts with subcommand's stdin usage
  rl.pause();

  try {
    await runCommand(featureName, {});
  } finally {
    rl.resume();
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

  // Pause REPL readline to avoid conflicts with subcommand's stdin usage
  rl.pause();

  try {
    await monitorCommand(featureName, {});
  } finally {
    rl.resume();
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
): Promise<{ state: SessionState; shouldExit: boolean }> {
  switch (commandName) {
    case 'init':
      return { state: await handleInitCommand(args, state, rl), shouldExit: false };

    case 'new':
      return { state: await handleNewCommand(args, state, rl), shouldExit: false };

    case 'run':
      return { state: await handleRunCommand(args, state, rl), shouldExit: false };

    case 'monitor':
      return { state: await handleMonitorCommand(args, state, rl), shouldExit: false };

    case 'help':
      handleHelpCommand();
      return { state, shouldExit: false };

    case 'exit':
      return { state, shouldExit: true };

    default:
      logger.warn(`Unknown command: ${commandName}`);
      return { state, shouldExit: false };
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
): Promise<{ state: SessionState; shouldExit: boolean }> {
  const parsed = parseInput(input);

  switch (parsed.type) {
    case 'empty':
      return { state, shouldExit: false };

    case 'slash-command': {
      const { command } = parsed;
      if (!command) {
        return { state, shouldExit: false };
      }

      const resolvedName = resolveCommandAlias(command.name);
      if (!resolvedName) {
        logger.warn(`Unknown command: /${command.name}. Type /help for available commands.`);
        return { state, shouldExit: false };
      }

      return executeCommand(resolvedName, command.args, state, rl);
    }

    case 'natural-language': {
      const newState = await handleNaturalLanguage(parsed.text!, state);
      return { state: newState, shouldExit: false };
    }

    default:
      return { state, shouldExit: false };
  }
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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log('');
    logger.info('Use /exit to quit');
    rl.prompt();
  });

  // Handle Ctrl+D (EOF)
  rl.on('close', () => {
    console.log('');
    logger.info('Goodbye!');
    process.exit(0);
  });

  rl.prompt();

  for await (const line of rl) {
    try {
      const result = await processInput(line, state, rl);
      state = result.state;

      if (result.shouldExit) {
        console.log('');
        logger.info('Goodbye!');
        rl.close();
        return;
      }
    } catch (error) {
      logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    rl.prompt();
  }
}

/**
 * Export for testing
 */
export { processInput, executeCommand };
