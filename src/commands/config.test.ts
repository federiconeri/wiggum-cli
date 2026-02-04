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
      'TAVILY_API_KEY=tvly-test-key-1234567890\n'
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
    expect(writeSpy).toHaveBeenLastCalledWith(envLocalPath, 'TAVILY_API_KEY=tvly-key-1234567890\n');

    // Test context7
    await handleConfigCommand(['set', 'context7', 'c7-key-1234567890'], mockState);
    expect(writeSpy).toHaveBeenLastCalledWith(envLocalPath, 'CONTEXT7_API_KEY=c7-key-1234567890\n');

    // Test braintrust
    await handleConfigCommand(['set', 'braintrust', 'bt-key-1234567890'], mockState);
    expect(writeSpy).toHaveBeenLastCalledWith(envLocalPath, 'BRAINTRUST_API_KEY=bt-key-1234567890\n');
  });
});
