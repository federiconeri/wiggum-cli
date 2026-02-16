import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCommand } from './run.js';
import * as config from '../utils/config.js';

// Mock logger to suppress console output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock picocolors
vi.mock('picocolors', () => ({
  default: {
    bold: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
  })),
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

describe('runCommand - reviewMode validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/fake/project');

    // Mock process.exit to throw instead of actually exiting
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid reviewMode from CLI flag', async () => {
    const { existsSync } = await import('node:fs');
    const mockExistsSync = existsSync as any;

    // Mock config
    vi.spyOn(config, 'hasConfig').mockReturnValue(true);
    vi.spyOn(config, 'loadConfigWithDefaults').mockResolvedValue({
      paths: {
        root: '.ralph',
        specs: '.ralph/specs',
        scripts: '.ralph/scripts',
      },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        reviewMode: 'manual',
      },
      ai: {
        provider: 'anthropic',
        defaultModel: 'sonnet',
        planningModel: 'opus',
      },
    } as any);

    // Mock spec file exists
    mockExistsSync.mockReturnValue(true);

    const { logger } = await import('../utils/logger.js');

    await expect(
      runCommand('test-feature', { reviewMode: 'invalid' as any })
    ).rejects.toThrow('process.exit(1)');

    expect(logger.error).toHaveBeenCalledWith(
      "Invalid reviewMode 'invalid'. Allowed values are 'manual', 'auto', or 'merge'."
    );
  });

  it('rejects invalid reviewMode from config', async () => {
    const { existsSync } = await import('node:fs');
    const mockExistsSync = existsSync as any;

    // Mock config with invalid reviewMode
    vi.spyOn(config, 'hasConfig').mockReturnValue(true);
    vi.spyOn(config, 'loadConfigWithDefaults').mockResolvedValue({
      paths: {
        root: '.ralph',
        specs: '.ralph/specs',
        scripts: '.ralph/scripts',
      },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        reviewMode: 'foo' as any, // Invalid value
      },
      ai: {
        provider: 'anthropic',
        defaultModel: 'sonnet',
        planningModel: 'opus',
      },
    } as any);

    // Mock spec file exists
    mockExistsSync.mockReturnValue(true);

    const { logger } = await import('../utils/logger.js');

    await expect(
      runCommand('test-feature', {})
    ).rejects.toThrow('process.exit(1)');

    expect(logger.error).toHaveBeenCalledWith(
      "Invalid reviewMode 'foo'. Allowed values are 'manual', 'auto', or 'merge'."
    );
  });

  it('rejects case-insensitive variants', async () => {
    const { existsSync } = await import('node:fs');
    const mockExistsSync = existsSync as any;

    // Mock config
    vi.spyOn(config, 'hasConfig').mockReturnValue(true);
    vi.spyOn(config, 'loadConfigWithDefaults').mockResolvedValue({
      paths: {
        root: '.ralph',
        specs: '.ralph/specs',
        scripts: '.ralph/scripts',
      },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        reviewMode: 'manual',
      },
      ai: {
        provider: 'anthropic',
        defaultModel: 'sonnet',
        planningModel: 'opus',
      },
    } as any);

    // Mock spec file exists
    mockExistsSync.mockReturnValue(true);

    const { logger } = await import('../utils/logger.js');

    // Test uppercase
    await expect(
      runCommand('test-feature', { reviewMode: 'AUTO' as any })
    ).rejects.toThrow('process.exit(1)');

    expect(logger.error).toHaveBeenCalledWith(
      "Invalid reviewMode 'AUTO'. Allowed values are 'manual', 'auto', or 'merge'."
    );

    vi.clearAllMocks();

    // Test mixed case
    await expect(
      runCommand('test-feature', { reviewMode: 'Manual' as any })
    ).rejects.toThrow('process.exit(1)');

    expect(logger.error).toHaveBeenCalledWith(
      "Invalid reviewMode 'Manual'. Allowed values are 'manual', 'auto', or 'merge'."
    );
  });
});

