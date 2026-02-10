import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ChatInput } from './ChatInput.js';
import { stripAnsi, wait, type as typeText, pressEnter, renderAndWait } from '../../__test-utils__/ink-helpers.js';

describe('ChatInput', () => {
  it('shows placeholder when empty', () => {
    const onSubmit = vi.fn();
    const { lastFrame, unmount } = render(
      <ChatInput onSubmit={onSubmit} placeholder="Type here..." />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Type here...');
    unmount();
  });

  it('shows prompt character', () => {
    const onSubmit = vi.fn();
    const { lastFrame, unmount } = render(
      <ChatInput onSubmit={onSubmit} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('›');
    unmount();
  });

  it('typing updates the display', async () => {
    const onSubmit = vi.fn();
    const instance = await renderAndWait(
      () => render(<ChatInput onSubmit={onSubmit} />),
    );

    await typeText(instance, 'hello');

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('hello');
    instance.unmount();
  });

  it('Enter calls onSubmit with value and clears input', async () => {
    const onSubmit = vi.fn();
    const instance = await renderAndWait(
      () => render(<ChatInput onSubmit={onSubmit} />),
    );

    await typeText(instance, 'test message');
    pressEnter(instance);
    await wait(30);

    expect(onSubmit).toHaveBeenCalledWith('test message');

    // Input should be cleared after submit (placeholder reappears)
    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Type your message...');
    instance.unmount();
  });

  it('does not submit empty value when allowEmpty is false', async () => {
    const onSubmit = vi.fn();
    const instance = await renderAndWait(
      () => render(<ChatInput onSubmit={onSubmit} allowEmpty={false} />),
    );

    pressEnter(instance);
    await wait(30);

    expect(onSubmit).not.toHaveBeenCalled();
    instance.unmount();
  });

  it('submits empty value when allowEmpty is true', async () => {
    const onSubmit = vi.fn();
    const instance = await renderAndWait(
      () => render(<ChatInput onSubmit={onSubmit} allowEmpty={true} />),
    );

    pressEnter(instance);
    await wait(30);

    expect(onSubmit).toHaveBeenCalledWith('');
    instance.unmount();
  });

  it('shows waiting message when disabled', () => {
    const onSubmit = vi.fn();
    const { lastFrame, unmount } = render(
      <ChatInput onSubmit={onSubmit} disabled={true} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('waiting for Wiggum');
    unmount();
  });

  it('shows command dropdown when typing /', async () => {
    const onSubmit = vi.fn();
    const instance = await renderAndWait(
      () => render(<ChatInput onSubmit={onSubmit} />),
    );

    await typeText(instance, '/');

    const frame = stripAnsi(instance.lastFrame() ?? '');
    // Default commands should appear in dropdown
    expect(frame).toContain('init');
    expect(frame).toContain('help');
    instance.unmount();
  });
});
