/**
 * MainShell - Ink-based REPL replacement
 *
 * The main interactive shell for Wiggum CLI, replacing the readline REPL.
 * Handles slash commands and provides navigation to other screens.
 * Wrapped in AppShell for consistent layout.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { MessageList, type Message } from '../components/MessageList.js';
import { ChatInput } from '../components/ChatInput.js';
import { IssuePicker } from '../components/IssuePicker.js';
import type { Command } from '../components/CommandDropdown.js';
import { ActionOutput } from '../components/ActionOutput.js';
import { AppShell } from '../components/AppShell.js';
import { colors, theme, phase } from '../theme.js';
import { loadContext, getContextAge } from '../../context/index.js';
import { logger } from '../../utils/logger.js';
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
import {
  isGhInstalled,
  detectGitHubRemote,
  listRepoIssues,
  type GitHubIssueListItem,
  type GitHubRepo,
} from '../../utils/github.js';
import { clearScreen } from '../utils/clear-screen.js';
import path from 'node:path';

function slugifyIssueTitle(title: string, maxWords = 4): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-') || 'untitled';
}

/**
 * Navigation targets for the shell
 */
export type NavigationTarget = 'shell' | 'interview' | 'init' | 'run' | 'agent';

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
  /** Active background runs */
  backgroundRuns?: BackgroundRun[];
  /** Message to display when the shell first mounts (e.g. from init completion) */
  initialMessage?: string;
  /** File paths to display as dimmed lines below the initial message */
  initialFiles?: string[];
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
  initialMessage,
  initialFiles,
}: MainShellProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>(() => {
    const initial: Message[] = [];
    if (initialMessage) {
      initial.push({ id: generateId(), role: 'system' as const, content: initialMessage });
    }
    if (initialFiles && initialFiles.length > 0) {
      for (const file of initialFiles) {
        initial.push({ id: generateId(), role: 'system' as const, content: `  ${file}` });
      }
    }
    return initial;
  });
  const [contextAge, setContextAge] = useState<string | null>(null);

  // Sync hook
  const { status: syncStatus, error: syncError, sync } = useSync();

  // Issue picker state
  const [issuePickerVisible, setIssuePickerVisible] = useState(false);
  const [issuePickerIssues, setIssuePickerIssues] = useState<GitHubIssueListItem[]>([]);
  const [issuePickerLoading, setIssuePickerLoading] = useState(false);
  const [issuePickerError, setIssuePickerError] = useState<string | undefined>();
  const [issuePickerRepo, setIssuePickerRepo] = useState<GitHubRepo | null>(null);

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
      } catch (err) {
        logger.error(`Failed to load context: ${err instanceof Error ? err.message : String(err)}`);
        if (!cancelled) {
          setContextAge('load error');
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

    // Parse optional flags, separating them from positional args
    let reviewMode: string | undefined;
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--review-mode') {
        if (i + 1 < args.length) {
          reviewMode = args[i + 1];
          i++; // skip the value
        }
        continue;
      }
      positional.push(args[i]!);
    }

    if (reviewMode !== undefined && reviewMode !== 'manual' && reviewMode !== 'auto') {
      addSystemMessage(`Invalid --review-mode value '${reviewMode}'. Use 'manual' or 'auto'.`);
      return;
    }

    const featureName = positional[0];
    if (!featureName) {
      addSystemMessage('Feature name required. Usage: /run <feature-name> [--review-mode auto|manual]');
      return;
    }

    onNavigate('run', { featureName, reviewMode });
  }, [sessionState.initialized, addSystemMessage, onNavigate]);

  const handleMonitor = useCallback((args: string[]) => {
    if (args.length === 0) {
      addSystemMessage('Feature name required. Usage: /monitor <feature-name>');
      return;
    }

    const featureName = args[0]!;

    if (!/^[a-zA-Z0-9_-]+$/.test(featureName)) {
      addSystemMessage('Feature name must contain only letters, numbers, hyphens, and underscores.');
      return;
    }

    // Check if it's a tracked background run
    const bgRun = backgroundRuns?.find((r) => r.featureName === featureName);
    if (bgRun) {
      onNavigate('run', { featureName, monitorOnly: true });
      return;
    }

    // Check if the process is running even if not tracked
    try {
      const status = readLoopStatus(featureName);
      if (status.running) {
        onNavigate('run', { featureName, monitorOnly: true });
        return;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      addSystemMessage(`Could not check loop status for "${featureName}": ${reason}`);
      return;
    }

    addSystemMessage(`No running loop found for "${featureName}".`);
  }, [addSystemMessage, backgroundRuns, onNavigate]);

  const handleAgent = useCallback((args: string[]) => {
    if (!sessionState.initialized) {
      addSystemMessage('Project not initialized. Run /init first.');
      return;
    }

    // Parse optional flags
    let dryRun = false;
    let maxItems: number | undefined;
    let maxSteps: number | undefined;
    let reviewMode: string | undefined;
    let labels: string[] | undefined;
    let issues: number[] | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--dry-run') {
        dryRun = true;
      } else if (args[i] === '--max-items' && i + 1 < args.length) {
        maxItems = parseInt(args[i + 1]!, 10);
        if (Number.isNaN(maxItems) || maxItems < 1) {
          addSystemMessage(`Invalid --max-items value '${args[i + 1]}'. Must be a number.`);
          return;
        }
        i++;
      } else if (args[i] === '--max-steps' && i + 1 < args.length) {
        maxSteps = parseInt(args[i + 1]!, 10);
        if (Number.isNaN(maxSteps) || maxSteps < 1) {
          addSystemMessage(`Invalid --max-steps value '${args[i + 1]}'. Must be a number.`);
          return;
        }
        i++;
      } else if (args[i] === '--labels' && i + 1 < args.length) {
        labels = args[i + 1]!.split(',').map(l => l.trim()).filter(Boolean);
        if (labels.length === 0) {
          addSystemMessage(`Invalid --labels value '${args[i + 1]}'. Use comma-separated labels.`);
          return;
        }
        i++;
      } else if (args[i] === '--issues' && i + 1 < args.length) {
        const raw = args[i + 1]!;
        const parsed = raw.split(',').map((s) => {
          const n = parseInt(s.trim(), 10);
          return Number.isNaN(n) || n < 1 ? null : n;
        });
        if (parsed.some((n) => n == null)) {
          addSystemMessage(`Invalid --issues value '${raw}'. Use comma-separated issue numbers.`);
          return;
        }
        issues = parsed as number[];
        i++;
      } else if (args[i] === '--review-mode' && i + 1 < args.length) {
        reviewMode = args[i + 1];
        i++;
      } else if (args[i]?.startsWith('--')) {
        addSystemMessage(`Unknown flag '${args[i]}' for /agent.`);
        return;
      }
    }

    if (reviewMode !== undefined && !['manual', 'auto', 'merge'].includes(reviewMode)) {
      addSystemMessage(`Invalid --review-mode value '${reviewMode}'. Use 'manual', 'auto', or 'merge'.`);
      return;
    }

    onNavigate('agent', { dryRun, maxItems, maxSteps, reviewMode, labels, issues } as NavigationProps);
  }, [sessionState.initialized, addSystemMessage, onNavigate]);

  const handleIssueCommand = useCallback(async (searchQuery?: string) => {
    if (!sessionState.initialized) {
      addSystemMessage('Project not initialized. Run /init first.');
      return;
    }

    setIssuePickerVisible(true);
    setIssuePickerLoading(true);
    setIssuePickerError(undefined);

    try {
      const ghAvailable = await isGhInstalled();
      if (!ghAvailable) {
        setIssuePickerError('Install GitHub CLI (gh) for issue browsing');
        setIssuePickerLoading(false);
        return;
      }

      let repo = issuePickerRepo;
      if (!repo) {
        repo = await detectGitHubRemote(sessionState.projectRoot);
        if (!repo) {
          setIssuePickerError('No GitHub remote detected in this project');
          setIssuePickerLoading(false);
          return;
        }
        setIssuePickerRepo(repo);
      }

      const result = await listRepoIssues(repo.owner, repo.repo, searchQuery);
      if (result.error) {
        setIssuePickerError(result.error);
      }
      setIssuePickerIssues(result.issues);
    } catch (err) {
      setIssuePickerError(err instanceof Error ? err.message : String(err));
    } finally {
      setIssuePickerLoading(false);
    }
  }, [sessionState.initialized, sessionState.projectRoot, issuePickerRepo, addSystemMessage]);

  const handleIssueSelect = useCallback((issue: GitHubIssueListItem) => {
    clearScreen(stdout);
    setIssuePickerVisible(false);
    setIssuePickerIssues([]);

    const featureName = slugifyIssueTitle(issue.title);
    onNavigate('interview', {
      featureName,
      initialReferences: [`issue:${issue.number}`],
    });
  }, [stdout, onNavigate]);

  const handleIssueCancel = useCallback(() => {
    clearScreen(stdout);
    setIssuePickerVisible(false);
    setIssuePickerIssues([]);
    setIssuePickerError(undefined);
  }, [stdout]);

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
      case 'issue':
        handleIssueCommand(args.join(' ') || undefined);
        break;
      case 'agent':
        handleAgent(args);
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
  }, [handleHelp, handleInit, handleSync, handleNew, handleRun, handleMonitor, handleIssueCommand, handleAgent, handleConfig, handleExit, addSystemMessage]);

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
    ? 'Tip: /new <feature> or /issue to browse issues, /help for commands'
    : 'Tip: /init to set up, /help for commands';

  const specSuggestions: Command[] | undefined = useMemo(
    () => sessionState.specNames?.map((name) => ({ name, description: '' })),
    [sessionState.specNames],
  );

  const inputElement = (
    <Box flexDirection="column">
      <ChatInput
        onSubmit={handleSubmit}
        disabled={issuePickerVisible}
        placeholder="Enter command or type /help..."
        onCommand={(cmd) => handleSubmit(`/${cmd}`)}
        specSuggestions={specSuggestions}
      />
      {issuePickerVisible && (
        <IssuePicker
          issues={issuePickerIssues}
          repoSlug={issuePickerRepo ? `${issuePickerRepo.owner}/${issuePickerRepo.repo}` : '...'}
          onSelect={handleIssueSelect}
          onCancel={handleIssueCancel}
          isLoading={issuePickerLoading}
          error={issuePickerError}
        />
      )}
    </Box>
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
          ? contextAge === 'load error'
            ? 'Context: unavailable \u2014 /sync to refresh'
            : contextAge
              ? `Context: cached ${contextAge}`
              : 'Context: none \u2014 /sync'
          : 'Not initialized \u2014 /init',
      }}
    >
      {/* Message history */}
      {messages.length > 0 && (
        <Box flexDirection="column">
          <MessageList messages={messages} />
        </Box>
      )}

      {/* Sync UI (non-spinner parts) */}
      {syncStatus !== 'idle' && (
        <Box flexDirection="column" gap={1}>
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
                <Text color={colors.green}>{phase.complete} </Text>
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
