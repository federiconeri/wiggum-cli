/**
 * Main Ink Application Entry Point
 *
 * The root component for the Ink-based TUI. Routes to different screens
 * based on the current screen state. Manages session state and navigation.
 */

import React, { useState, useCallback } from 'react';
import { render, type Instance } from 'ink';
import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/types.js';
import type { SessionState } from '../repl/session-state.js';
import { InterviewScreen } from './screens/InterviewScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
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
   * Handle interview completion
   */
  const handleInterviewComplete = useCallback((spec: string) => {
    onComplete?.(spec);
    // Return to shell after completion
    navigate('shell');
  }, [onComplete, navigate]);

  /**
   * Handle interview cancel
   */
  const handleInterviewCancel = useCallback(() => {
    navigate('shell');
  }, [navigate]);

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

    case 'init':
      // TODO: Implement InitScreen
      // For now, show message and return to shell
      // The init workflow is complex and may need to be handled differently
      navigate('shell');
      return null;

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
