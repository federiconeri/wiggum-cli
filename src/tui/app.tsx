/**
 * Main Ink Application Entry Point
 *
 * The root component for the Ink-based TUI. Routes to different screens
 * based on the current screen state. Manages session state and navigation.
 */

import React, { useState, useCallback } from 'react';
import { render, type Instance } from 'ink';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/types.js';
import type { SessionState } from '../repl/session-state.js';
import { loadConfigWithDefaults } from '../utils/config.js';
import { InterviewScreen } from './screens/InterviewScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { InitScreen } from './screens/InitScreen.js';
import { MainShell, type NavigationTarget, type NavigationProps } from './screens/MainShell.js';

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
  /** Called when init workflow should run (outside of Ink) */
  onRunInit?: () => void;
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
export function App({
  screen: initialScreen,
  initialSessionState,
  version = '0.8.0',
  interviewProps,
  onComplete,
  onExit,
  onRunInit,
}: AppProps): React.ReactElement | null {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(initialScreen);
  const [screenProps, setScreenProps] = useState<NavigationProps | null>(
    interviewProps ? { featureName: interviewProps.featureName } : null
  );
  const [sessionState, setSessionState] = useState<SessionState>(initialSessionState);

  /**
   * Navigate to a different screen
   */
  const navigate = useCallback((target: NavigationTarget, props?: NavigationProps) => {
    setScreenProps(props || null);
    setCurrentScreen(target);
  }, []);

  /**
   * Handle interview completion - save spec to disk and notify
   */
  const handleInterviewComplete = useCallback(async (spec: string) => {
    // Get feature name from navigation props or initial interview props
    const featureName = screenProps?.featureName || interviewProps?.featureName;

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
        const specPath = join(specsDir, `${featureName}.md`);
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

    // If started on interview (--tui mode), call onExit to resolve promise
    // Otherwise, return to shell
    if (initialScreen === 'interview') {
      onExit?.();
    } else {
      navigate('shell');
    }
  }, [onComplete, navigate, initialScreen, onExit, screenProps, interviewProps, sessionState.projectRoot]);

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

  // Route to the appropriate screen
  switch (currentScreen) {
    case 'welcome':
      return (
        <WelcomeScreen
          provider={sessionState.provider}
          model={sessionState.model}
          version={version}
          isInitialized={sessionState.initialized}
          onContinue={handleWelcomeContinue}
        />
      );

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
          onComplete={handleInterviewComplete}
          onCancel={handleInterviewCancel}
        />
      );
    }

    case 'init': {
      // Handle init workflow - requires running outside Ink due to readline prompts
      const handleRunInit = () => {
        if (onRunInit) {
          onRunInit();
        } else {
          // No init handler provided, return to shell with message
          navigate('shell');
        }
      };

      return (
        <InitScreen
          onRunInit={handleRunInit}
          onCancel={() => navigate('shell')}
        />
      );
    }

    default:
      return null;
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
  /** Called when spec generation completes */
  onComplete?: (result: string) => void;
  /** Called when user exits */
  onExit?: () => void;
  /** Called when init workflow should run (outside of Ink) */
  onRunInit?: () => void;
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
      onRunInit={options.onRunInit}
    />
  );
}
