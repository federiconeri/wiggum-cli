/**
 * Tests for SummaryBox component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { SummaryBox, SummaryBoxSection } from './SummaryBox.js';

// Mock useStdout to control terminal width in tests
vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    useStdout: () => ({
      stdout: {
        columns: (process.stdout as any).columns || 100,
      },
      write: () => {},
    }),
  };
});

describe('SummaryBox', () => {
  let originalStdout: typeof process.stdout.columns;

  beforeEach(() => {
    originalStdout = process.stdout.columns;
  });

  afterEach(() => {
    if (originalStdout !== undefined) {
      (process.stdout as any).columns = originalStdout;
    }
  });

  it('renders a bordered box with content', () => {
    (process.stdout as any).columns = 80;

    const { lastFrame } = render(
      <SummaryBox>
        <Text>Test content</Text>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';

    // Should contain top border
    expect(output).toContain('┌');
    expect(output).toContain('┐');

    // Should contain bottom border
    expect(output).toContain('└');
    expect(output).toContain('┘');

    // Should contain vertical borders
    expect(output).toContain('│');

    // Should contain the content
    expect(output).toContain('Test content');
  });

  it('respects minimum width of 60 columns', () => {
    (process.stdout as any).columns = 40; // Less than minWidth

    const { lastFrame } = render(
      <SummaryBox>
        <Text>Content</Text>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';
    const lines = output.split('\n');
    const topBorderLine = lines.find((line) => line.includes('┌'));

    // Top border should be at least 60 chars wide
    expect(topBorderLine).toBeDefined();
    if (topBorderLine) {
      // Remove ANSI codes for accurate length check
      const cleanLine = topBorderLine.replace(/\u001b\[\d+m/g, '');
      expect(cleanLine.length).toBeGreaterThanOrEqual(60);
    }
  });

  it('adapts to terminal width', () => {
    (process.stdout as any).columns = 100;

    const { lastFrame } = render(
      <SummaryBox>
        <Text>Content</Text>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';
    const lines = output.split('\n');
    const topBorderLine = lines.find((line) => line.includes('┌'));

    expect(topBorderLine).toBeDefined();
    if (topBorderLine) {
      // Remove ANSI codes
      const cleanLine = topBorderLine.replace(/\u001b\[\d+m/g, '');
      // Should use terminal width
      expect(cleanLine.length).toBeGreaterThanOrEqual(80);
      expect(cleanLine.length).toBeLessThanOrEqual(105);
    }
  });

  it('renders multiple children with borders', () => {
    (process.stdout as any).columns = 80;

    const { lastFrame } = render(
      <SummaryBox>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';

    // Each line should be wrapped with vertical borders
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).toContain('Line 3');

    // Should have vertical borders on multiple lines
    const lines = output.split('\n');
    const contentLines = lines.filter((line) => line.includes('│'));
    expect(contentLines.length).toBeGreaterThan(2);
  });

  it('handles custom minWidth', () => {
    (process.stdout as any).columns = 100;

    const { lastFrame } = render(
      <SummaryBox minWidth={70}>
        <Text>Content</Text>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';
    const lines = output.split('\n');
    const topBorderLine = lines.find((line) => line.includes('┌'));

    expect(topBorderLine).toBeDefined();
    if (topBorderLine) {
      const cleanLine = topBorderLine.replace(/\u001b\[\d+m/g, '');
      expect(cleanLine.length).toBeGreaterThanOrEqual(70);
    }
  });
});

describe('SummaryBoxSection', () => {
  beforeEach(() => {
    (process.stdout as any).columns = 80;
  });

  it('renders a section separator', () => {
    const { lastFrame } = render(
      <SummaryBox>
        <Text>Header</Text>
        <SummaryBoxSection>
          <Text>Section content</Text>
        </SummaryBoxSection>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';

    // Should contain section separator T-junctions
    expect(output).toContain('├');
    expect(output).toContain('┤');

    // Should contain content
    expect(output).toContain('Header');
    expect(output).toContain('Section content');
  });

  it('renders multiple sections', () => {
    const { lastFrame } = render(
      <SummaryBox>
        <Text>Header</Text>
        <SummaryBoxSection>
          <Text>Section 1</Text>
        </SummaryBoxSection>
        <SummaryBoxSection>
          <Text>Section 2</Text>
        </SummaryBoxSection>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';

    // Should have multiple section separators
    const separatorCount = (output.match(/├/g) || []).length;
    expect(separatorCount).toBeGreaterThanOrEqual(2);

    expect(output).toContain('Section 1');
    expect(output).toContain('Section 2');
  });

  it('handles content truncation without breaking borders', () => {
    (process.stdout as any).columns = 60;

    const longText = 'This is a very long line of text that should be truncated or wrapped without breaking the box borders';

    const { lastFrame } = render(
      <SummaryBox>
        <SummaryBoxSection>
          <Text>{longText}</Text>
        </SummaryBoxSection>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';

    // Box structure should remain intact
    expect(output).toContain('┌');
    expect(output).toContain('└');
    expect(output).toContain('│');
    expect(output).toContain('├');
    expect(output).toContain('┤');
  });

  it('renders correctly at 80 columns (standard terminal width)', () => {
    (process.stdout as any).columns = 80;

    const { lastFrame } = render(
      <SummaryBox>
        <Text>Feature Name Complete</Text>
        <SummaryBoxSection>
          <Text>Duration: 12m 34s</Text>
          <Text>Iterations: 11 (10 impl + 1 resume)</Text>
          <Text>Tasks: 8/8 completed</Text>
        </SummaryBoxSection>
        <SummaryBoxSection>
          <Text bold>Phases</Text>
          <Text>✓ Planning 2m 15s</Text>
          <Text>✓ Implementation 8m 42s (10 iterations)</Text>
          <Text>○ E2E Testing skipped</Text>
        </SummaryBoxSection>
      </SummaryBox>
    );

    const output = lastFrame() ?? '';
    const lines = output.split('\n');

    // Verify box structure is intact
    expect(output).toContain('┌');
    expect(output).toContain('└');
    expect(output).toContain('┐');
    expect(output).toContain('┘');
    expect(output).toContain('├');
    expect(output).toContain('┤');

    // Check that no line exceeds 80 columns
    for (const line of lines) {
      const cleanLine = line.replace(/\u001b\[\d+m/g, ''); // Remove ANSI codes
      expect(cleanLine.length).toBeLessThanOrEqual(80);
    }

    // Verify all content is present
    expect(output).toContain('Feature Name Complete');
    expect(output).toContain('Duration: 12m 34s');
    expect(output).toContain('Phases');
    expect(output).toContain('Planning');
  });
});
