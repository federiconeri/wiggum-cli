/**
 * SummaryBox - Bordered box wrapper for enhanced run summary
 *
 * Draws a bordered box using box-drawing characters that adapts to
 * terminal width. Provides section separators and content padding.
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { box, colors } from '../theme.js';

/** Maximum box width to prevent layout conflicts with other components */
const MAX_BOX_WIDTH = 80;

export interface SummaryBoxProps {
  /** Child content to render inside the box */
  children: React.ReactNode;
  /** Minimum box width in columns (default: 60) */
  minWidth?: number;
}

/**
 * Props for SummaryBoxSection component
 */
export interface SummaryBoxSectionProps {
  /** Section content */
  children: React.ReactNode;
}

/**
 * SummaryBox component
 *
 * Renders a bordered box with top/bottom borders and section separators.
 * Adapts to terminal width while respecting minimum width.
 *
 * @example
 * ```tsx
 * <SummaryBox>
 *   <Text>Header content</Text>
 *   <SummaryBoxSection>
 *     <Text>Section 1</Text>
 *   </SummaryBoxSection>
 * </SummaryBox>
 * ```
 */
export function SummaryBox({
  children,
  minWidth = 60,
}: SummaryBoxProps): React.ReactElement {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;
  // Use terminal width, clamped between minWidth and MAX_BOX_WIDTH
  const boxWidth = Math.min(Math.max(minWidth, terminalWidth), MAX_BOX_WIDTH);
  const contentWidth = boxWidth - 4; // Account for borders and padding

  // Top border: ┌─────┐
  const topBorder = box.topLeft + box.horizontal.repeat(boxWidth - 2) + box.topRight;

  // Bottom border: └─────┘
  const bottomBorder = box.bottomLeft + box.horizontal.repeat(boxWidth - 2) + box.bottomRight;

  // Section separator: ├─────┤
  const leftJunction = '\u251c'; // ├
  const rightJunction = '\u2524'; // ┤
  const sectionSeparator = leftJunction + box.horizontal.repeat(boxWidth - 2) + rightJunction;

  const elements: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (!child) return;

    // Check if this is a SummaryBoxSection
    if (
      React.isValidElement<SummaryBoxSectionProps>(child) &&
      child.type === SummaryBoxSection
    ) {
      // Add section separator line
      elements.push(
        <Text key={`sep-${elements.length}`} color={colors.separator}>
          {sectionSeparator}
        </Text>
      );

      // Add the section content (children of SummaryBoxSection)
      const sectionChildren = child.props.children;
      React.Children.forEach(sectionChildren, (sectionChild) => {
        if (sectionChild) {
          elements.push(sectionChild);
        }
      });
    } else {
      // Regular content
      elements.push(child);
    }
  });

  return (
    <Box flexDirection="column" width={boxWidth}>
      {/* Top border */}
      <Text color={colors.separator}>{topBorder}</Text>

      {/* Content area with side borders */}
      <Box flexDirection="column">
        {elements.map((child, index) => {
          // Check if this is a separator line (Text with the separator)
          if (
            React.isValidElement<{ children?: string; color?: string }>(child) &&
            child.type === Text &&
            typeof child.props.children === 'string' &&
            child.props.children.startsWith(leftJunction)
          ) {
            // Render separator without side borders
            return <React.Fragment key={index}>{child}</React.Fragment>;
          }

          // Wrap regular content with vertical borders
          return (
            <Box key={index} flexDirection="row" width={boxWidth}>
              <Text color={colors.separator}>{box.vertical} </Text>
              <Box width={contentWidth} flexShrink={0} overflow="hidden">
                {child}
              </Box>
              <Text color={colors.separator}> {box.vertical}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Bottom border */}
      <Text color={colors.separator}>{bottomBorder}</Text>
    </Box>
  );
}

/**
 * SummaryBoxSection component
 *
 * Marks a section boundary within a SummaryBox. The parent SummaryBox
 * will render a separator line (├─────┤) before this section's content.
 *
 * This is a marker component - the actual rendering is handled by SummaryBox.
 *
 * @example
 * ```tsx
 * <SummaryBox>
 *   <Text>Header</Text>
 *   <SummaryBoxSection>
 *     <Text>Section content</Text>
 *   </SummaryBoxSection>
 * </SummaryBox>
 * ```
 */
export function SummaryBoxSection({
  children,
}: SummaryBoxSectionProps): React.ReactElement {
  // This component is just a marker - actual rendering happens in SummaryBox
  return <>{children}</>;
}
