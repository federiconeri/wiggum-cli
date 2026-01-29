/**
 * Main Ink Application Entry Point
 *
 * The root component for the Ink-based TUI. Routes to different screens
 * based on the current screen state. Manages session state and navigation.
 *
 * Uses a "continuous thread" model like Claude Code - all output stays
 * visible in the terminal as a growing thread, rather than clearing screens.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { render, Static, Box, Text, type Instance } from 'ink';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/types.js';
import type { SessionState } from '../repl/session-state.js';
import { loadConfigWithDefaults } from '../utils/config.js';
import { InterviewScreen } from './screens/InterviewScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { InitScreen } from './screens/InitScreen.js';
import { MainShell, type NavigationTarget, type NavigationProps } from './screens/MainShell.js';
import { WiggumBanner } from './components/WiggumBanner.js';
import { ToolCallCard } from './components/ToolCallCard.js';
import type { Message } from './components/MessageList.js';
import { colors, theme } from './theme.js';

/**
 * Thread item representing a completed action in the history
 */
interface ThreadItem {
  id: string;
  type: 'banner' | 'init-complete' | 'spec-complete' | 'message';
  content: React.ReactNode;
}

interface PendingCompletion {
  action: 'exit' | 'shell';
  threadId: string;
}

/**
 * Available screen types for the App component
 */
export type AppScreen = 'welcome' | 'shell' | 'interview' | 'init';

/**
 * Props for the interview screen
 */
export interface InterviewAppProps {
  /** Name of the feature being specified */
  featureName: string;
  /** Project root directory path */
  projectRoot: string;
  /** AI provider to use */
  provider: AIProvider;
  /** Model ID to use */
  model: string;
  /** Optional scan result with detected tech stack */
  scanResult?: ScanResult;
}

/**
 * Props for the main App component
 */
export interface AppProps {
  /** Initial screen to display */
  screen: AppScreen;
  /** Initial session state */
  initialSessionState: SessionState;
  /** CLI version */
  version?: string;
  /** Props for the interview screen (required when screen is 'interview') */
  interviewProps?: InterviewAppProps;
  /** Called when the screen completes successfully */
  onComplete?: (result: string) => void;
  /** Called when the user exits/cancels */
  onExit?: () => void;
}

/**
 * Main App component for the Ink-based TUI
 *
 * Routes to different screens based on the current screen state.
 * Manages session state and provides navigation between screens.
 *
 * @example
 * ```tsx
 * renderApp({
 *   screen: 'welcome',
 *   initialSessionState: sessionState,
 *   version: '0.8.0',
 *   onExit: () => process.exit(0),
 * });
 * ```
 */
/**
 * Generate a unique ID for thread items
 */
function generateThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function App({
  screen: initialScreen,
  initialSessionState,
  version = '0.8.0',
  interviewProps,
  onComplete,
  onExit,
}: AppProps): React.ReactElement | null {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(initialScreen);
  const [screenProps, setScreenProps] = useState<NavigationProps | null>(
    interviewProps ? { featureName: interviewProps.featureName } : null
  );
  const [sessionState, setSessionState] = useState<SessionState>(initialSessionState);

  // Thread history - preserves all output as a continuous thread
  const [threadHistory, setThreadHistory] = useState<ThreadItem[]>(() => {
    // Start with banner if showing welcome screen
    if (initialScreen === 'welcome') {
      return [{
        id: generateThreadId(),
        type: 'banner',
        content: (
          <Box flexDirection="column" padding={1}>
            <WiggumBanner />
            <Box marginTop={1} flexDirection="row">
              <Text color={colors.pink}>v{version}</Text>
              <Text dimColor>{theme.statusLine.separator}</Text>
              {initialSessionState.provider ? (
                <Text color={colors.blue}>{initialSessionState.provider}/{initialSessionState.model}</Text>
              ) : (
                <Text color={colors.orange}>not configured</Text>
              )}
              <Text dimColor>{theme.statusLine.separator}</Text>
              <Text color={initialSessionState.initialized ? colors.green : colors.orange}>
                {initialSessionState.initialized ? 'Ready' : 'Not initialized'}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Tip: {initialSessionState.initialized ? '/new <feature> to create spec' : '/init to set up'}, /help for commands
              </Text>
            </Box>
          </Box>
        ),
      }];
    }
    return [];
  });
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null);

  /**
   * Add an item to the thread history
   */
  const addToThread = useCallback((type: ThreadItem['type'], content: React.ReactNode): string => {
    const id = generateThreadId();
    setThreadHistory(prev => [...prev, { id, type, content }]);
    return id;
  }, []);

  /**
   * Navigate to a different screen
   */
  const navigate = useCallback((target: NavigationTarget, props?: NavigationProps) => {
    setScreenProps(props || null);
    setCurrentScreen(target);
  }, []);

  /**
   * Handle interview completion - save spec to disk and add to thread
   */
  const handleInterviewComplete = useCallback(async (spec: string, messages: Message[]) => {
    // Get feature name from navigation props or initial interview props
    const featureName = screenProps?.featureName || interviewProps?.featureName;
    let specPath = '';

    if (featureName && typeof featureName === 'string') {
      try {
        // Load config to get specs directory
        const config = await loadConfigWithDefaults(sessionState.projectRoot);
        const specsDir = join(sessionState.projectRoot, config.paths.specs);

        // Create specs directory if it doesn't exist
        if (!existsSync(specsDir)) {
          mkdirSync(specsDir, { recursive: true });
        }

        // Write spec to file
        specPath = join(specsDir, `${featureName}.md`);
        writeFileSync(specPath, spec, 'utf-8');

        // Call onComplete with the spec path for logging
        onComplete?.(specPath);
      } catch (error) {
        // If saving fails, still call onComplete with spec content
        onComplete?.(spec);
      }
    } else {
      onComplete?.(spec);
    }

    // Add interview conversation to thread first (preserves all messages)
    addToThread('message', (
      <Box flexDirection="column" marginY={1}>
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <Box key={msg.id} flexDirection="row" marginY={1}>
                <Text color={theme.colors.prompt} bold>{theme.chars.prompt} </Text>
                <Text color={theme.colors.userText}>{msg.content}</Text>
              </Box>
            );
          } else if (msg.role === 'assistant') {
            return (
              <Box key={msg.id} flexDirection="column" marginY={1}>
                {/* Tool calls */}
                {msg.toolCalls && msg.toolCalls.map((toolCall, idx) => (
                  <ToolCallCard
                    key={`${msg.id}-tool-${idx}`}
                    toolName={toolCall.toolName}
                    input={toolCall.input}
                    output={toolCall.output}
                    status={toolCall.status}
                    error={toolCall.error}
                    expanded={false}
                  />
                ))}
                {/* Message content */}
                {msg.content && (
                  <Box flexDirection="row">
                    <Text dimColor>{theme.chars.bullet} </Text>
                    <Text dimColor italic>{msg.content}</Text>
                  </Box>
                )}
              </Box>
            );
          }
          return null;
        })}
      </Box>
    ));

    // Prefer previewing the spec from disk if available (ensures consistent output)
    let specForPreview = typeof spec === 'string' ? spec : '';
    if (specPath && existsSync(specPath)) {
      try {
        specForPreview = readFileSync(specPath, 'utf-8');
      } catch {
        // Ignore read errors and fall back to in-memory spec
      }
    }

    // Add completion summary to thread with defensive checks
    try {
      // Only bail out if spec preview is not a string
      if (typeof specForPreview !== 'string') {
        console.error('[handleInterviewComplete] Invalid spec preview:', typeof specForPreview);
      }

      const specLines = specForPreview ? specForPreview.split('\n') : [];
      const totalLines = specLines.length;
      const previewLines = specLines.slice(0, 5);
      const remainingLines = Math.max(0, totalLines - 5);

      const completionThreadId = addToThread('spec-complete', (
        <Box flexDirection="column" marginY={1}>
          {/* Tool-call style preview */}
          <Box flexDirection="row">
            <Text color={colors.green}>{theme.chars.bullet} </Text>
            <Text bold>Write</Text>
            <Text dimColor>({specPath || `${featureName}.md`})</Text>
          </Box>
          <Box marginLeft={2}>
            <Text dimColor>└ Wrote {totalLines} lines</Text>
          </Box>

          {/* Preview with line numbers */}
          <Box marginLeft={4} flexDirection="column">
            {previewLines.map((line, i) => (
              <Box key={i} flexDirection="row">
                <Text dimColor>{String(i + 1).padStart(4)} </Text>
                <Text dimColor>{line}</Text>
              </Box>
            ))}
            {remainingLines > 0 && (
              <Text dimColor>… +{remainingLines} lines</Text>
            )}
          </Box>

          {/* Done message */}
          <Box marginTop={1} flexDirection="row">
            <Text color={colors.green}>{theme.chars.bullet} </Text>
            <Text>Done. Specification generated successfully.</Text>
          </Box>

          {/* What's next */}
          <Box marginTop={1} flexDirection="column">
            <Text bold>What's next:</Text>
            <Box flexDirection="row" gap={1}>
              <Text color={colors.green}>›</Text>
              <Text dimColor>Review the spec in your editor</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text color={colors.green}>›</Text>
              <Text color={colors.blue}>/help</Text>
              <Text dimColor>See all commands</Text>
            </Box>
          </Box>
        </Box>
      ));

      // Defer navigation until the spec-complete item is visible
      setPendingCompletion({
        action: initialScreen === 'interview' ? 'exit' : 'shell',
        threadId: completionThreadId,
      });
    } catch (error) {
      console.error('[handleInterviewComplete] Error adding spec-complete to thread:', error);
      if (initialScreen === 'interview') {
        onExit?.();
      } else {
        navigate('shell');
      }
    }
  }, [onComplete, navigate, initialScreen, onExit, screenProps, interviewProps, sessionState.projectRoot, addToThread]);

  // Ensure completion summary is rendered before navigating away
  useEffect(() => {
    if (!pendingCompletion) return;
    const hasThreadItem = threadHistory.some(item => item.id === pendingCompletion.threadId);
    if (!hasThreadItem) return;

    const timer = setTimeout(() => {
      if (pendingCompletion.action === 'exit') {
        onExit?.();
      } else {
        navigate('shell');
      }
      setPendingCompletion(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [pendingCompletion, threadHistory, navigate, onExit]);

  /**
   * Handle interview cancel
   */
  const handleInterviewCancel = useCallback(() => {
    // If started on interview (--tui mode), call onExit to resolve promise
    // Otherwise, return to shell
    if (initialScreen === 'interview') {
      onExit?.();
    } else {
      navigate('shell');
    }
  }, [navigate, initialScreen, onExit]);

  /**
   * Handle welcome continue
   */
  const handleWelcomeContinue = useCallback(() => {
    navigate('shell');
  }, [navigate]);

  /**
   * Handle session state changes
   */
  const handleSessionStateChange = useCallback((newState: SessionState) => {
    setSessionState(newState);
  }, []);

  /**
   * Handle init completion - add summary to thread and update state
   */
  const handleInitComplete = useCallback((newState: SessionState, generatedFiles?: string[]) => {
    // Add init completion to thread
    addToThread('init-complete', (
      <Box flexDirection="column" marginY={1}>
        {/* Tool-call style display for files */}
        {generatedFiles && generatedFiles.slice(0, 5).map((file) => (
          <Box key={file} flexDirection="column">
            <Box flexDirection="row">
              <Text color={colors.green}>{theme.chars.bullet} </Text>
              <Text bold>Write</Text>
              <Text dimColor>({file})</Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>└ Created {file}</Text>
            </Box>
          </Box>
        ))}
        {generatedFiles && generatedFiles.length > 5 && (
          <Text dimColor>  ... and {generatedFiles.length - 5} more files</Text>
        )}

        {/* Done message */}
        <Box marginTop={1} flexDirection="row">
          <Text color={colors.green}>{theme.chars.bullet} </Text>
          <Text>Done. Created Ralph configuration files.</Text>
        </Box>

        {/* What's next */}
        <Box marginTop={1} flexDirection="column">
          <Text bold>What's next:</Text>
          <Box flexDirection="row" gap={1}>
            <Text color={colors.green}>›</Text>
            <Text color={colors.blue}>/new {'<feature>'}</Text>
            <Text dimColor>Create a feature specification</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text color={colors.green}>›</Text>
            <Text color={colors.blue}>/help</Text>
            <Text dimColor>See all commands</Text>
          </Box>
        </Box>
      </Box>
    ));

    setSessionState(newState);
    navigate('shell');
  }, [addToThread, navigate]);

  // Render current screen content
  const renderCurrentScreen = () => {
    // Hide interview screen once completion summary is queued to avoid
    // appending the live interview UI after the static thread summary.
    if (pendingCompletion && currentScreen === 'interview') {
      return null;
    }

    switch (currentScreen) {
      case 'welcome':
        // Banner is already in thread history, fall through to shell
      case 'shell':
        return (
          <MainShell
            sessionState={sessionState}
            onNavigate={navigate}
            onSessionStateChange={handleSessionStateChange}
          />
        );

      case 'interview': {
        // Get feature name from props or navigation
        const featureName = screenProps?.featureName || interviewProps?.featureName;

        if (!featureName || typeof featureName !== 'string') {
          // Missing feature name, go back to shell
          navigate('shell');
          return null;
        }

        if (!sessionState.provider) {
          // No provider configured, can't run interview
          navigate('shell');
          return null;
        }

        return (
          <InterviewScreen
            featureName={featureName}
            projectRoot={sessionState.projectRoot}
            provider={sessionState.provider}
            model={sessionState.model}
            scanResult={sessionState.scanResult}
            specsPath={sessionState.config?.paths.specs}
            onComplete={handleInterviewComplete}
            onCancel={handleInterviewCancel}
          />
        );
      }

      case 'init': {
        return (
          <InitScreen
            projectRoot={sessionState.projectRoot}
            sessionState={sessionState}
            onComplete={handleInitComplete}
            onCancel={() => navigate('shell')}
          />
        );
      }

      default:
        return null;
    }
  };

  // Render with thread history (Static) + current screen
  return (
    <Box flexDirection="column">
      {/* Static thread history - preserved output that doesn't re-render */}
      <Static items={threadHistory}>
        {(item) => (
          <Box key={item.id}>
            {item.content}
          </Box>
        )}
      </Static>

      {/* Current active screen */}
      {renderCurrentScreen()}
    </Box>
  );
}

/**
 * Render options for renderApp
 */
export interface RenderAppOptions {
  /** Initial screen to display */
  screen: AppScreen;
  /** Initial session state */
  initialSessionState: SessionState;
  /** CLI version */
  version?: string;
  /** Props for interview screen (if starting directly on interview) */
  interviewProps?: InterviewAppProps;
  /** Called when spec generation completes */
  onComplete?: (result: string) => void;
  /** Called when user exits */
  onExit?: () => void;
}

/**
 * Render the App component to the terminal
 *
 * Helper function that wraps Ink's render() to provide a clean API
 * for starting the TUI from command handlers.
 *
 * @param options - Render options
 * @returns Ink Instance that can be used to control/cleanup the render
 *
 * @example
 * ```typescript
 * const instance = renderApp({
 *   screen: 'welcome',
 *   initialSessionState: state,
 *   version: '0.8.0',
 *   onExit: () => instance.unmount(),
 * });
 *
 * await instance.waitUntilExit();
 * ```
 */
export function renderApp(options: RenderAppOptions): Instance {
  return render(
    <App
      screen={options.screen}
      initialSessionState={options.initialSessionState}
      version={options.version}
      interviewProps={options.interviewProps}
      onComplete={options.onComplete}
      onExit={options.onExit}
    />
  );
}
