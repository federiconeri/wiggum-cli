/**
 * MainShell - Ink-based REPL replacement
 *
 * The main interactive shell for Wiggum CLI, replacing the readline REPL.
 * Handles slash commands and provides navigation to other screens.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { MessageList, type Message } from '../components/MessageList.js';
import { ChatInput } from '../components/ChatInput.js';
import { WorkingIndicator } from '../components/WorkingIndicator.js';
import { ActionOutput } from '../components/ActionOutput.js';
import { colors, theme } from '../theme.js';
import {
  parseInput,
  resolveCommandAlias,
  formatHelpText,
  type ReplCommandName,
} from '../../repl/command-parser.js';
import type { SessionState } from '../../repl/session-state.js';
import { useSync } from '../hooks/useSync.js';

/**
 * Navigation targets for the shell
 */
export type NavigationTarget = 'welcome' | 'shell' | 'interview' | 'init' | 'run';

/**
 * Navigation props passed to target screens
 */
export interface NavigationProps {
  featureName?: string;
  [key: string]: unknown;
}

/**
 * Props for MainShell component
 */
export interface MainShellProps {
  /** Current session state */
  sessionState: SessionState;
  /** Called when navigating to another screen */
  onNavigate: (target: NavigationTarget, props?: NavigationProps) => void;
  /** Called when session state changes */
  onSessionStateChange?: (state: SessionState) => void;
}

/**
 * Generate a unique ID for messages
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * MainShell component
 *
 * The main interactive shell that handles slash commands and navigation.
 * Replaces the readline-based REPL with an Ink-powered TUI.
 *
 * @example
 * ```tsx
 * <MainShell
 *   sessionState={state}
 *   onNavigate={(target, props) => setScreen(target, props)}
 * />
 * ```
 */
