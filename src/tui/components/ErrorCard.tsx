/**
 * ErrorCard - Actionable error display
 *
 * Displays errors with context and suggestions for fixing.
 * More helpful than generic error messages.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, theme, phase } from '../theme.js';

/**
 * Suggestion for fixing the error
 */
export interface ErrorSuggestion {
  /** Explanation of what might have caused the error */
  reason: string;
}

/**
 * Props for the ErrorCard component
 */
export interface ErrorCardProps {
  /** Error title (short description) */
  title: string;
  /** Detailed error message */
  message?: string;
  /** Possible reasons for the error */
  suggestions?: ErrorSuggestion[];
  /** Action command to fix the error (e.g., "/init") */
  action?: string;
  /** Description of the action */
  actionDescription?: string;
  /** Optional tip text */
  tip?: string;
}

/**
 * ErrorCard component
 *
 * Displays an error with context and actionable suggestions.
 *
 * @example
 * ```tsx
 * <ErrorCard
 *   title="API key invalid"
 *   message="Your Anthropic API key was rejected."
 *   suggestions={[
 *     { reason: "The key was revoked or expired" },
 *     { reason: "The key doesn't have required permissions" },
 *   ]}
 *   action="/init"
 *   actionDescription="to update your API key"
 *   tip="Get your API key at console.anthropic.com"
 * />
 * ```
 */
export function ErrorCard({
  title,
  message,
  suggestions,
  action,
  actionDescription,
  tip,
}: ErrorCardProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Error title with ✗ indicator */}
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.error}>{phase.error}</Text>
        <Text color={theme.colors.error} bold>
          {title}
        </Text>
      </Box>

      {/* Detailed message */}
      {message && (
        <Box marginTop={1} marginLeft={2}>
          <Text>{message}</Text>
        </Box>
      )}

      {/* Suggestions/reasons */}
      {suggestions && suggestions.length > 0 && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Text dimColor>This usually means:</Text>
          {suggestions.map((suggestion, index) => (
            <Box key={index} marginLeft={2} flexDirection="row">
              <Text dimColor>• </Text>
              <Text dimColor>{suggestion.reason}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Action command */}
      {action && (
        <Box marginTop={1} marginLeft={2} flexDirection="row">
          <Text>Fix: Run </Text>
          <Text color={theme.colors.prompt} bold>
            {action}
          </Text>
          {actionDescription && <Text> {actionDescription}</Text>}
        </Box>
      )}

      {/* Tip */}
      {tip && (
        <Box marginTop={1} marginLeft={2}>
          <Text dimColor>Tip: {tip}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Pre-configured error cards for common errors
 */
export const CommonErrors = {
  /**
   * API key invalid error
   */
  apiKeyInvalid: (): ErrorCardProps => ({
    title: 'API key invalid',
    message: 'Your API key was rejected by the provider.',
    suggestions: [
      { reason: 'The key was revoked or expired' },
      { reason: "The key doesn't have the required permissions" },
      { reason: 'The key is for a different provider' },
    ],
    action: '/init',
    actionDescription: 'to update your API key',
    tip: 'Get your API key from the provider dashboard',
  }),

  /**
   * Rate limit error
   */
  rateLimit: (): ErrorCardProps => ({
    title: 'Rate limit exceeded',
    message: "You've made too many requests too quickly.",
    suggestions: [
      { reason: 'Too many concurrent requests' },
      { reason: 'Daily quota reached' },
    ],
    tip: 'Wait a moment and try again',
  }),

  /**
   * Network error
   */
  networkError: (): ErrorCardProps => ({
    title: 'Network error',
    message: 'Could not connect to the AI provider.',
    suggestions: [
      { reason: 'No internet connection' },
      { reason: 'Provider service is down' },
      { reason: 'Firewall blocking the connection' },
    ],
    tip: 'Check your internet connection and try again',
  }),

  /**
   * Project not initialized error
   */
  notInitialized: (): ErrorCardProps => ({
    title: 'Project not initialized',
    message: 'This project has not been set up for wiggum yet.',
    action: '/init',
    actionDescription: 'to initialize this project',
  }),

  /**
   * File not found error
   */
  fileNotFound: (path: string): ErrorCardProps => ({
    title: 'File not found',
    message: `Could not find: ${path}`,
    suggestions: [
      { reason: 'The file was moved or deleted' },
      { reason: 'The path is incorrect' },
    ],
  }),
};
