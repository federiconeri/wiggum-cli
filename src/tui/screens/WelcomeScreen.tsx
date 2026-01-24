/**
 * WelcomeScreen - Dexter-inspired welcome screen
 *
 * Displays the Wiggum CLI banner, version, and current model info.
 * Press Enter to continue to the main shell.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { WiggumBanner } from '../components/WiggumBanner.js';
import { colors } from '../theme.js';
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
 * Displays a Dexter-inspired welcome screen with:
 * - ASCII art banner
 * - Version info
 * - Current model configuration
 * - Instructions to continue
 *
 * @example
 * ```tsx
 * <WelcomeScreen
 *   provider="anthropic"
 *   model="sonnet"
 *   version="0.8.0"
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
  const [blinkVisible, setBlinkVisible] = useState(true);

  // Blink effect for "Press Enter"
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkVisible((v) => !v);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Handle Enter key to continue
  useInput((input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  const versionDisplay = getVersionDisplay(version);

  return (
    <Box flexDirection="column" padding={1}>
      {/* ASCII Banner */}
      <WiggumBanner />

      {/* Tagline */}
      <Box marginTop={1}>
        <Text color={colors.brown}>
          Your AI assistant for feature development
        </Text>
      </Box>

      {/* Version */}
      <Box marginTop={1}>
        <Text dimColor>Version </Text>
        <Text color={colors.pink}>{versionDisplay}</Text>
      </Box>

      {/* Model info */}
      <Box marginTop={1}>
        <Text dimColor>Model: </Text>
        {provider ? (
          <Text color={colors.blue}>
            {provider}/{model}
          </Text>
        ) : (
          <Text color={colors.orange}>
            Not configured (run /init)
          </Text>
        )}
      </Box>

      {/* Initialization status */}
      <Box marginTop={1}>
        <Text dimColor>Project: </Text>
        {isInitialized ? (
          <Text color={colors.green}>Initialized</Text>
        ) : (
          <Text color={colors.orange}>Not initialized</Text>
        )}
      </Box>

      {/* Tips */}
      <Box marginTop={2} flexDirection="column">
        <Text dimColor>Tips:</Text>
        <Text dimColor>  /init    - Initialize or reconfigure this project</Text>
        <Text dimColor>  /new     - Create a new feature specification</Text>
        <Text dimColor>  /help    - Show all available commands</Text>
      </Box>

      {/* Press Enter to continue */}
      <Box marginTop={2}>
        <Text color={blinkVisible ? colors.yellow : colors.brown}>
          Press Enter to continue...
        </Text>
      </Box>
    </Box>
  );
}
