import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const {
  mockGetAvailableProvider,
  mockGetModel,
  mockDetectGitHubRemote,
  mockRunGitHubDiagnostics,
  mockCreateAgentOrchestrator,
  mockLoadConfigWithDefaults,
  mockGenerate,
  mockStream,
} = vi.hoisted(() => {
  const mockGenerate = vi.fn().mockResolvedValue({ text: 'Agent completed 3 issues.' });

  async function* fakeTextStream() {
    yield 'Streaming ';
    yield 'output';
  }
  const mockStream = vi.fn().mockResolvedValue({ textStream: fakeTextStream() });

  return {
    mockGetAvailableProvider: vi.fn().mockReturnValue('anthropic'),
    mockGetModel: vi.fn().mockReturnValue({
      model: { id: 'claude-sonnet-4-6' },
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    }),
    mockDetectGitHubRemote: vi.fn().mockResolvedValue({ owner: 'acme', repo: 'app' }),
    mockRunGitHubDiagnostics: vi.fn().mockResolvedValue({
      success: true,
      checks: [{ name: 'gh version', ok: true, message: 'ok' }],
    }),
    mockCreateAgentOrchestrator: vi.fn().mockImplementation(() => ({
      generate: mockGenerate,
      stream: mockStream,
    })),
    mockLoadConfigWithDefaults: vi.fn().mockResolvedValue({
      agent: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
      },
      loop: { defaultModel: 'sonnet' },
    }),
    mockGenerate,
    mockStream,
  };
});

vi.mock('../ai/providers.js', () => ({
  getAvailableProvider: mockGetAvailableProvider,
  getModel: mockGetModel,
}));

vi.mock('../utils/github.js', () => ({
  detectGitHubRemote: mockDetectGitHubRemote,
  runGitHubDiagnostics: mockRunGitHubDiagnostics,
}));

vi.mock('../utils/config.js', () => ({
  loadConfigWithDefaults: mockLoadConfigWithDefaults,
}));

