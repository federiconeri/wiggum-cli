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
import { StatusLine } from './components/StatusLine.js';
import { PHASE_CONFIGS } from './hooks/useSpecGenerator.js';
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

interface CompletionQueue {
  summaryContent: React.ReactNode;
  summaryType: ThreadItem['type'];
  action: 'exit' | 'shell';
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
  const [completionQueue, setCompletionQueue] = useState<CompletionQueue | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [threadResetKey, setThreadResetKey] = useState(0);

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

    // Prefer previewing the spec from disk if available (ensures consistent output)
    let specForPreview = typeof spec === 'string' ? spec : '';
    if (specPath && existsSync(specPath)) {
      try {
        specForPreview = readFileSync(specPath, 'utf-8');
      } catch {
        // Ignore read errors and fall back to in-memory spec
      }
    }

    const specLines = specForPreview ? specForPreview.split('\n') : [];
    const totalLines = specLines.length;
    const previewLines = specLines.slice(0, 5);
    const remainingLines = Math.max(0, totalLines - 5);

    const MAX_RECAP_SOURCE_LENGTH = 1200;
    const userMessages = messages
      .filter((msg) => msg.role === 'user')
      .map((msg) => msg.content.trim())
      .filter((content) => content.length > 0 && content.length <= MAX_RECAP_SOURCE_LENGTH);

    const nonUrlUserMessages = userMessages.filter((content) => !/^https?:\/\//i.test(content) && !/^www\./i.test(content));

    const assistantParagraphs = messages
      .filter((msg) => msg.role === 'assistant' && msg.content && msg.content.length <= MAX_RECAP_SOURCE_LENGTH)
      .flatMap((msg) => msg.content.split('\n\n'))
      .map((para) => para.replace(/\s+/g, ' ').trim())
      .filter((para) => para.length > 0 && para.length <= 320);

    const recapCandidates = assistantParagraphs
      .map((para) => para.replace(/^[^a-z0-9]+/i, '').trim())
      .filter((para) => /^(you want|understood|got it)/i.test(para))
      .map((para) => para.split(/next question:/i)[0].trim())
      .filter((para) => para.length > 0);

    const normalizeRecap = (text: string): string => {
      let result = text.trim();
      result = result.replace(/^[^a-z0-9]+/i, '');
      result = result.replace(/^you want\s*/i, '');
      result = result.replace(/^understood[:,]?\s*/i, '');
      result = result.replace(/^got it[-—:]*\s*/i, '');
      return result.charAt(0).toUpperCase() + result.slice(1);
    };

    const normalizeUserDecision = (text: string): string => {
      let result = text.trim();
      result = result.replace(/^[^a-z0-9]+/i, '');
      result = result.replace(/^i (?:would like|want|need|prefer|expect) to\s*/i, '');
      result = result.replace(/^i (?:would like|want|need|prefer|expect)\s*/i, '');
      result = result.replace(/^please\s*/i, '');
      result = result.replace(/^up to you[:,]?\s*/i, '');
      result = result.replace(/^both\s*/i, 'Both ');
      if (result && !/[.!?]$/.test(result)) {
        result += '.';
      }
      return result.charAt(0).toUpperCase() + result.slice(1);
    };

    const goalCandidate = recapCandidates.length > 0
      ? normalizeRecap(recapCandidates[0]!)
      : (nonUrlUserMessages.find((content) => content.length > 20)
        ? normalizeUserDecision(nonUrlUserMessages.find((content) => content.length > 20)!)
        : (nonUrlUserMessages[0] ? normalizeUserDecision(nonUrlUserMessages[0]) : `Define "${featureName}"`));

    const summarizeText = (text: string, max = 160): string => {
      if (text.length <= max) return text;
      return `${text.slice(0, max - 1)}…`;
    };

    const decisions: string[] = [];
    const seen = new Set<string>();
    const isUsefulDecision = (entry: string): boolean => {
      const normalized = entry.trim().toLowerCase();
      if (normalized.length < 8) return false;
      const wordCount = normalized.split(/\s+/).length;
      if (wordCount < 3) return false;
      if (['yes', 'no', 'both', 'ok', 'okay'].includes(normalized)) return false;
      return true;
    };
    for (let i = nonUrlUserMessages.length - 1; i >= 0; i -= 1) {
      const entry = nonUrlUserMessages[i];
      const normalized = entry.toLowerCase();
      if (entry === goalCandidate) continue;
      if (!isUsefulDecision(entry)) continue;
      if (entry.length > 160) continue;
      if (seen.has(normalized)) continue;
      decisions.unshift(normalizeUserDecision(entry));
      seen.add(normalized);
      if (decisions.length >= 4) break;
    }

    if (recapCandidates.length > 1) {
      decisions.length = 0;
      seen.clear();
      for (let i = 1; i < recapCandidates.length; i += 1) {
        const entry = normalizeRecap(recapCandidates[i]!);
        const normalized = entry.toLowerCase();
        if (!isUsefulDecision(entry)) continue;
        if (seen.has(normalized)) continue;
        decisions.push(entry);
        seen.add(normalized);
        if (decisions.length >= 4) break;
      }
    }

    const summaryContent = (
      <Box flexDirection="column" marginY={1}>
        <StatusLine
          action="New Spec"
          phase={`Complete (${PHASE_CONFIGS.complete.number}/${PHASE_CONFIGS.complete.number})`}
          path={featureName}
        />
        <Box marginTop={1} flexDirection="column">
          <Text bold>Summary</Text>
          <Text>- Goal: {summarizeText(goalCandidate)}</Text>
          <Text>- Outcome: Spec written to {specPath || `${featureName}.md`} ({totalLines} lines)</Text>
        </Box>

        {decisions.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Key decisions</Text>
            {decisions.map((decision, idx) => (
              <Text key={`${decision}-${idx}`}>{idx + 1}. {summarizeText(decision, 120)}</Text>
            ))}
          </Box>
        )}

        {/* Tool-call style preview */}
        <Box marginTop={1} flexDirection="row">
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
    );

    // Hide the live interview UI before appending to the static thread
    setIsTransitioning(true);
    setCompletionQueue({
      summaryContent,
      summaryType: 'spec-complete',
      action: initialScreen === 'interview' ? 'exit' : 'shell',
    });
  }, [onComplete, navigate, initialScreen, onExit, screenProps, interviewProps, sessionState.projectRoot, addToThread]);

  // Append completion items after the interview UI is hidden
  useEffect(() => {
    if (!isTransitioning || !completionQueue) return;

    const completionItem: ThreadItem = {
      id: generateThreadId(),
      type: completionQueue.summaryType,
      content: completionQueue.summaryContent,
    };

    process.stdout.write('\x1b[2J\x1b[0;0H');
    setThreadHistory((prev) => [...prev, completionItem]);
    setThreadResetKey((prev) => prev + 1);

    const action = completionQueue.action;
    setCompletionQueue(null);

    setTimeout(() => {
      if (action === 'exit') {
        if (onExit) {
          onExit();
          return;
        }
        navigate('shell');
        setIsTransitioning(false);
        return;
      }
      navigate('shell');
      setIsTransitioning(false);
    }, 0);
  }, [isTransitioning, completionQueue, navigate, onExit]);

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
    // Hide screens while we transition interview output to static thread
    if (isTransitioning) {
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
      <Static key={threadResetKey} items={threadHistory}>
        {(item) => (
          <Box key={item.id}>
            {item.content}
          </Box>
        )}
      </Static>

      {/* Current active screen */}
      {!isTransitioning && renderCurrentScreen()}
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
