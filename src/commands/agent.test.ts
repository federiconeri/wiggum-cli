import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const {
  mockGetAvailableProvider,
  mockGetModel,
  mockDetectGitHubRemote,
  mockCreateAgentOrchestrator,
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
    mockCreateAgentOrchestrator: vi.fn().mockImplementation(() => ({
      generate: mockGenerate,
      stream: mockStream,
    })),
    mockGenerate,
    mockStream,
  };
});

vi.mock('../ai/providers.js', () => ({
  getAvailableProvider: mockGetAvailableProvider,
  getModel: mockGetModel,
  AVAILABLE_MODELS: {
    anthropic: [
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', hint: 'recommended' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', hint: 'most capable' },
    ],
    openai: [{ value: 'gpt-5.2', label: 'GPT-5.2' }],
    openrouter: [{ value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro' }],
  },
}));

vi.mock('../utils/github.js', () => ({
  detectGitHubRemote: mockDetectGitHubRemote,
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
    mockGenerate.mockResolvedValue({ text: 'Agent completed 3 issues.' });

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

  it('exits with error when no AI provider available', async () => {
    mockGetAvailableProvider.mockReturnValue(null);

    await expect(agentCommand()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No AI provider available'),
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

  it('passes custom model to getModel', async () => {
    await agentCommand({ model: 'claude-opus-4-6' });

    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'claude-opus-4-6');
  });

  it('uses recommended model as default', async () => {
    await agentCommand();

    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4-6');
  });
});
