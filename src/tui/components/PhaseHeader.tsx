/**
 * PhaseHeader - Current phase indicator for multi-step workflows
 *
 * Displays the current phase with a horizontal line border.
 * Format: ━━━ Phase X of Y: PhaseName ━━━
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * Props for the PhaseHeader component
 */
export interface PhaseHeaderProps {
  /** Current phase number (1-based) */
  currentPhase: number;
  /** Total number of phases */
  totalPhases: number;
  /** Name of the current phase */
  phaseName: string;
}

/**
 * Heavy horizontal box drawing character (U+2501)
 */
const HEAVY_HORIZONTAL = '\u2501';

/**
 * PhaseHeader component
 *
 * Shows the current phase progress with surrounding horizontal lines.
 * Uses Simpson yellow for visibility.
 *
 * @example
 * ```tsx
 * <PhaseHeader
 *   currentPhase={2}
 *   totalPhases={4}
 *   phaseName="Understanding Requirements"
 * />
 * // Renders: ━━━ Phase 2 of 4: Understanding Requirements ━━━
 * ```
 */
export function PhaseHeader({
  currentPhase,
  totalPhases,
  phaseName,
}: PhaseHeaderProps): React.ReactElement {
  // Build the phase text
  const phaseText = `Phase ${currentPhase} of ${totalPhases}: ${phaseName}`;

  // Create horizontal line segments (3 characters each side)
  const lineSegment = HEAVY_HORIZONTAL.repeat(3);

  return (
    <Box flexDirection="row" justifyContent="center" width="100%">
      <Text color={colors.yellow}>
        {lineSegment} {phaseText} {lineSegment}
      </Text>
    </Box>
  );
}