describe('runCommand - reviewMode precedence', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/fake/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses CLI flag over config value', async () => {
    const { existsSync } = await import('node:fs');
    const { spawn } = await import('node:child_process');
    const mockExistsSync = existsSync as any;
    const mockSpawn = spawn as any;

    // Mock config with 'manual'
    vi.spyOn(config, 'hasConfig').mockReturnValue(true);
    vi.spyOn(config, 'loadConfigWithDefaults').mockResolvedValue({
      paths: {
        root: '.ralph',
        specs: '.ralph/specs',
        scripts: '.ralph/scripts',
      },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        reviewMode: 'manual',
      },
      ai: {
        provider: 'anthropic',
        defaultModel: 'sonnet',
        planningModel: 'opus',
      },
    } as any);

    // Mock files exist
    mockExistsSync.mockReturnValue(true);

    // Mock spawn to capture args
    let capturedArgs: string[] = [];
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      capturedArgs = args;
      return {
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'close') {
            // Simulate immediate successful completion
            setTimeout(() => handler(0), 0);
          }
        }),
      };
    });

    // Run with CLI flag 'auto' (should override config 'manual')
    await runCommand('test-feature', { reviewMode: 'auto' });

    // Verify that --review-mode auto was passed to the script
    expect(capturedArgs).toContain('--review-mode');
    const reviewModeIndex = capturedArgs.indexOf('--review-mode');
    expect(capturedArgs[reviewModeIndex + 1]).toBe('auto');
  });

  it('uses config value when no CLI flag provided', async () => {
    const { existsSync } = await import('node:fs');
    const { spawn } = await import('node:child_process');
    const mockExistsSync = existsSync as any;
    const mockSpawn = spawn as any;

    // Mock config with 'auto'
    vi.spyOn(config, 'hasConfig').mockReturnValue(true);
    vi.spyOn(config, 'loadConfigWithDefaults').mockResolvedValue({
      paths: {
        root: '.ralph',
        specs: '.ralph/specs',
        scripts: '.ralph/scripts',
      },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        reviewMode: 'auto',
      },
      ai: {
        provider: 'anthropic',
        defaultModel: 'sonnet',
        planningModel: 'opus',
      },
    } as any);

    // Mock files exist
    mockExistsSync.mockReturnValue(true);

    // Mock spawn to capture args
    let capturedArgs: string[] = [];
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      capturedArgs = args;
      return {
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
      };
    });

    // Run without CLI flag
    await runCommand('test-feature', {});

    // Verify that --review-mode auto was passed (from config)
    expect(capturedArgs).toContain('--review-mode');
    const reviewModeIndex = capturedArgs.indexOf('--review-mode');
    expect(capturedArgs[reviewModeIndex + 1]).toBe('auto');
  });

  it('defaults to manual when neither CLI flag nor config provided', async () => {
    const { existsSync } = await import('node:fs');
    const { spawn } = await import('node:child_process');
    const mockExistsSync = existsSync as any;
    const mockSpawn = spawn as any;

    // Mock config WITHOUT reviewMode
    vi.spyOn(config, 'hasConfig').mockReturnValue(true);
    vi.spyOn(config, 'loadConfigWithDefaults').mockResolvedValue({
      paths: {
        root: '.ralph',
        specs: '.ralph/specs',
        scripts: '.ralph/scripts',
      },
      loop: {
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        // reviewMode is intentionally omitted - will use DEFAULT_CONFIG default
        reviewMode: 'manual', // This comes from DEFAULT_CONFIG
      },
      ai: {
        provider: 'anthropic',
        defaultModel: 'sonnet',
        planningModel: 'opus',
      },
    } as any);

    // Mock files exist
    mockExistsSync.mockReturnValue(true);

    // Mock spawn to capture args
    let capturedArgs: string[] = [];
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      capturedArgs = args;
      return {
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
      };
    });

    // Run without CLI flag
    await runCommand('test-feature', {});

    // Verify that --review-mode manual was passed (default)
    expect(capturedArgs).toContain('--review-mode');
    const reviewModeIndex = capturedArgs.indexOf('--review-mode');
    expect(capturedArgs[reviewModeIndex + 1]).toBe('manual');
  });
});
