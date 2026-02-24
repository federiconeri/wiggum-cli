import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// Hoisted mocks
const {
  mockStart,
  mockAddReference,
  mockAddReferenceContent,
  mockAdvanceToGoals,
  mockSubmitGoals,
  mockSkipToGeneration,
  mockGetPhase,
  capturedOpts,
  mockGetAvailableProvider,
  mockHasConfig,
  mockLoadConfigWithDefaults,
  mockLoadContext,
  mockToScanResultFromPersisted,
  mockDetectGitHubRemote,
  mockFetchGitHubIssue,
  mockExistsSync,
  mockMkdirSync,
  mockWriteFileSync,
} = vi.hoisted(() => {
  const capturedOpts: { value: any } = { value: null };

  return {
    mockStart: vi.fn(),
    mockAddReference: vi.fn().mockResolvedValue(true),
    mockAddReferenceContent: vi.fn(),
    mockAdvanceToGoals: vi.fn(),
    mockSubmitGoals: vi.fn(),
    mockSkipToGeneration: vi.fn(),
    mockGetPhase: vi.fn().mockReturnValue('interview'),
    capturedOpts,
    mockGetAvailableProvider: vi.fn().mockReturnValue('anthropic'),
    mockHasConfig: vi.fn().mockReturnValue(false),
    mockLoadConfigWithDefaults: vi.fn().mockResolvedValue({
      paths: { specs: '.ralph/specs', root: '.ralph', scripts: '.ralph/scripts' },
      loop: { defaultModel: 'sonnet' },
    }),
    mockLoadContext: vi.fn().mockResolvedValue(null),
    mockToScanResultFromPersisted: vi.fn(),
    mockDetectGitHubRemote: vi.fn().mockResolvedValue(null),
    mockFetchGitHubIssue: vi.fn().mockResolvedValue(null),
    mockExistsSync: vi.fn().mockReturnValue(true),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
  };
});

vi.mock('../tui/orchestration/interview-orchestrator.js', () => {
  class MockOrchestrator {
    private opts: any;
    start: typeof mockStart;
    addReference: typeof mockAddReference;
    addReferenceContent: typeof mockAddReferenceContent;
    advanceToGoals: typeof mockAdvanceToGoals;
    submitGoals: typeof mockSubmitGoals;
    skipToGeneration: typeof mockSkipToGeneration;
    getPhase: typeof mockGetPhase;

    constructor(opts: any) {
      this.opts = opts;
      capturedOpts.value = opts;
      this.start = mockStart;
      this.addReference = mockAddReference;
      this.addReferenceContent = mockAddReferenceContent;
      this.advanceToGoals = mockAdvanceToGoals;
      this.submitGoals = mockSubmitGoals;
      this.skipToGeneration = mockSkipToGeneration;
      this.getPhase = mockGetPhase;
    }
  }
  return { InterviewOrchestrator: MockOrchestrator };
});

