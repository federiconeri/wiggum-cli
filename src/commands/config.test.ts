import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { handleConfigCommand } from './config.js';
import type { SessionState } from '../repl/session-state.js';

// Mock logger to suppress console output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock colors to avoid picocolors output during tests
vi.mock('../utils/colors.js', () => ({
  simpson: {
    yellow: (s: string) => s,
  },
}));

describe('handleConfigCommand - init guard', () => {
  const mockState: SessionState = {
    projectRoot: '/fake/project',
    provider: 'openai',
    model: 'gpt-4',
    conversationHistory: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear process.env
    delete process.env.TAVILY_API_KEY;
    delete process.env.CONTEXT7_API_KEY;
    delete process.env.BRAINTRUST_API_KEY;
  });

  it('throws error when .ralph/ does not exist', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // .ralph/ directory does not exist
      return p !== ralphDir;
    });

    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync');

    const args = ['set', 'tavily', 'tvly-test-key-1234567890'];

    await handleConfigCommand(args, mockState);

    // Should not create .ralph/ directory
    expect(mkdirSpy).not.toHaveBeenCalled();

    // Should not write to .env.local
    expect(writeSpy).not.toHaveBeenCalled();

    // Should not set environment variable
    expect(process.env.TAVILY_API_KEY).toBeUndefined();
  });

  it('writes to .ralph/.env.local when .ralph/ exists', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const envLocalPath = path.join(ralphDir, '.env.local');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // .ralph/ directory exists
      if (p === ralphDir) return true;
      // .env.local does not exist yet
      if (p === envLocalPath) return false;
      return false;
    });

    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);

    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const args = ['set', 'tavily', 'tvly-test-key-1234567890'];

    await handleConfigCommand(args, mockState);

    // Should write to .ralph/.env.local
    expect(writeSpy).toHaveBeenCalledWith(
      envLocalPath,
      'TAVILY_API_KEY=tvly-test-key-1234567890\n',
      { mode: 0o600 }
    );

    // Should set environment variable
    expect(process.env.TAVILY_API_KEY).toBe('tvly-test-key-1234567890');
  });

  it('merges new key into existing .ralph/.env.local', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const envLocalPath = path.join(ralphDir, '.env.local');
    const existingContent = 'CONTEXT7_API_KEY=c7-existing-123\n';

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // Both .ralph/ and .env.local exist
      if (p === ralphDir) return true;
      if (p === envLocalPath) return true;
      return false;
    });

    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);

    vi.spyOn(fs, 'readFileSync').mockReturnValue(existingContent);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const args = ['set', 'tavily', 'tvly-test-key-1234567890'];

    await handleConfigCommand(args, mockState);

    const writtenContent = (writeSpy as any).mock.calls[0][1];

    // Should preserve existing key
    expect(writtenContent).toContain('CONTEXT7_API_KEY=c7-existing-123');

    // Should add new key
    expect(writtenContent).toContain('TAVILY_API_KEY=tvly-test-key-1234567890');
  });

  it('replaces existing key value in .ralph/.env.local', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const envLocalPath = path.join(ralphDir, '.env.local');
    const existingContent = 'TAVILY_API_KEY=old-key-value\n';

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === ralphDir) return true;
      if (p === envLocalPath) return true;
      return false;
    });

    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);

    vi.spyOn(fs, 'readFileSync').mockReturnValue(existingContent);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const args = ['set', 'tavily', 'tvly-new-key-9876543210'];

    await handleConfigCommand(args, mockState);

    const writtenContent = (writeSpy as any).mock.calls[0][1];

    // Should replace old value
    expect(writtenContent).not.toContain('old-key-value');
    expect(writtenContent).toContain('TAVILY_API_KEY=tvly-new-key-9876543210');
  });

  it('validates API key length', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);

    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    // Key too short (< 10 chars)
    const args = ['set', 'tavily', 'short'];

    await handleConfigCommand(args, mockState);

    // Should not write
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('rejects unknown service names', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);

    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    const args = ['set', 'unknown-service', 'some-key-1234567890'];

    await handleConfigCommand(args, mockState);

    // Should not write
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('handles all supported services', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const envLocalPath = path.join(ralphDir, '.env.local');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === ralphDir) return true;
      if (p === envLocalPath) return false;
      return false;
    });

    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);

    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    // Test tavily
    await handleConfigCommand(['set', 'tavily', 'tvly-key-1234567890'], mockState);
    expect(writeSpy).toHaveBeenLastCalledWith(
      envLocalPath,
      'TAVILY_API_KEY=tvly-key-1234567890\n',
      { mode: 0o600 }
    );

    // Test context7
    await handleConfigCommand(['set', 'context7', 'c7-key-1234567890'], mockState);
    expect(writeSpy).toHaveBeenLastCalledWith(
      envLocalPath,
      'CONTEXT7_API_KEY=c7-key-1234567890\n',
      { mode: 0o600 }
    );

    // Test braintrust
    await handleConfigCommand(['set', 'braintrust', 'bt-key-1234567890'], mockState);
    expect(writeSpy).toHaveBeenLastCalledWith(
      envLocalPath,
      'BRAINTRUST_API_KEY=bt-key-1234567890\n',
      { mode: 0o600 }
    );
  });

  it('persists /config set cli codex into ralph.config.cjs', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const configPath = path.join(mockState.projectRoot, 'ralph.config.cjs');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphDir);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const configModule = await import('../utils/config.js');
    vi.spyOn(configModule, 'loadConfigWithDefaults').mockResolvedValue({
      paths: { root: '.ralph', specs: '.ralph/specs', scripts: '.ralph/scripts' },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        codingCli: 'claude',
        reviewCli: 'claude',
        reviewMode: 'manual',
      },
      ai: { provider: 'openai', defaultModel: 'gpt-4', planningModel: 'gpt-4' },
    } as any);

    await handleConfigCommand(['set', 'cli', 'codex'], mockState);

    expect(writeSpy).toHaveBeenCalled();
    const [writtenPath, writtenContent] = (writeSpy as any).mock.calls.at(-1);
    expect(writtenPath).toBe(configPath);
    expect(writtenContent).toContain("codingCli: 'codex'");
    expect(writtenContent).toContain("reviewCli: 'claude'");
  });

  it('persists /config set review-cli codex into ralph.config.cjs', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const configPath = path.join(mockState.projectRoot, 'ralph.config.cjs');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphDir);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const configModule = await import('../utils/config.js');
    vi.spyOn(configModule, 'loadConfigWithDefaults').mockResolvedValue({
      paths: { root: '.ralph', specs: '.ralph/specs', scripts: '.ralph/scripts' },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        codingCli: 'codex',
        reviewCli: 'claude',
        reviewMode: 'manual',
      },
      ai: { provider: 'openai', defaultModel: 'gpt-4', planningModel: 'gpt-4' },
    } as any);

    await handleConfigCommand(['set', 'review-cli', 'codex'], mockState);

    expect(writeSpy).toHaveBeenCalled();
    const [writtenPath, writtenContent] = (writeSpy as any).mock.calls.at(-1);
    expect(writtenPath).toBe(configPath);
    expect(writtenContent).toContain("codingCli: 'codex'");
    expect(writtenContent).toContain("reviewCli: 'codex'");
  });

  it('normalizes codex-only loop models when switching CLI back to claude', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    const configPath = path.join(mockState.projectRoot, 'ralph.config.cjs');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphDir);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const configModule = await import('../utils/config.js');
    vi.spyOn(configModule, 'loadConfigWithDefaults').mockResolvedValue({
      paths: { root: '.ralph', specs: '.ralph/specs', scripts: '.ralph/scripts' },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'gpt-5.3-codex',
        planningModel: 'gpt-5.3-codex',
        codingCli: 'codex',
        reviewCli: 'codex',
        reviewMode: 'manual',
      },
      ai: { provider: 'openai', defaultModel: 'gpt-4', planningModel: 'gpt-4' },
    } as any);

    await handleConfigCommand(['set', 'cli', 'claude'], mockState);

    expect(writeSpy).toHaveBeenCalled();
    const [writtenPath, writtenContent] = (writeSpy as any).mock.calls.at(-1);
    expect(writtenPath).toBe(configPath);
    expect(writtenContent).toContain("defaultModel: 'sonnet'");
    expect(writtenContent).toContain("planningModel: 'opus'");
    expect(writtenContent).toContain("codingCli: 'claude'");
    expect(writtenContent).toContain("reviewCli: 'codex'");
  });

  it('rejects invalid /config set cli values', async () => {
    const ralphDir = path.join(mockState.projectRoot, '.ralph');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphDir);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    const { logger } = await import('../utils/logger.js');
    await handleConfigCommand(['set', 'cli', 'gemini'], mockState);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("Invalid cli value: 'gemini'. Allowed values: claude, codex");
  });
});
