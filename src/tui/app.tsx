/**
 * Main Ink Application Entry Point
 *
 * The root component for the Ink-based TUI. Routes to different screens
 * based on the mode/screen prop. Currently supports the interview screen
 * for the /new command, with room to add more screens (init, main shell,
 * monitor) as needed.
 */

import React from 'react';
import { render, type Instance } from 'ink';
import type { AIProvider } from '../ai/providers.js';
import type { ScanResult } from '../scanner/types.js';
import { InterviewScreen } from './screens/InterviewScreen.js';

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
 * Available screen types for the App component
 * Start with just 'interview', add more screens later as needed:
 * - 'init' - Project initialization wizard
 * - 'shell' - Main interactive shell
 * - 'monitor' - Agent monitoring dashboard
 */
export type AppScreen = 'interview';

/**
 * Props for the main App component
 */
export interface AppProps {
  /** Screen to display */
  screen: AppScreen;
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
 * Routes to different screens based on the `screen` prop. Currently
 * only supports the interview screen for spec generation. The component
 * structure allows easy addition of new screens in the future.
 *
 * @example
 * ```tsx
 * // Render the interview screen
 * renderApp({
 *   screen: 'interview',
 *   interviewProps: {
 *     featureName: 'user-auth',
 *     projectRoot: '/path/to/project',
 *     provider: 'anthropic',
 *     model: 'claude-sonnet-4-5-20250514',
 *   },
 *   onComplete: (spec) => {
 *     fs.writeFileSync('spec.md', spec);
 *   },
 *   onExit: () => {
 *     process.exit(0);
 *   },
 * });
 * ```
 */
export function App({
  screen,
  interviewProps,
  onComplete,
  onExit,
}: AppProps): React.ReactElement | null {
  // Route to the appropriate screen based on the screen prop
  if (screen === 'interview' && interviewProps) {
    return (
      <InterviewScreen
        featureName={interviewProps.featureName}
        projectRoot={interviewProps.projectRoot}
        provider={interviewProps.provider}
        model={interviewProps.model}
        scanResult={interviewProps.scanResult}
        onComplete={(spec) => {
          onComplete?.(spec);
        }}
        onCancel={() => {
          onExit?.();
        }}
      />
    );
  }

  // Future screens would be added here:
  // if (screen === 'init' && initProps) { ... }
  // if (screen === 'shell' && shellProps) { ... }
  // if (screen === 'monitor' && monitorProps) { ... }

  // Fallback - shouldn't happen in normal usage
  return null;
}

/**
 * Render the App component to the terminal
 *
 * Helper function that wraps Ink's render() to provide a clean API
 * for starting the TUI from command handlers.
 *
 * @param props - App component props
 * @returns Ink Instance that can be used to control/cleanup the render
 *
 * @example
 * ```typescript
 * // In a command handler
 * const instance = renderApp({
 *   screen: 'interview',
 *   interviewProps: { ... },
 *   onComplete: (spec) => { ... },
 *   onExit: () => instance.unmount(),
 * });
 * ```
 */
export function renderApp(props: AppProps): Instance {
  return render(<App {...props} />);
}
