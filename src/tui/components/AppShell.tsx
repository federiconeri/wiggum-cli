/**
 * AppShell - Fixed-position layout wrapper for TUI screens
 *
 * Provides a 5-zone layout where header and footer are fixed,
 * content fills the remaining space, and screen transitions are
 * clean React mount/unmount cycles.
 *
 * Zones:
 *  1. Header: banner + status meta (fixed)
 *  2. TipsBar: contextual hints (1 row or 0)
 *  3. Content: screen-specific, overflow hidden (fills remaining space)
 *  4. Spinner: WorkingIndicator (1 row when active, 0 otherwise)
 *  5. Footer: input + separator + status line (fixed)
 */

import React from 'react';
import { Box, Text } from 'ink';
import { TipsBar } from './TipsBar.js';
import { WorkingIndicator } from './WorkingIndicator.js';
import { FooterStatusBar, type FooterStatusBarProps } from './FooterStatusBar.js';
import { phase, theme } from '../theme.js';

/**
 * Props for the AppShell component
 */
export interface AppShellProps {
  /** Pre-built header element (HeaderContent) */
  header: React.ReactNode;
  /** Tip text (null/undefined to hide tips bar) */
  tips?: string | null;
  /** Content area - screen-specific */
  children: React.ReactNode;
  /** Show spinner bar */
  isWorking?: boolean;
  /** Spinner text */
  workingStatus?: string;
  /** Spinner hint (e.g. "esc to cancel") */
  workingHint?: string;
  /** Error message to display as a toast above the footer */
  error?: string | null;
  /** Input component: ChatInput, MultiSelect, Select, etc. */
  input?: React.ReactNode;
  /** Footer status bar props */
  footerStatus: FooterStatusBarProps;
}

/**
 * AppShell component
 *
 * Compact inline layout like Claude Code. Renders at natural height
 * right after the shell prompt. Content area has a max height to
 * prevent pushing the footer off-screen when messages accumulate.
 */
export function AppShell({
  header,
  tips,
  children,
  isWorking = false,
  workingStatus = '',
  workingHint,
  error,
  input,
  footerStatus,
}: AppShellProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      {/* Header */}
      <Box marginTop={1} flexDirection="column">{header}</Box>

      {/* Tips */}
      {tips && <TipsBar text={tips} />}

      {/* Content - natural height */}
      {children}

      {/* Spinner */}
      {isWorking && (
        <WorkingIndicator
          state={{
            isWorking: true,
            status: workingStatus,
            hint: workingHint,
          }}
          variant="active"
        />
      )}

      {/* Error toast */}
      {error && (
        <Text color={theme.colors.error}>{phase.error} {error}</Text>
      )}

      {/* Footer */}
      <Box marginBottom={1} flexDirection="column">
        {input}
        <FooterStatusBar {...footerStatus} />
      </Box>
    </Box>
  );
}
