/**
 * Ink-based Terminal UI for Wiggum CLI
 *
 * This module provides React-based terminal UI components using Ink.
 * It exports the main App component, all screens, reusable components,
 * hooks, and theme utilities.
 */

// Main app entry point
export { App, renderApp } from './app.js';
export type { AppProps, AppScreen, InterviewAppProps } from './app.js';

// Theme utilities
export * from './theme.js';

// Reusable components
export * from './components/index.js';

// Custom hooks
export * from './hooks/index.js';

// Screen components
export * from './screens/index.js';
