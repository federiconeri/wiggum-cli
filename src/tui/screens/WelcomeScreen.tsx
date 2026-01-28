/**
 * WelcomeScreen - Streamlined welcome screen
 *
 * Displays the Wiggum CLI banner with a compact status line.
 * No "Press Enter to continue" friction - boots directly to input-ready.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { WiggumBanner } from '../components/WiggumBanner.js';
import { colors, theme } from '../theme.js';
import type { AIProvider } from '../../ai/providers.js';

/**
 * Props for WelcomeScreen component
 */
export interface WelcomeScreenProps {
  /** Current AI provider */
  provider: AIProvider | null;
  /** Current model ID */
  model: string;
  /** CLI version */
  version: string;
  /** Whether the project is initialized */
  isInitialized: boolean;
  /** Called when user presses Enter to continue */
  onContinue: () => void;
}

/**
 * Get version from package.json (client-side compatible)
 */
function getVersionDisplay(version: string): string {
  return version || '0.5.0';
}

/**
 * WelcomeScreen component
 *
 * Displays a streamlined welcome screen with:
 * - ASCII art banner in Simpson yellow
 * - Compact status line: version │ model │ status
 * - Contextual tip for getting started
 * - No "Press Enter to continue" friction
 *
 * @example
 * ```tsx
 * <WelcomeScreen
 *   provider="anthropic"
 *   model="sonnet"
 *   version="0.10.9"
 *   isInitialized={true}
 *   onContinue={() => navigate('shell')}
 * />
 * ```
 */
export function WelcomeScreen({
  provider,
  model,
  version,
  isInitialized,
  onContinue,
}: WelcomeScreenProps): React.ReactElement {
  const versionDisplay = getVersionDisplay(version);
  const separator = theme.statusLine.separator;

  // Auto-continue after render (remove friction)
  React.useEffect(() => {
    // Delay to let the banner render on slower terminals
    const timer = setTimeout(onContinue, 800);
    return () => clearTimeout(timer);
  }, [onContinue]);

  // Build status text
  const modelDisplay = provider ? `${provider}/${model}` : 'not configured';
  const statusText = isInitialized ? 'Ready' : 'Not initialized';
  const statusColor = isInitialized ? colors.green : colors.orange;

  return (
    <Box flexDirection="column" padding={1}>
      {/* ASCII Banner in Simpson yellow */}
      <WiggumBanner />

      {/* Compact status line: version │ model │ status */}
      <Box marginTop={1} flexDirection="row">
        <Text color={colors.pink}>v{versionDisplay}</Text>
        <Text dimColor>{separator}</Text>
        {provider ? (
          <Text color={colors.blue}>{modelDisplay}</Text>
        ) : (
          <Text color={colors.orange}>{modelDisplay}</Text>
        )}
        <Text dimColor>{separator}</Text>
        <Text color={statusColor}>{statusText}</Text>
      </Box>

      {/* Contextual tip */}
      <Box marginTop={2}>
        <Text dimColor>
          Tip: {isInitialized ? '/new <feature> to create spec' : '/init to set up'}, /help for commands
        </Text>
      </Box>
    </Box>
  );
}