vi.mock('../agent/orchestrator.js', () => ({
  createAgentOrchestrator: mockCreateAgentOrchestrator,
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { agentCommand } from './agent.js';

describe('agentCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableProvider.mockReturnValue('anthropic');
    mockDetectGitHubRemote.mockResolvedValue({ owner: 'acme', repo: 'app' });
    mockRunGitHubDiagnostics.mockResolvedValue({
      success: true,
      checks: [{ name: 'gh version', ok: true, message: 'ok' }],
    });
    mockGenerate.mockResolvedValue({ text: 'Agent completed 3 issues.' });
    mockCreateAgentOrchestrator.mockImplementation(() => ({
      generate: mockGenerate,
      stream: mockStream,
    }));
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
      },
      loop: { defaultModel: 'sonnet' },
    });

    mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${code})`);
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    mockExit.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  it('exits with error when no provider available (no config, no env)', async () => {
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: { defaultProvider: '', defaultModel: 'claude-sonnet-4-6' },
      loop: { defaultModel: 'sonnet' },
    });
    mockGetAvailableProvider.mockReturnValue(null);

    await expect(agentCommand()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No AI provider configured'),
    );
    expect(mockCreateAgentOrchestrator).not.toHaveBeenCalled();
  });

  it('exits with error when no GitHub remote detected', async () => {
    mockDetectGitHubRemote.mockResolvedValue(null);

    await expect(agentCommand()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No GitHub remote detected'),
    );
    expect(mockCreateAgentOrchestrator).not.toHaveBeenCalled();
  });

  it('creates orchestrator and runs generate in default (non-stream) mode', async () => {
    await agentCommand();

    expect(mockCreateAgentOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: expect.any(String),
        owner: 'acme',
        repo: 'app',
      }),
    );
    expect(mockGenerate).toHaveBeenCalledWith({ prompt: 'Begin working through the backlog.' });
    expect(consoleLogSpy).toHaveBeenCalledWith('Agent completed 3 issues.');
  });

  it('runs GitHub diagnostics without creating the orchestrator', async () => {
    mockRunGitHubDiagnostics.mockResolvedValue({
      success: true,
      checks: [
        { name: 'gh version', ok: true, message: 'ok' },
        { name: 'gh issue list', ok: true, message: 'ok' },
      ],
    });

    await agentCommand({ diagnoseGh: true, issues: [70] });

    expect(mockRunGitHubDiagnostics).toHaveBeenCalledWith('acme', 'app', 70);
    expect(mockCreateAgentOrchestrator).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('[diagnose-gh] OK gh version: ok');
    expect(consoleLogSpy).toHaveBeenCalledWith('[diagnose-gh] OK gh issue list: ok');
  });

  it('uses stream mode when --stream flag is set', async () => {
    async function* fakeTextStream() {
      yield 'Streaming ';
      yield 'output';
    }
    mockStream.mockResolvedValue({ textStream: fakeTextStream() });

    await agentCommand({ stream: true });

    expect(mockStream).toHaveBeenCalledWith({ prompt: 'Begin working through the backlog.' });
    expect(stdoutWriteSpy).toHaveBeenCalledWith('Streaming ');
    expect(stdoutWriteSpy).toHaveBeenCalledWith('output');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('streams orchestrator scheduler events to stdout in stream mode', async () => {
    let orchestratorConfig: any;
    mockCreateAgentOrchestrator.mockImplementation((config) => {
      orchestratorConfig = config;
      return {
        generate: mockGenerate,
        stream: vi.fn().mockImplementation(async () => {
          config.onOrchestratorEvent?.({
            type: 'backlog_progress',
            phase: 'enrichment',
            message: 'Enriching 3 issue(s) with details and feature state.',
            total: 3,
          });
          config.onOrchestratorEvent?.({
            type: 'backlog_timing',
            phase: 'dependency_inference',
            durationMs: 250,
            count: 3,
          });
          config.onOrchestratorEvent?.({ type: 'scope_expanded', expansions: [{ issueNumber: 69, requestedBy: [70] }] });
          config.onOrchestratorEvent?.({
            type: 'task_blocked',
            issue: {
              issueNumber: 70,
              title: 'Define structured loop action IPC',
              labels: ['loop'],
              phase: 'idle',
              actionability: 'blocked_dependency',
              blockedBy: [{ issueNumber: 69, reason: 'Explicit dependency on #69.' }],
            },
          });
          return {
            textStream: (async function* () {
              yield 'Summary';
            })(),
          };
        }),
      };
    });

    await agentCommand({ stream: true });

    expect(orchestratorConfig).toBeDefined();
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[orchestrator] Enriching 3 issue(s) with details and feature state.\n');
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[orchestrator] dependency_inference took 250ms (3)\n');
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[orchestrator] expanded scope with #69\n');
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[orchestrator] blocked #70 — Explicit dependency on #69.\n');
    expect(stdoutWriteSpy).toHaveBeenCalledWith('Summary');
  });

  it('passes maxSteps and maxItems to orchestrator config', async () => {
    await agentCommand({ maxSteps: 50, maxItems: 5 });

    expect(mockCreateAgentOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSteps: 50,
        maxItems: 5,
      }),
    );
  });

  it('passes dryRun to orchestrator config', async () => {
    await agentCommand({ dryRun: true });

    expect(mockCreateAgentOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
      }),
    );
  });

  it('uses model from config.agent.defaultModel', async () => {
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: { defaultProvider: 'anthropic', defaultModel: 'claude-opus-4-6' },
      loop: { defaultModel: 'sonnet' },
    });

    await agentCommand();

    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'claude-opus-4-6');
  });

  it('CLI --model flag overrides config', async () => {
    await agentCommand({ model: 'claude-opus-4-6' });

    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'claude-opus-4-6');
  });

  it('uses provider from config.agent.defaultProvider', async () => {
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: { defaultProvider: 'openrouter', defaultModel: 'google/gemini-3-pro-preview' },
      loop: { defaultModel: 'sonnet' },
    });

    await agentCommand();

    expect(mockGetModel).toHaveBeenCalledWith('openrouter', 'google/gemini-3-pro-preview');
  });

  it('falls back to env detection when config has no provider', async () => {
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: { defaultProvider: '', defaultModel: 'claude-sonnet-4-6' },
      loop: { defaultModel: 'sonnet' },
    });
    mockGetAvailableProvider.mockReturnValue('openai');

    await agentCommand();

    expect(mockGetModel).toHaveBeenCalledWith('openai', 'claude-sonnet-4-6');
  });

  it('passes labels to orchestrator config', async () => {
    await agentCommand({ labels: ['P0', 'bug'] });

    expect(mockCreateAgentOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['P0', 'bug'],
      }),
    );
  });

  it('catches generate errors and exits with user-friendly message', async () => {
    mockGenerate.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(agentCommand()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('API rate limit exceeded'),
    );
  });

  it('catches stream errors and exits with user-friendly message', async () => {
    mockStream.mockRejectedValue(new Error('Network timeout'));

    await expect(agentCommand({ stream: true })).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Network timeout'),
    );
  });

  it('prints a GitHub diagnostic hint when backlog fetch fails', async () => {
    mockStream.mockRejectedValue(new Error('Failed to fetch issue #70 from GitHub while expanding dependencies. Check gh connectivity.'));

    await expect(agentCommand({ stream: true, issues: [70] })).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Hint: run 'wiggum agent --diagnose-gh --issues 70'"),
    );
  });

  it('ignores invalid provider in config and falls back to env detection', async () => {
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: { defaultProvider: 'invalid-provider', defaultModel: 'some-model' },
      loop: { defaultModel: 'sonnet' },
    });
    mockGetAvailableProvider.mockReturnValue('anthropic');

    await agentCommand();

    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'some-model');
  });

  it('uses provider default model when config model is empty', async () => {
    mockLoadConfigWithDefaults.mockResolvedValue({
      agent: { defaultProvider: 'anthropic', defaultModel: '' },
      loop: { defaultModel: 'sonnet' },
    });

    await agentCommand();

    expect(mockGetModel).toHaveBeenCalledWith('anthropic', undefined);
  });
});
