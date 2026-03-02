import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const {
  mockScan,
  mockEnhance,
  mockSaveContext,
  mockToPersistedScanResult,
  mockToPersistedAIAnalysis,
  mockGetGitMetadata,
  mockGetAvailableProvider,
} = vi.hoisted(() => ({
  mockScan: vi.fn(),
  mockEnhance: vi.fn(),
  mockSaveContext: vi.fn(),
  mockToPersistedScanResult: vi.fn().mockReturnValue({ mocked: 'scanResult' }),
  mockToPersistedAIAnalysis: vi.fn().mockReturnValue({ mocked: 'aiAnalysis' }),
  mockGetGitMetadata: vi.fn().mockResolvedValue({
    gitCommitHash: 'abc123',
    gitBranch: 'main',
  }),
  mockGetAvailableProvider: vi.fn().mockReturnValue('anthropic'),
}));

vi.mock('../scanner/index.js', () => {
  class MockScanner {
    scan = mockScan;
  }
  return { Scanner: MockScanner };
});

vi.mock('../ai/enhancer.js', () => {
  class MockAIEnhancer {
    enhance = mockEnhance;
    constructor() {}
  }
  return { AIEnhancer: MockAIEnhancer };
});

vi.mock('../context/index.js', () => ({
  saveContext: mockSaveContext,
  toPersistedScanResult: mockToPersistedScanResult,
  toPersistedAIAnalysis: mockToPersistedAIAnalysis,
  getGitMetadata: mockGetGitMetadata,
}));

vi.mock('../ai/providers.js', () => ({
  getAvailableProvider: mockGetAvailableProvider,
  AVAILABLE_MODELS: {
    anthropic: [{ value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: 'recommended' }],
    openai: [
      { value: 'gpt-5.2', label: 'GPT-5.2', hint: 'most capable' },
      { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', hint: 'best for code' },
    ],
  },
  normalizeModelId: vi.fn((_provider: string, modelId: string) => modelId),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { syncCommand, syncProjectContext } from './sync.js';

describe('syncProjectContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableProvider.mockReturnValue('anthropic');
    mockScan.mockResolvedValue({ files: [], detections: [] });
    mockEnhance.mockResolvedValue({
      files: [],
      detections: [],
      aiAnalysis: { summary: 'test' },
    });
    mockSaveContext.mockResolvedValue(undefined);
  });

  it('scans, enhances, saves context, and returns path', async () => {
    const result = await syncProjectContext('/fake/project');

    expect(result).toContain('.context.json');
    expect(mockScan).toHaveBeenCalledOnce();
    expect(mockEnhance).toHaveBeenCalledOnce();
    expect(mockGetGitMetadata).toHaveBeenCalledOnce();
    expect(mockSaveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        gitCommitHash: 'abc123',
        gitBranch: 'main',
      }),
      '/fake/project',
    );
  });

  it('throws when no provider available', async () => {
    mockGetAvailableProvider.mockReturnValue(null);

    await expect(syncProjectContext('/fake/project')).rejects.toThrow(
      'No AI provider available',
    );
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('throws when AI enhancement fails', async () => {
    mockEnhance.mockResolvedValue({
      files: [],
      detections: [],
      aiError: 'Model rate limited',
    });

    await expect(syncProjectContext('/fake/project')).rejects.toThrow(
      'AI analysis failed',
    );
    expect(mockSaveContext).not.toHaveBeenCalled();
  });

  it('propagates scanner errors', async () => {
    mockScan.mockRejectedValue(new Error('Permission denied'));

    await expect(syncProjectContext('/fake/project')).rejects.toThrow(
      'Permission denied',
    );
    expect(mockEnhance).not.toHaveBeenCalled();
  });

  it('works with OpenAI provider', async () => {
    mockGetAvailableProvider.mockReturnValue('openai');

    const result = await syncProjectContext('/fake/project');

    expect(result).toContain('.context.json');
    expect(mockScan).toHaveBeenCalledOnce();
    expect(mockEnhance).toHaveBeenCalledOnce();
  });
});

describe('syncCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableProvider.mockReturnValue('anthropic');
    mockScan.mockResolvedValue({ files: [], detections: [] });
    mockEnhance.mockResolvedValue({
      files: [],
      detections: [],
      aiAnalysis: { summary: 'test' },
    });
    mockSaveContext.mockResolvedValue(undefined);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${code})`);
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('prints path and exits 0 on success', async () => {
    await expect(syncCommand()).rejects.toThrow('process.exit(0)');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('.context.json'),
    );
  });

  it('prints error and exits 1 when no provider', async () => {
    mockGetAvailableProvider.mockReturnValue(null);

    await expect(syncCommand()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No AI provider available'),
    );
  });

  it('prints error and exits 1 on AI failure', async () => {
    mockEnhance.mockResolvedValue({
      files: [],
      detections: [],
      aiError: 'Model rate limited',
    });

    await expect(syncCommand()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('AI analysis failed'),
    );
  });
});
