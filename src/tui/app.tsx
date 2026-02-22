/**
 * Main Ink Application Entry Point
 *
 * The root component for the Ink-based TUI. Routes to different screens
 * based on the current screen state. Manages session state and navigation.
 *
 * Uses an AppShell-based layout where each screen wraps itself in
 * <AppShell> with a shared header element. No Static/thread model -
 * screen transitions are clean React mount/unmount cycles.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, render, useStdout, type Instance } from 'ink';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/types.js';
import type { SessionState } from '../repl/session-state.js';
import { loadConfigWithDefaults } from '../utils/config.js';
import { listSpecNames } from '../utils/spec-names.js';
import { logger } from '../utils/logger.js';
import { InterviewScreen } from './screens/InterviewScreen.js';
import { InitScreen } from './screens/InitScreen.js';
import { RunScreen, type RunSummary } from './screens/RunScreen.js';
import { MainShell, type NavigationTarget, type NavigationProps } from './screens/MainShell.js';
import { HeaderContent } from './components/HeaderContent.js';
import { useBackgroundRuns } from './hooks/useBackgroundRuns.js';
import type { Message } from './components/MessageList.js';

/**
 * Available screen types for the App component
 */
export type AppScreen = 'shell' | 'interview' | 'init' | 'run';

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
 * Props for the run/monitor screen when launched directly from CLI
 */
export interface RunAppProps {
  /** Name of the feature to run or monitor */
  featureName: string;
  /** If true, opens in monitor-only (read-only) mode — no loop is spawned */
  monitorOnly?: boolean;
  /** Review mode override */
  reviewMode?: 'manual' | 'auto';
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
  /** Props for the run/monitor screen (required when screen is 'run') */
  runProps?: RunAppProps;
  /** Called when the screen completes successfully */
  onComplete?: (result: string) => void;
  /** Called when the user exits/cancels */
  onExit?: () => void;
}

/**
 * Main App component for the Ink-based TUI
 *
 * Simple routing + shared state. Each screen wraps itself in AppShell
 * and receives a shared headerElement prop.
 */
