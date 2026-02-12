import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { AppShell } from './AppShell.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';

describe('AppShell', () => {
  const defaultFooter = { action: 'Test Action' };

  it('renders header zone', () => {
    const { lastFrame, unmount } = render(
      <AppShell header={<Text>TEST HEADER</Text>} footerStatus={defaultFooter}>
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('TEST HEADER');
    unmount();
  });

  it('renders content children', () => {
    const { lastFrame, unmount } = render(
      <AppShell header={<Text>H</Text>} footerStatus={defaultFooter}>
        <Text>CONTENT AREA</Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('CONTENT AREA');
    unmount();
  });

  it('renders footer status bar', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>H</Text>}
        footerStatus={{ action: 'New Spec', phase: 'Context (1/4)', path: 'my-feature' }}
      >
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('New Spec');
    expect(frame).toContain('Context (1/4)');
    expect(frame).toContain('my-feature');
    unmount();
  });

  it('renders tips bar when tips prop is provided', () => {
    const { lastFrame, unmount } = render(
      <AppShell header={<Text>H</Text>} tips="Tip: /help for commands" footerStatus={defaultFooter}>
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('/help');
    expect(frame).toContain('for commands');
    unmount();
  });

  it('does not render tips bar when tips is null', () => {
    const { lastFrame, unmount } = render(
      <AppShell header={<Text>H</Text>} tips={null} footerStatus={defaultFooter}>
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain('/help');
    unmount();
  });

  it('renders spinner when isWorking is true', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>H</Text>}
        isWorking={true}
        workingStatus="Analyzing codebase..."
        workingHint="esc to cancel"
        footerStatus={defaultFooter}
      >
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Analyzing codebase...');
    expect(frame).toContain('esc to cancel');
    unmount();
  });

  it('does not render spinner when isWorking is false', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>H</Text>}
        isWorking={false}
        workingStatus="Should not appear"
        footerStatus={defaultFooter}
      >
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain('Should not appear');
    unmount();
  });

  it('renders input element in footer zone', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>H</Text>}
        input={<Text>INPUT PROMPT</Text>}
        footerStatus={defaultFooter}
      >
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('INPUT PROMPT');
    unmount();
  });

  it('renders error toast when error prop is provided', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>H</Text>}
        error="Something went wrong"
        footerStatus={defaultFooter}
      >
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Something went wrong');
    unmount();
  });

  it('does not render error toast when error is null', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>H</Text>}
        error={null}
        footerStatus={defaultFooter}
      >
        <Text> </Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain('Something went wrong');
    unmount();
  });

  it('renders all zones together', () => {
    const { lastFrame, unmount } = render(
      <AppShell
        header={<Text>BANNER</Text>}
        tips="Tip: /new to create"
        isWorking={true}
        workingStatus="Working..."
        input={<Text>PROMPT</Text>}
        footerStatus={{ action: 'Shell', phase: 'Ready', path: '/project' }}
      >
        <Text>MAIN CONTENT</Text>
      </AppShell>,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('BANNER');
    expect(frame).toContain('/new');
    expect(frame).toContain('MAIN CONTENT');
    expect(frame).toContain('Working...');
    expect(frame).toContain('PROMPT');
    expect(frame).toContain('Shell');
    unmount();
  });
});
