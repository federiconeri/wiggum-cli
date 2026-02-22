import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRenderApp, mockRunCommand, mockMonitorCommand, mockHandleConfigCommand, mockIsCI } = vi.hoisted(() => {
  const mockRenderApp = vi.fn().mockReturnValue({
    unmount: vi.fn(),
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
  });
  const mockRunCommand = vi.fn().mockResolvedValue(undefined);
  const mockMonitorCommand = vi.fn().mockResolvedValue(undefined);
  const mockHandleConfigCommand = vi.fn().mockImplementation((args: string[], state: unknown) =>
    Promise.resolve(state)
  );
  const mockIsCI = vi.fn().mockReturnValue(false);
  return { mockRenderApp, mockRunCommand, mockMonitorCommand, mockHandleConfigCommand, mockIsCI };
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

vi.mock('./commands/run.js', () => ({
  runCommand: mockRunCommand,
}));

vi.mock('./commands/monitor.js', () => ({
  monitorCommand: mockMonitorCommand,
}));

vi.mock('./utils/ci.js', () => ({
  isCI: mockIsCI,
}));

vi.mock('./commands/config.js', () => ({
  handleConfigCommand: mockHandleConfigCommand,
}));

import { main, parseCliArgs } from './index.js';

// ─── parseCliArgs unit tests ──────────────────────────────────────────────────

describe('parseCliArgs', () => {
  it('empty argv → empty result', () => {
    expect(parseCliArgs([])).toEqual({ command: undefined, positionalArgs: [], flags: {} });
  });

  it('single command', () => {
    expect(parseCliArgs(['run'])).toEqual({ command: 'run', positionalArgs: [], flags: {} });
  });

  it('command with positional arg', () => {
    expect(parseCliArgs(['run', 'my-feature'])).toEqual({
      command: 'run',
      positionalArgs: ['my-feature'],
      flags: {},
    });
  });

  it('boolean flag', () => {
    expect(parseCliArgs(['--worktree'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { worktree: true },
    });
  });

  it('value flag with space', () => {
    expect(parseCliArgs(['--model', 'sonnet'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { model: 'sonnet' },
    });
  });

  it('value flag with = syntax', () => {
    expect(parseCliArgs(['--model=claude-opus'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { model: 'claude-opus' },
    });
    expect(parseCliArgs(['--max-iterations=5'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { maxIterations: '5' },
    });
  });

  it('kebab-case flags normalized to camelCase', () => {
    expect(parseCliArgs(['--max-iterations', '5'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { maxIterations: '5' },
    });
    expect(parseCliArgs(['--max-e2e-attempts', '3'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { maxE2eAttempts: '3' },
    });
    expect(parseCliArgs(['--review-mode', 'auto'])).toEqual({
      command: undefined,
      positionalArgs: [],
      flags: { reviewMode: 'auto' },
    });
  });

  it('short flags normalized', () => {
    expect(parseCliArgs(['-i'])).toEqual({ command: undefined, positionalArgs: [], flags: { interactive: true } });
    expect(parseCliArgs(['-y'])).toEqual({ command: undefined, positionalArgs: [], flags: { yes: true } });
    expect(parseCliArgs(['-e'])).toEqual({ command: undefined, positionalArgs: [], flags: { edit: true } });
    expect(parseCliArgs(['-f'])).toEqual({ command: undefined, positionalArgs: [], flags: { force: true } });
    expect(parseCliArgs(['-h'])).toEqual({ command: undefined, positionalArgs: [], flags: { help: true } });
    expect(parseCliArgs(['-v'])).toEqual({ command: undefined, positionalArgs: [], flags: { version: true } });
  });

  it('--help and --version become flags', () => {
    expect(parseCliArgs(['--help'])).toEqual({ command: undefined, positionalArgs: [], flags: { help: true } });
    expect(parseCliArgs(['--version'])).toEqual({ command: undefined, positionalArgs: [], flags: { version: true } });
  });

  it('mixed: command + positional + multiple flags', () => {
    const result = parseCliArgs(['run', 'my-feature', '--worktree', '--model', 'sonnet', '--max-iterations', '10']);
    expect(result).toEqual({
      command: 'run',
      positionalArgs: ['my-feature'],
      flags: { worktree: true, model: 'sonnet', maxIterations: '10' },
    });
  });

  it('multiple short flags', () => {
    const result = parseCliArgs(['init', '-i', '-y', '--provider', 'anthropic']);
    expect(result).toEqual({
      command: 'init',
      positionalArgs: [],
      flags: { interactive: true, yes: true, provider: 'anthropic' },
    });
  });

  it('value flag next to a flag starting with -- is treated as boolean', () => {
    // --model followed by another flag (no value)
    const result = parseCliArgs(['--model', '--resume']);
    expect(result.flags.model).toBe(true);
    expect(result.flags.resume).toBe(true);
  });

  it('flags before command still parsed', () => {
    // Edge case: flags can appear in any position
    const result = parseCliArgs(['--worktree', 'run', 'my-feature']);
    expect(result.command).toBe('run');
    expect(result.positionalArgs).toEqual(['my-feature']);
    expect(result.flags.worktree).toBe(true);
  });

  it('--stream flag parsed as boolean', () => {
    expect(parseCliArgs(['monitor', 'foo', '--stream'])).toEqual({
      command: 'monitor',
      positionalArgs: ['foo'],
      flags: { stream: true },
    });
  });
});

// ─── main() routing tests ──────────────────────────────────────────────────────

describe('main', () => {
  let originalArgv: string[];
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  // ─── Existing routing ───────────────────────────────────────────────────────

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

  // ─── Help text completeness ──────────────────────────────────────────────────

  it('--help lists all CLI commands', async () => {
    process.argv = ['node', 'ralph.js', '--help'];
    await main();

    const helpText = consoleLogSpy.mock.calls[0][0] as string;
    expect(helpText).toContain('init');
    expect(helpText).toContain('new');
    expect(helpText).toContain('run');
    expect(helpText).toContain('monitor');
    expect(helpText).toContain('config');
  });

  it('--help lists all TUI slash commands', async () => {
    process.argv = ['node', 'ralph.js', '--help'];
    await main();

    const helpText = consoleLogSpy.mock.calls[0][0] as string;
    expect(helpText).toContain('/init');
    expect(helpText).toContain('/new');
    expect(helpText).toContain('/run');
    expect(helpText).toContain('/monitor');
    expect(helpText).toContain('/sync');
    expect(helpText).toContain('/config');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/exit');
  });

  // ─── run command routing ─────────────────────────────────────────────────────

  it('run my-feature → calls runCommand with feature name', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith('my-feature', expect.any(Object));
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('run my-feature --worktree --resume → passes boolean flags', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--worktree', '--resume'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ worktree: true, resume: true }),
    );
  });

  it('run my-feature --model sonnet → passes model', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--model', 'sonnet'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ model: 'sonnet' }),
    );
  });

  it('run my-feature --max-iterations 5 → passes numeric maxIterations', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--max-iterations', '5'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ maxIterations: 5 }),
    );
  });

  it('run my-feature --max-e2e-attempts 3 → passes numeric maxE2eAttempts', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--max-e2e-attempts', '3'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ maxE2eAttempts: 3 }),
    );
  });

  it('run my-feature --review-mode auto → passes reviewMode', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--review-mode', 'auto'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ reviewMode: 'auto' }),
    );
  });

  it('run (no feature) → error + exit(1)', async () => {
    process.argv = ['node', 'ralph.js', 'run'];

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockRunCommand).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('<feature>'));
  });

  it('run my-feature --max-iterations abc → error + exit(1) for non-numeric value', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--max-iterations', 'abc'];

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockRunCommand).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--max-iterations'));
  });

  it('run my-feature --max-iterations=5 → passes numeric maxIterations via = syntax', async () => {
    process.argv = ['node', 'ralph.js', 'run', 'my-feature', '--max-iterations=5'];
    await main();

    expect(mockRunCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ maxIterations: 5 }),
    );
  });

  // ─── monitor command routing ──────────────────────────────────────────────────

  it('monitor my-feature → calls monitorCommand with feature name', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature'];
    await main();

    expect(mockMonitorCommand).toHaveBeenCalledWith('my-feature', expect.any(Object));
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('monitor my-feature --bash → passes bash flag', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature', '--bash'];
    await main();

    expect(mockMonitorCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ bash: true }),
    );
  });

  it('monitor my-feature --interval 3 → passes numeric interval', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature', '--interval', '3'];
    await main();

    expect(mockMonitorCommand).toHaveBeenCalledWith(
      'my-feature',
      expect.objectContaining({ interval: 3 }),
    );
  });

  it('monitor (no feature) → error + exit(1)', async () => {
    process.argv = ['node', 'ralph.js', 'monitor'];

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockMonitorCommand).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('<feature>'));
  });

  it('monitor my-feature --interval abc → error + exit(1) for non-numeric value', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature', '--interval', 'abc'];

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockMonitorCommand).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--interval'));
  });

  it('monitor my-feature --stream → calls monitorCommand (headless) even in TTY', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature', '--stream'];
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    try {
      await main();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }

    expect(mockMonitorCommand).toHaveBeenCalledWith('my-feature', expect.any(Object));
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('monitor my-feature in TTY (no CI) → starts Ink TUI in monitor-only mode', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature'];
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    mockIsCI.mockReturnValue(false);

    try {
      await main();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
      mockIsCI.mockReturnValue(false);
    }

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: 'run',
        runProps: expect.objectContaining({ featureName: 'my-feature', monitorOnly: true }),
      }),
    );
    expect(mockMonitorCommand).not.toHaveBeenCalled();
  });

  it('monitor my-feature in CI (even with TTY) → calls monitorCommand (headless)', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature'];
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    mockIsCI.mockReturnValue(true);

    try {
      await main();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
      mockIsCI.mockReturnValue(false);
    }

    expect(mockMonitorCommand).toHaveBeenCalledWith('my-feature', expect.any(Object));
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('monitor my-feature in non-TTY → calls monitorCommand (headless)', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature'];
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    try {
      await main();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }

    expect(mockMonitorCommand).toHaveBeenCalledWith('my-feature', expect.any(Object));
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('monitor my-feature in TTY with TUI error → falls back to monitorCommand', async () => {
    process.argv = ['node', 'ralph.js', 'monitor', 'my-feature'];
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    mockIsCI.mockReturnValue(false);
    mockRenderApp.mockImplementationOnce(() => {
      throw new Error('Ink initialization failed');
    });

    try {
      await main();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
      mockIsCI.mockReturnValue(false);
    }

    expect(mockMonitorCommand).toHaveBeenCalledWith('my-feature', expect.any(Object));
  });

  // ─── config command routing ───────────────────────────────────────────────────

  it('config → calls handleConfigCommand with empty args', async () => {
    process.argv = ['node', 'ralph.js', 'config'];
    await main();

    expect(mockHandleConfigCommand).toHaveBeenCalledWith([], expect.any(Object));
    expect(mockRenderApp).not.toHaveBeenCalled();
  });

  it('config set tavily abc123 → calls handleConfigCommand with args', async () => {
    process.argv = ['node', 'ralph.js', 'config', 'set', 'tavily', 'abc123'];
    await main();

    expect(mockHandleConfigCommand).toHaveBeenCalledWith(
      ['set', 'tavily', 'abc123'],
      expect.any(Object),
    );
  });

  it('config passes valid session state with projectRoot', async () => {
    process.argv = ['node', 'ralph.js', 'config'];
    await main();

    expect(mockHandleConfigCommand).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        projectRoot: expect.any(String),
        provider: 'anthropic',
        model: 'sonnet',
      }),
    );
  });

  // ─── init / new flag parsing ──────────────────────────────────────────────────

  it('init --provider anthropic → starts init TUI (flags parsed, not blocking)', async () => {
    process.argv = ['node', 'ralph.js', 'init', '--provider', 'anthropic'];
    await main();

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'init' }),
    );
  });

  it('init -i -y → starts init TUI', async () => {
    process.argv = ['node', 'ralph.js', 'init', '-i', '-y'];
    await main();

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'init' }),
    );
  });

  it('new (no feature name) → error + exit(1)', async () => {
    process.argv = ['node', 'ralph.js', 'new'];

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockRenderApp).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('<name>'));
  });

  it('new my-feature --provider anthropic --model sonnet -e -f → starts interview TUI', async () => {
    process.argv = ['node', 'ralph.js', 'new', 'my-feature', '--provider', 'anthropic', '--model', 'sonnet', '-e', '-f'];
    await main();

    expect(mockRenderApp).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: 'interview',
        interviewProps: expect.objectContaining({ featureName: 'my-feature' }),
      }),
    );
  });
});
