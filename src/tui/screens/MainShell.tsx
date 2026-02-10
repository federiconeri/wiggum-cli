/**
 * MainShell - Ink-based REPL replacement
 *
 * The main interactive shell for Wiggum CLI, replacing the readline REPL.
 * Handles slash commands and provides navigation to other screens.
 * Wrapped in AppShell for fixed-position layout.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { MessageList, type Message } from '../components/MessageList.js';
import { ChatInput } from '../components/ChatInput.js';
import { ActionOutput } from '../components/ActionOutput.js';
import { AppShell } from '../components/AppShell.js';
import { colors, theme } from '../theme.js';
import { loadContext, getContextAge } from '../../context/index.js';
import {
  parseInput,
  resolveCommandAlias,
  formatHelpText,
  type ReplCommandName,
} from '../../repl/command-parser.js';
import type { SessionState } from '../../repl/session-state.js';
import { readLoopStatus } from '../utils/loop-status.js';
import { useSync } from '../hooks/useSync.js';
import type { BackgroundRun } from '../hooks/useBackgroundRuns.js';
import path from 'node:path';

/**
 * Navigation targets for the shell
 */
export type NavigationTarget = 'shell' | 'interview' | 'init' | 'run';

/**
 * Navigation props passed to target screens
 */
export interface NavigationProps {
  featureName?: string;
  monitorOnly?: boolean;
  [key: string]: unknown;
}

/**
 * Props for MainShell component
 */
export interface MainShellProps {
  /** Pre-built header element from App */
  header: React.ReactNode;
  /** Current session state */
  sessionState: SessionState;
  /** Called when navigating to another screen */
  onNavigate: (target: NavigationTarget, props?: NavigationProps) => void;
  /** Called when session state changes */
  onSessionStateChange?: (state: SessionState) => void;
  /** Active background runs */
  backgroundRuns?: BackgroundRun[];
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
 */
export function MainShell({
  header,
  sessionState,
  onNavigate,
  backgroundRuns,
}: MainShellProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [contextAge, setContextAge] = useState<string | null>(null);

  // Sync hook
  const { status: syncStatus, error: syncError, sync } = useSync();

  const addSystemMessage = useCallback((content: string) => {
    const message: Message = {
      id: generateId(),
      role: 'system',
      content,
    };
    setMessages((prev) => [...prev, message]);
  }, []);

  // Load persisted context age (initially and after sync)
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (!sessionState.initialized) {
        setContextAge(null);
        return;
      }

      try {
        const persisted = await loadContext(sessionState.projectRoot);
        if (cancelled) return;
        if (persisted) {
          const { human } = getContextAge(persisted);
          setContextAge(human);
        } else {
          setContextAge(null);
        }
      } catch {
        if (!cancelled) {
          setContextAge(null);
        }
      }
    };

    refresh();

    return () => {
      cancelled = true;
    };
  }, [sessionState.projectRoot, sessionState.initialized, syncStatus]);

  const projectLabel = useMemo(
    () => path.basename(sessionState.projectRoot),
    [sessionState.projectRoot],
  );

  const handleHelp = useCallback(() => {
    addSystemMessage(formatHelpText());
  }, [addSystemMessage]);

  const handleInit = useCallback(() => {
    onNavigate('init');
  }, [onNavigate]);

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

  const handleMonitor = useCallback((args: string[]) => {
    if (args.length === 0) {
      addSystemMessage('Feature name required. Usage: /monitor <feature-name>');
      return;
    }

    const featureName = args[0]!;

    // Check if it's a tracked background run
    const bgRun = backgroundRuns?.find((r) => r.featureName === featureName);
    if (bgRun) {
      onNavigate('run', { featureName, monitorOnly: true });
      return;
    }

    // Check if the process is running even if not tracked
    const status = readLoopStatus(featureName);
    if (status.running) {
      onNavigate('run', { featureName, monitorOnly: true });
      return;
    }

    addSystemMessage(`No running loop found for "${featureName}".`);
  }, [addSystemMessage, backgroundRuns, onNavigate]);

  const handleConfig = useCallback((args: string[]) => {
    if (args.length === 0) {
      addSystemMessage('Config management - not yet implemented in TUI mode. Use CLI: wiggum config');
    } else {
      addSystemMessage(`Config: ${args.join(' ')} - not yet implemented in TUI mode.`);
    }
  }, [addSystemMessage]);

  const handleExit = useCallback(() => {
    addSystemMessage('Goodbye!');
    setTimeout(() => {
      exit();
    }, 100);
  }, [addSystemMessage, exit]);

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

  const handleNaturalLanguage = useCallback((_text: string) => {
    addSystemMessage('Tip: Use /help to see available commands, or /new <feature> to create a spec.');
  }, [addSystemMessage]);

  const handleSubmit = useCallback((value: string) => {
    const parsed = parseInput(value);

    switch (parsed.type) {
      case 'empty':
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

  // Build tips text
  const tips = sessionState.initialized
    ? 'Tip: /new <feature> to create spec, /help for commands'
    : 'Tip: /init to set up, /help for commands';

  const inputElement = (
    <ChatInput
      onSubmit={handleSubmit}
      disabled={false}
      placeholder="Enter command or type /help..."
      onCommand={(cmd) => handleSubmit(`/${cmd}`)}
    />
  );

  return (
    <AppShell
      header={header}
      tips={tips}
      isWorking={syncStatus === 'running'}
      workingStatus={syncStatus === 'running' ? 'Syncing project context\u2026' : undefined}
      input={inputElement}
      footerStatus={{
        action: projectLabel || 'Main Shell',
        phase: sessionState.provider ? `${sessionState.provider}/${sessionState.model}` : 'No provider',
        path: sessionState.initialized
          ? contextAge
            ? `Context: cached ${contextAge}`
            : 'Context: none \u2014 /sync'
          : 'Not initialized \u2014 /init',
      }}
    >
      {/* Message history */}
      {messages.length > 0 && (
        <Box marginY={1} flexDirection="column">
          <MessageList messages={messages} />
        </Box>
      )}

      {/* Sync UI (non-spinner parts) */}
      {syncStatus !== 'idle' && (
        <Box marginY={1} flexDirection="column" gap={1}>
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
                ? 'Scanning + AI analysis\u2026'
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
                  <Text color={colors.green}>{theme.chars.prompt}</Text>
                  <Text color={colors.blue}>/new {'<feature>'}</Text>
                  <Text dimColor>Create a feature specification</Text>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </AppShell>
  );
}