vi.mock('../ai/providers.js', () => ({
  getAvailableProvider: mockGetAvailableProvider,
  AVAILABLE_MODELS: {
    anthropic: [{ value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', hint: 'recommended' }],
  },
  normalizeModelId: vi.fn((_provider: string, modelId: string) => modelId),
  isAnthropicAlias: vi.fn().mockReturnValue(false),
}));

vi.mock('../utils/config.js', () => ({
  hasConfig: mockHasConfig,
  loadConfigWithDefaults: mockLoadConfigWithDefaults,
}));

vi.mock('../context/index.js', () => ({
  loadContext: mockLoadContext,
  toScanResultFromPersisted: mockToScanResultFromPersisted,
  getContextAge: vi.fn().mockReturnValue({ human: '1 hour' }),
}));

vi.mock('../utils/github.js', () => ({
  detectGitHubRemote: mockDetectGitHubRemote,
  fetchGitHubIssue: mockFetchGitHubIssue,
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { newAutoCommand } from './new-auto.js';

/**
 * Helper: make orchestrator callbacks fire the right events for a happy path.
 * The orchestrator calls onReady after start, advanceToGoals, and submitGoals.
 * Then onComplete fires after skipToGeneration.
 */
function setupHappyPath(spec = '# Test Spec\n\nGenerated spec content') {
  // start() → synchronously fire onReady
  mockStart.mockImplementation(async () => {
    capturedOpts.value.onReady();
  });

  // advanceToGoals() → fire onReady
  mockAdvanceToGoals.mockImplementation(async () => {
    capturedOpts.value.onReady();
  });

  // submitGoals() → fire onReady (interview phase)
  mockSubmitGoals.mockImplementation(async () => {
    capturedOpts.value.onPhaseChange('interview');
    capturedOpts.value.onReady();
  });

  // skipToGeneration() → fire onComplete with spec
  mockSkipToGeneration.mockImplementation(async () => {
    capturedOpts.value.onComplete(spec);
  });
}

describe('newAutoCommand', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset return values that may be changed by individual tests
    mockGetAvailableProvider.mockReturnValue('anthropic');
    mockHasConfig.mockReturnValue(false);
    mockLoadConfigWithDefaults.mockResolvedValue({
      paths: { specs: '.ralph/specs', root: '.ralph', scripts: '.ralph/scripts' },
      loop: { defaultModel: 'sonnet' },
    });
    mockLoadContext.mockResolvedValue(null);
    mockDetectGitHubRemote.mockResolvedValue(null);
    mockFetchGitHubIssue.mockResolvedValue(null);
    mockExistsSync.mockReturnValue(true);
    mockAddReference.mockResolvedValue(true);
    mockGetPhase.mockReturnValue('interview');

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

  it('happy path: creates spec and saves to disk', async () => {
    const testSpec = '# My Feature\n\nSpec content here.';
    setupHappyPath(testSpec);

    await expect(
      newAutoCommand('my-feature', {}),
    ).rejects.toThrow('process.exit(0)');

    // Verify orchestrator was driven correctly
    expect(mockStart).toHaveBeenCalledOnce();
    expect(mockAdvanceToGoals).toHaveBeenCalledOnce();
    expect(mockSubmitGoals).toHaveBeenCalledWith('');
    expect(mockSkipToGeneration).toHaveBeenCalledOnce();

    // Verify spec was written
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('my-feature.md'),
      testSpec,
      'utf-8',
    );

    // Verify spec path printed to stdout
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('my-feature.md'),
    );
  });

  it('passes goals to submitGoals', async () => {
    setupHappyPath();

    await expect(
      newAutoCommand('my-feature', { goals: 'Build auth with JWT' }),
    ).rejects.toThrow('process.exit(0)');

    expect(mockSubmitGoals).toHaveBeenCalledWith('Build auth with JWT');
  });

  it('resolves issue:42 via GitHub utils', async () => {
    setupHappyPath();
    mockDetectGitHubRemote.mockResolvedValue({ owner: 'acme', repo: 'app' });
    mockFetchGitHubIssue.mockResolvedValue({
      title: 'Add login page',
      body: 'We need a login page',
      labels: ['feature'],
    });

    await expect(
      newAutoCommand('my-feature', {
        initialReferences: ['issue:42'],
      }),
    ).rejects.toThrow('process.exit(0)');

    expect(mockDetectGitHubRemote).toHaveBeenCalled();
    expect(mockFetchGitHubIssue).toHaveBeenCalledWith('acme', 'app', 42);
    expect(mockAddReferenceContent).toHaveBeenCalledWith(
      '# Add login page\n\nWe need a login page',
      'GitHub issue #42',
    );
  });

  it('passes context URL to addReference', async () => {
    setupHappyPath();

    // addReference fires onReady in the real orchestrator; mock that
    mockAddReference.mockImplementation(async () => {
      capturedOpts.value.onReady();
      return true;
    });

    await expect(
      newAutoCommand('my-feature', {
        initialReferences: ['https://docs.example.com/api'],
      }),
    ).rejects.toThrow('process.exit(0)');

    expect(mockAddReference).toHaveBeenCalledWith('https://docs.example.com/api');
  });

  it('exits with error when no provider available', async () => {
    mockGetAvailableProvider.mockReturnValue(null);

    await expect(
      newAutoCommand('my-feature', {}),
    ).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No AI provider available'),
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('propagates orchestrator errors', async () => {
    mockStart.mockImplementation(async () => {
      capturedOpts.value.onReady();
    });
    mockAdvanceToGoals.mockImplementation(async () => {
      capturedOpts.value.onReady();
    });
    mockSubmitGoals.mockImplementation(async () => {
      capturedOpts.value.onError('AI service unavailable');
    });

    await expect(
      newAutoCommand('my-feature', {}),
    ).rejects.toThrow('AI service unavailable');
  });

  it('creates specsDir if it does not exist', async () => {
    setupHappyPath();
    mockExistsSync.mockReturnValue(false);

    await expect(
      newAutoCommand('my-feature', {}),
    ).rejects.toThrow('process.exit(0)');

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.ralph/specs'),
      { recursive: true },
    );
  });

  it('uses config specsDir when config exists', async () => {
    setupHappyPath();
    mockHasConfig.mockReturnValue(true);
    mockLoadConfigWithDefaults.mockResolvedValue({
      paths: { specs: 'custom/specs', root: '.ralph', scripts: '.ralph/scripts' },
      loop: { defaultModel: 'sonnet' },
    });

    await expect(
      newAutoCommand('my-feature', {}),
    ).rejects.toThrow('process.exit(0)');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(join('custom/specs', 'my-feature.md')),
      expect.any(String),
      'utf-8',
    );
  });

  it('passes model override to orchestrator', async () => {
    setupHappyPath();

    await expect(
      newAutoCommand('my-feature', { model: 'claude-opus-4-20250514' }),
    ).rejects.toThrow('process.exit(0)');

    expect(capturedOpts.value.model).toBe('claude-opus-4-20250514');
  });

  it('times out if orchestrator never completes', async () => {
    mockStart.mockImplementation(async () => {
      capturedOpts.value.onReady();
    });
    mockAdvanceToGoals.mockImplementation(async () => {
      capturedOpts.value.onReady();
    });
    // submitGoals fires onReady but never onComplete or onError → hangs
    mockSubmitGoals.mockImplementation(async () => {
      capturedOpts.value.onPhaseChange('interview');
      capturedOpts.value.onReady();
    });
    mockSkipToGeneration.mockImplementation(async () => {
      // Intentionally does NOT fire onComplete — simulates silent failure
    });

    await expect(
      newAutoCommand('my-feature', { timeoutMs: 50 }),
    ).rejects.toThrow('Spec generation timed out');
  }, 5000);

  it('handles issue URL references via addReference', async () => {
    setupHappyPath();

    mockAddReference.mockImplementation(async () => {
      capturedOpts.value.onReady();
      return true;
    });

    await expect(
      newAutoCommand('my-feature', {
        initialReferences: ['issue:https://github.com/acme/app/issues/99'],
      }),
    ).rejects.toThrow('process.exit(0)');

    expect(mockAddReference).toHaveBeenCalledWith(
      'https://github.com/acme/app/issues/99',
    );
    // Should NOT call addReferenceContent for URL-based issues
    expect(mockAddReferenceContent).not.toHaveBeenCalled();
  });
});