export function MainShell({
  sessionState,
  onNavigate,
}: MainShellProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);

  // Sync hook
  const { status: syncStatus, error: syncError, sync } = useSync();

  /**
   * Add a system message to the conversation
   */
  const addSystemMessage = useCallback((content: string) => {
    const message: Message = {
      id: generateId(),
      role: 'system',
      content,
    };
    setMessages((prev) => [...prev, message]);
  }, []);

  /**
   * Handle /help command
   */
  const handleHelp = useCallback(() => {
    addSystemMessage(formatHelpText());
  }, [addSystemMessage]);

  /**
   * Handle /init command
   */
  const handleInit = useCallback(() => {
    // Navigate to init screen
    onNavigate('init');
  }, [onNavigate]);

  /**
   * Handle /new command
   */
  const handleNew = useCallback((args: string[]) => {
    if (args.length === 0) {
      addSystemMessage('Feature name required. Usage: /new <feature-name>');
      return;
    }

    if (!sessionState.initialized) {
      addSystemMessage('Project not initialized. Run /init first.');
      return;
    }

    const featureName = args[0];
    onNavigate('interview', { featureName });
  }, [sessionState.initialized, onNavigate, addSystemMessage]);

  /**
   * Handle /run command
   */
  const handleRun = useCallback((args: string[]) => {
    if (args.length === 0) {
      addSystemMessage('Feature name required. Usage: /run <feature-name>');
      return;
    }

    if (!sessionState.initialized) {
      addSystemMessage('Project not initialized. Run /init first.');
      return;
    }

    const featureName = args[0];
    onNavigate('run', { featureName });
  }, [sessionState.initialized, addSystemMessage, onNavigate]);

  /**
   * Handle /monitor command
   */
  const handleMonitor = useCallback((args: string[]) => {
    if (args.length === 0) {
      addSystemMessage('Feature name required. Usage: /monitor <feature-name>');
      return;
    }

    // TODO: Implement monitor screen navigation
    addSystemMessage(`Monitor command for "${args[0]}" - not yet implemented in TUI mode.`);
  }, [addSystemMessage]);

  /**
   * Handle /config command
   */
  const handleConfig = useCallback((args: string[]) => {
    // TODO: Implement config screen or inline config
    if (args.length === 0) {
      addSystemMessage('Config management - not yet implemented in TUI mode. Use CLI: wiggum config');
    } else {
      addSystemMessage(`Config: ${args.join(' ')} - not yet implemented in TUI mode.`);
    }
  }, [addSystemMessage]);

  /**
   * Handle /exit command
   */
  const handleExit = useCallback(() => {
    addSystemMessage('Goodbye!');
    // Small delay to show message before exit
    setTimeout(() => {
      exit();
    }, 100);
  }, [addSystemMessage, exit]);

  /**
   * Handle /sync command
   */
  const handleSync = useCallback(() => {
    if (!sessionState.initialized) {
      addSystemMessage('Project not initialized. Run /init first.');
      return;
    }
    if (!sessionState.provider) {
      addSystemMessage('No AI provider configured. Run /init first.');
      return;
    }
    if (syncStatus === 'running') {
      addSystemMessage('Sync already in progress.');
      return;
    }
    sync(sessionState.projectRoot, sessionState.provider, sessionState.model);
  }, [sessionState, syncStatus, addSystemMessage, sync]);

  /**
   * Execute a slash command
   */
  const executeCommand = useCallback((commandName: ReplCommandName, args: string[]) => {
    switch (commandName) {
      case 'help':
        handleHelp();
        break;
      case 'init':
        handleInit();
        break;
      case 'sync':
        handleSync();
        break;
      case 'new':
        handleNew(args);
        break;
      case 'run':
        handleRun(args);
        break;
      case 'monitor':
        handleMonitor(args);
        break;
      case 'config':
        handleConfig(args);
        break;
      case 'exit':
        handleExit();
        break;
      default:
        addSystemMessage(`Unknown command: ${commandName}`);
    }
  }, [handleHelp, handleInit, handleSync, handleNew, handleRun, handleMonitor, handleConfig, handleExit, addSystemMessage]);

  /**
   * Handle natural language input
   */
  const handleNaturalLanguage = useCallback((_text: string) => {
    // For now, just show a tip (text parameter reserved for future AI chat)
    addSystemMessage('Tip: Use /help to see available commands, or /new <feature> to create a spec.');
  }, [addSystemMessage]);

  /**
   * Handle user input submission
   */
  const handleSubmit = useCallback((value: string) => {
    const parsed = parseInput(value);

    switch (parsed.type) {
      case 'empty':
        // Ignore empty input
        break;

      case 'slash-command': {
        const { command } = parsed;
        if (!command) break;

        const resolvedName = resolveCommandAlias(command.name);
        if (!resolvedName) {
          addSystemMessage(`Unknown command: /${command.name}. Type /help for available commands.`);
          break;
        }

        executeCommand(resolvedName, command.args);
        break;
      }

      case 'natural-language': {
        handleNaturalLanguage(parsed.text!);
        break;
      }
    }
  }, [executeCommand, handleNaturalLanguage, addSystemMessage]);

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      addSystemMessage('Use /exit to quit');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={colors.yellow} bold>Wiggum Interactive Mode</Text>
        <Text dimColor> │ </Text>
        {sessionState.initialized ? (
          <Text color={colors.green}>Ready</Text>
        ) : (
          <Text color={colors.orange}>Not initialized - run /init</Text>
        )}
      </Box>

      {/* Status bar */}
      <Box marginBottom={1}>
        <Text dimColor>
          {sessionState.provider ? `${sessionState.provider}/${sessionState.model}` : 'No provider configured'}
        </Text>
        <Text dimColor> │ Type /help for commands</Text>
      </Box>

      {/* Message history */}
      {messages.length > 0 && (
        <Box marginY={1} flexDirection="column">
          <MessageList messages={messages} />
        </Box>
      )}

      {/* Sync UI */}
      {syncStatus !== 'idle' && (
        <Box marginY={1} flexDirection="column" gap={1}>
          {syncStatus === 'running' && (
            <WorkingIndicator
              state={{
                isWorking: true,
                status: 'Syncing project context…',
              }}
            />
          )}

          <ActionOutput
            actionName="Sync"
            description="Project context"
            status={
              syncStatus === 'running'
                ? 'running'
                : syncStatus === 'success'
                  ? 'success'
                  : 'error'
            }
            output={
              syncStatus === 'running'
                ? 'Scanning + AI analysis…'
                : syncStatus === 'success'
                  ? 'Updated .ralph/.context.json'
                  : undefined
            }
            error={syncStatus === 'error' ? (syncError?.message || 'Unknown error') : undefined}
            previewLines={2}
          />

          {syncStatus === 'success' && (
            <Box marginTop={1} flexDirection="column">
              <Box flexDirection="row">
                <Text color={colors.green}>{theme.chars.bullet} </Text>
                <Text>Done. Project context updated.</Text>
              </Box>
              <Box marginTop={1} flexDirection="column">
                <Text bold>What's next:</Text>
                <Box flexDirection="row" gap={1}>
                  <Text color={colors.green}>›</Text>
                  <Text color={colors.blue}>/new {'<feature>'}</Text>
                  <Text dimColor>Create a feature specification</Text>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Input */}
      <Box marginTop={1}>
        <ChatInput
          onSubmit={handleSubmit}
          disabled={false}
          placeholder="Enter command or type /help..."
          onCommand={(cmd) => handleSubmit(`/${cmd}`)}
        />
      </Box>
    </Box>
  );
}
