/**
 * State and Command Parsing Module
 * Shared utilities for session state and slash command parsing
 * (Originally REPL module, now used by TUI)
 */

export {
  type SessionState,
  createSessionState,
  updateSessionState,
} from './session-state.js';
export {
  type SlashCommand,
  type ParsedInput,
  type InputType,
  type ReplCommandName,
  parseInput,
  parseSlashCommand,
  isSlashCommand,
  resolveCommandAlias,
  formatHelpText,
  REPL_COMMANDS,
} from './command-parser.js';
