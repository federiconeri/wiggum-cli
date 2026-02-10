/**
 * HeaderContent - Banner + status meta for the AppShell header zone
 *
 * Extracts the banner rendering previously in App.tsx renderBannerContent().
 */

import React from 'react';
import { Box, Text } from 'ink';
import { WiggumBanner } from './WiggumBanner.js';
import { colors, theme } from '../theme.js';
import type { SessionState } from '../../repl/session-state.js';
import type { BackgroundRun } from '../hooks/useBackgroundRuns.js';

/**
 * Props for the HeaderContent component
 */
export interface HeaderContentProps {
  /** CLI version string */
  version: string;
  /** Current session state */
  sessionState: SessionState;
  /** Active background runs */
  backgroundRuns?: BackgroundRun[];
  /** Use compact banner for small terminals */
  compact?: boolean;
}

/**
 * HeaderContent component
 *
 * Renders the banner and status row for the AppShell header zone.
 */
export function HeaderContent({
  version,
  sessionState,
  backgroundRuns,
  compact = false,
}: HeaderContentProps): React.ReactElement {
  const activeRuns = backgroundRuns?.filter((r) => !r.completed) ?? [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <WiggumBanner compact={compact} />
      <Box marginTop={compact ? 0 : 1} flexDirection="row">
        <Text color={colors.pink}>v{version}</Text>
        <Text dimColor>{theme.statusLine.separator}</Text>
        {sessionState.provider ? (
          <Text color={colors.blue}>{sessionState.provider}/{sessionState.model}</Text>
        ) : (
          <Text color={colors.orange}>not configured</Text>
        )}
        <Text dimColor>{theme.statusLine.separator}</Text>
        <Text color={sessionState.initialized ? colors.green : colors.orange}>
          {sessionState.initialized ? 'Ready' : 'Not initialized'}
        </Text>
        {activeRuns.length > 0 && (
          <>
            <Text dimColor>{theme.statusLine.separator}</Text>
            <Text color={colors.green}>
              {theme.chars.bulletLarge} {activeRuns[0]!.featureName}
              {activeRuns[0]!.lastStatus.iteration > 0
                ? ` (${activeRuns[0]!.lastStatus.iteration}/${activeRuns[0]!.lastStatus.maxIterations || '?'})`
                : ''}
            </Text>
            {activeRuns.length > 1 && (
              <Text dimColor> +{activeRuns.length - 1} more</Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