export function App({
  screen: initialScreen,
  initialSessionState,
  version = '0.12.1', // Fallback if package.json read fails (keep in sync with index.ts)
  interviewProps,
  runProps,
  onComplete,
  onExit,
}: AppProps): React.ReactElement | null {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(initialScreen);
  const [screenProps, setScreenProps] = useState<NavigationProps | null>(() => {
    if (initialScreen === 'run' && runProps) {
      return { featureName: runProps.featureName, monitorOnly: runProps.monitorOnly, reviewMode: runProps.reviewMode };
    }
    if (interviewProps) {
      return { featureName: interviewProps.featureName };
    }
    return null;
  });
  const [sessionState, setSessionState] = useState<SessionState>(initialSessionState);

  // Background run tracking
  const { runs: backgroundRuns, background, dismiss } = useBackgroundRuns();

  // Terminal dimensions for compact mode and resize reactivity
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const compact = rows < 20 || columns < 60;

  // Shared header element - includes columns/rows in deps so the
  // header subtree re-renders on terminal resize (banner auto-compacts)
  const headerElement = useMemo(
    () => (
      <HeaderContent
        version={version}
        sessionState={sessionState}
        backgroundRuns={backgroundRuns}
        compact={compact}
      />
    ),
    [version, sessionState, backgroundRuns, compact, columns, rows]
  );

  /**
   * Navigate to a different screen
   */
  const navigate = useCallback((target: NavigationTarget, props?: NavigationProps) => {
    setScreenProps(props || null);
    setCurrentScreen(target);
  }, []);

  /**
   * Handle interview completion - save spec to disk and navigate to shell
   */
  const handleInterviewComplete = useCallback(async (spec: string, messages: Message[], specPath: string) => {
    try {
      const featureName = screenProps?.featureName || interviewProps?.featureName;
      let savedPath = specPath;

      if (featureName && typeof featureName === 'string') {
        try {
          const config = await loadConfigWithDefaults(sessionState.projectRoot);
          const specsDir = join(sessionState.projectRoot, config.paths.specs);

          if (!existsSync(specsDir)) {
            mkdirSync(specsDir, { recursive: true });
          }

          savedPath = join(specsDir, `${featureName}.md`);
          writeFileSync(savedPath, spec, 'utf-8');

          // Refresh spec name cache so the new spec shows in /run autocomplete
          try {
            const updatedSpecNames = await listSpecNames(specsDir);
            setSessionState((prev) => ({ ...prev, specNames: updatedSpecNames }));
          } catch {
            // Non-critical: autocomplete will update on next restart
          }

          onComplete?.(savedPath);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to save spec: ${reason}`);
          // Pass specPath (not raw spec content) to keep the onComplete contract consistent
          onComplete?.(specPath);
          if (initialScreen !== 'interview') {
            navigate('shell', { message: `Warning: spec generated but could not be saved to disk (${reason}).` });
          } else {
            onExit?.();
          }
          return;
        }
      } else {
        onComplete?.(spec);
      }

      // If started on interview screen directly (--tui mode), exit
      if (initialScreen === 'interview') {
        onExit?.();
        return;
      }

      navigate('shell', { message: `Spec saved to ${savedPath}` });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error(`Unexpected error in handleInterviewComplete: ${reason}`);
      if (initialScreen !== 'interview') {
        navigate('shell', { message: `Error completing interview: ${reason}` });
      } else {
        process.stderr.write(`\nError: ${reason}\n`);
        onExit?.();
      }
    }
  }, [screenProps, interviewProps, sessionState.projectRoot, onComplete, initialScreen, onExit, navigate]);

  /**
   * Handle interview cancel
   */
  const handleInterviewCancel = useCallback(() => {
    if (initialScreen === 'interview') {
      onExit?.();
    } else {
      navigate('shell');
    }
  }, [navigate, initialScreen, onExit]);

  /**
   * Handle init completion - update state and navigate to shell
   */
  const handleInitComplete = useCallback(async (newState: SessionState, generatedFiles?: string[]) => {
    // Refresh spec names after init (config may have changed)
    let specNames: string[] = [];
    try {
      const specsDir = join(
        newState.projectRoot,
        newState.config?.paths.specs ?? '.ralph/specs'
      );
      specNames = await listSpecNames(specsDir);
    } catch {
      // Non-critical: autocomplete will work without spec names
    }
    setSessionState({ ...newState, specNames });
    const fileCount = generatedFiles?.length ?? 0;
    const msg = fileCount > 0
      ? `\u2713 Initialization complete. Generated ${fileCount} configuration file${fileCount === 1 ? '' : 's'}.`
      : '\u2713 Initialization complete.';
    navigate('shell', { message: msg, generatedFiles });
  }, [navigate]);

  /**
   * Handle run completion - dismiss background run if any, navigate to shell
   */
  const handleRunComplete = useCallback((summary: RunSummary) => {
    // Dismiss from background tracking if it was backgrounded
    dismiss(summary.feature);
    navigate('shell');
  }, [dismiss, navigate]);

  /**
   * Handle run background - add to background tracking, navigate to shell
   */
  const handleRunBackground = useCallback((featureName: string) => {
    background(featureName);
    navigate('shell');
  }, [background, navigate]);

  // Guard: redirect to shell if screen has invalid props (avoids setState during render)
  useEffect(() => {
    if (currentScreen === 'interview') {
      const featureName = screenProps?.featureName || interviewProps?.featureName;
      if (!featureName || typeof featureName !== 'string') {
        navigate('shell', { message: 'Feature name is required for the interview screen.' });
        return;
      }
      if (!sessionState.provider) {
        navigate('shell', { message: 'No AI provider configured. Run /init first.' });
      }
    } else if (currentScreen === 'run') {
      const featureName = screenProps?.featureName;
      if (!featureName || typeof featureName !== 'string') {
        navigate('shell', { message: 'Feature name is required for the run screen.' });
      }
    } else if (currentScreen !== 'shell' && currentScreen !== 'init') {
      // Unknown screen — redirect to shell on next tick
      navigate('shell', { message: `Internal error: unknown screen "${currentScreen}". Returned to shell.` });
    }
  }, [currentScreen, screenProps, interviewProps, sessionState.provider, navigate]);

  // Render current screen
  switch (currentScreen) {
    case 'shell':
      return (
        <MainShell
          key={screenProps?.message ? String(screenProps.message) : 'shell'}
          header={headerElement}
          sessionState={sessionState}
          onNavigate={navigate}

          backgroundRuns={backgroundRuns}
          initialMessage={typeof screenProps?.message === 'string' ? screenProps.message : undefined}
          initialFiles={Array.isArray(screenProps?.generatedFiles) ? screenProps.generatedFiles as string[] : undefined}
        />
      );

    case 'interview': {
      const featureName = screenProps?.featureName || interviewProps?.featureName;
      if (!featureName || typeof featureName !== 'string' || !sessionState.provider) {
        return null; // useEffect will redirect to shell
      }

      return (
        <InterviewScreen
          header={headerElement}
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

    case 'init':
      return (
        <InitScreen
          header={headerElement}
          projectRoot={sessionState.projectRoot}
          sessionState={sessionState}
          onComplete={handleInitComplete}
          onCancel={() => navigate('shell')}
        />
      );

    case 'run': {
      const featureName = screenProps?.featureName;
      const monitorOnly = screenProps?.monitorOnly === true;
      if (!featureName || typeof featureName !== 'string') {
        return null; // useEffect will redirect to shell
      }

      const reviewMode = screenProps?.reviewMode as 'manual' | 'auto' | undefined;

      return (
        <RunScreen
          header={headerElement}
          featureName={featureName}
          projectRoot={sessionState.projectRoot}
          sessionState={sessionState}
          monitorOnly={monitorOnly}
          reviewMode={reviewMode}
          onComplete={handleRunComplete}
          onBackground={handleRunBackground}
          onCancel={() => navigate('shell')}
        />
      );
    }

    default: {
      // Return fallback UI instead of calling navigate() during render (which would be setState during render).
      // The useEffect guard above will redirect to shell on next tick.
      const unknownScreen = currentScreen as string;
      logger.error(`Unknown screen: ${unknownScreen}`);
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red">Internal error: unknown screen &quot;{unknownScreen}&quot;. Redirecting to shell...</Text>
        </Box>
      );
    }
  }
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
  /** Props for run/monitor screen (if starting directly on run screen) */
  runProps?: RunAppProps;
  /** Called when spec generation completes */
  onComplete?: (result: string) => void;
  /** Called when user exits */
  onExit?: () => void;
}

/**
 * Render the App component to the terminal
 */
export function renderApp(options: RenderAppOptions): Instance {
  return render(
    <App
      screen={options.screen}
      initialSessionState={options.initialSessionState}
      version={options.version}
      interviewProps={options.interviewProps}
      runProps={options.runProps}
      onComplete={options.onComplete}
      onExit={options.onExit}
    />
  );
}
