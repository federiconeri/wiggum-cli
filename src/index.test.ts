import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRenderApp } = vi.hoisted(() => {
  const mockRenderApp = vi.fn().mockReturnValue({
    unmount: vi.fn(),
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
  });
  return { mockRenderApp };
});

// Mock all heavy dependencies before imports
vi.mock('./utils/env.js', () => ({
  loadApiKeysFromEnvLocal: vi.fn(),
}));

vi.mock('./utils/update-check.js', () => ({
  notifyIfUpdateAvailable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./utils/config.js', () => ({
  hasConfig: vi.fn().mockReturnValue(false),
  loadConfigWithDefaults: vi.fn().mockResolvedValue(null),
}));

vi.mock('./ai/providers.js', () => ({
  getAvailableProvider: vi.fn().mockReturnValue('anthropic'),
  isAnthropicAlias: vi.fn().mockReturnValue(false),
  AVAILABLE_MODELS: {
    anthropic: [{ value: 'sonnet', label: 'Sonnet', hint: 'recommended' }],
    openai: [{ value: 'gpt-4o', label: 'GPT-4o' }],
    openrouter: [{ value: 'auto', label: 'Auto' }],
  },
}));

vi.mock('./repl/session-state.js', () => ({
  createSessionState: vi.fn(
    (root: string, provider: string | null, model: string) => ({
      projectRoot: root,
      config: null,
      provider,
      model,
      conversationMode: false,
      initialized: false,
    }),
  ),
}));

vi.mock('./tui/app.js', () => ({
  renderApp: mockRenderApp,
}));

vi.mock('./utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { main } from './index.js';

describe('main', () => {
  let originalArgv: string[];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleLogSpy.mockRestore();
  });

  it('no args → screen="shell"', async () => {
    process.argv = ['node', 'ralph.js'];
    await main();

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'shell' }),
    );
  });

  it('init → screen="init"', async () => {
    process.argv = ['node', 'ralph.js', 'init'];
    await main();

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'init' }),
    );
  });

  it('new my-feature → screen="interview" with featureName', async () => {
    process.argv = ['node', 'ralph.js', 'new', 'my-feature'];
    await main();

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: 'interview',
        interviewProps: expect.objectContaining({
          featureName: 'my-feature',
        }),
      }),
    );
  });

  it('--help → stdout output, no renderApp', async () => {
    process.argv = ['node', 'ralph.js', '--help'];
    await main();

    expect(consoleLogSpy).toHaveBeenCalled();
    const helpText = consoleLogSpy.mock.calls[0][0] as string;
    expect(helpText).toContain('wiggum');
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('-h → stdout output, no renderApp', async () => {
    process.argv = ['node', 'ralph.js', '-h'];
    await main();

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('--version → stdout output, no renderApp', async () => {
    process.argv = ['node', 'ralph.js', '--version'];
    await main();

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('-v → stdout output, no renderApp', async () => {
    process.argv = ['node', 'ralph.js', '-v'];
    await main();

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(mockRenderApp).not.toHaveBeenCalled();
  });
});
