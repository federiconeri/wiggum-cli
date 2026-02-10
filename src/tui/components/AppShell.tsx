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
import { Box, useStdout } from 'ink';
import { TipsBar } from './TipsBar.js';
import { WorkingIndicator } from './WorkingIndicator.js';
import { FooterStatusBar, type FooterStatusBarProps } from './FooterStatusBar.js';

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
  /** Input component: ChatInput, MultiSelect, Select, etc. */
  input?: React.ReactNode;
  /** Footer status bar props */
  footerStatus: FooterStatusBarProps;
}

/**
 * AppShell component
 *
 * Wraps each screen in a fixed-position layout. The header and footer
 * remain in place while the content area fills the remaining vertical
 * space with overflow hidden.
 */
export function AppShell({
  header,
  tips,
  children,
  isWorking = false,
  workingStatus = '',
  workingHint,
  input,
  footerStatus,
}: AppShellProps): React.ReactElement {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const compact = rows < 20;

  // Height estimates for fixed zones
  const headerH = compact ? 3 : 9; // banner 6 lines + status + tip-gap + border
  const tipsH = tips ? 1 : 0;
  const spinnerH = isWorking ? 1 : 0;
  const inputH = input ? 2 : 0;
  const footerH = 2; // separator + status line

  const contentH = Math.max(3, rows - headerH - tipsH - spinnerH - inputH - footerH);

  return (
    <Box flexDirection="column" height={rows}>
      {/* Zone 1: Header */}
      <Box flexDirection="column">
        {header}
      </Box>

      {/* Zone 2: Tips */}
      {tips && <TipsBar text={tips} />}

      {/* Zone 3: Content */}
      <Box
        flexDirection="column"
        height={contentH}
        overflowY="hidden"
      >
        {children}
      </Box>

      {/* Zone 4: Spinner */}
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

      {/* Zone 5: Footer */}
      <Box flexDirection="column">
        {input}
        <FooterStatusBar {...footerStatus} />
      </Box>
    </Box>
  );
}
