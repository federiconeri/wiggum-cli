import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_CONFIG,
  loadConfig,
  loadConfigWithDefaults,
  getLoopSettings,
  hasConfig,
  type RalphConfig,
  type LoopConfig,
} from './config.js';

describe('config', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'ralph-config-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('DEFAULT_CONFIG', () => {
    it('includes reviewMode field in loop config', () => {
      expect(DEFAULT_CONFIG.loop).toHaveProperty('reviewMode');
    });

    it('sets reviewMode default to manual', () => {
      expect(DEFAULT_CONFIG.loop.reviewMode).toBe('manual');
    });

    it('has correct loop config structure', () => {
      expect(DEFAULT_CONFIG.loop).toEqual({
        maxIterations: 10,
        maxE2eAttempts: 5,
        defaultModel: 'sonnet',
        planningModel: 'opus',
        reviewMode: 'manual',
      });
    });
  });

  describe('loadConfig', () => {
    it('returns null when config file does not exist', async () => {
      const config = await loadConfig(tempDir);
      expect(config).toBeNull();
    });

    it('loads config file when it exists', async () => {
      const configContent = `module.exports = {
        name: 'test-project',
        stack: {
          framework: { name: 'react' },
          packageManager: 'npm',
          testing: { unit: 'vitest', e2e: 'playwright' },
          styling: 'tailwind'
        },
        commands: {
          dev: 'npm run dev',
          build: 'npm run build',
          test: 'npm test',
          lint: 'npm run lint',
          typecheck: 'npm run typecheck'
        },
        paths: {
          root: '.ralph',
          prompts: '.ralph/prompts',
          guides: '.ralph/guides',
          specs: '.ralph/specs',
          scripts: '.ralph/scripts',
          learnings: '.ralph/LEARNINGS.md',
          agents: '.ralph/AGENTS.md'
        },
        loop: {
          maxIterations: 15,
          maxE2eAttempts: 3,
          defaultModel: 'opus',
          planningModel: 'sonnet',
          reviewMode: 'auto'
        }
      };`;

      writeFileSync(join(tempDir, 'ralph.config.cjs'), configContent);

      const config = await loadConfig(tempDir);
      expect(config).not.toBeNull();
      expect(config?.name).toBe('test-project');
      expect(config?.loop.reviewMode).toBe('auto');
    });
  });

  describe('loadConfigWithDefaults', () => {
    it('returns DEFAULT_CONFIG when no config file exists', async () => {
      const config = await loadConfigWithDefaults(tempDir);
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(config.loop.reviewMode).toBe('manual');
    });

    it('merges user-provided reviewMode: auto correctly', async () => {
      const configContent = `module.exports = {
        name: 'test-project',
        stack: {
          framework: { name: 'react' },
          packageManager: 'npm',
          testing: { unit: 'vitest', e2e: 'playwright' },
          styling: 'tailwind'
        },
        commands: {
          dev: 'npm run dev',
          build: 'npm run build',
          test: 'npm test',
          lint: 'npm run lint',
          typecheck: 'npm run typecheck'
        },
        paths: {
          root: '.ralph',
          prompts: '.ralph/prompts',
          guides: '.ralph/guides',
          specs: '.ralph/specs',
          scripts: '.ralph/scripts',
          learnings: '.ralph/LEARNINGS.md',
          agents: '.ralph/AGENTS.md'
        },
        loop: {
          maxIterations: 15,
          maxE2eAttempts: 3,
          defaultModel: 'opus',
          planningModel: 'sonnet',
          reviewMode: 'auto'
        }
      };`;

      writeFileSync(join(tempDir, 'ralph.config.cjs'), configContent);

      const config = await loadConfigWithDefaults(tempDir);
      expect(config.loop.reviewMode).toBe('auto');
      expect(config.loop.maxIterations).toBe(15);
    });

    it('falls back to manual when reviewMode is absent from user config', async () => {
      const configContent = `module.exports = {
        name: 'test-project',
        stack: {
          framework: { name: 'react' },
          packageManager: 'npm',
          testing: { unit: 'vitest', e2e: 'playwright' },
          styling: 'tailwind'
        },
        commands: {
          dev: 'npm run dev',
          build: 'npm run build',
          test: 'npm test',
          lint: 'npm run lint',
          typecheck: 'npm run typecheck'
        },
        paths: {
          root: '.ralph',
          prompts: '.ralph/prompts',
          guides: '.ralph/guides',
          specs: '.ralph/specs',
          scripts: '.ralph/scripts',
          learnings: '.ralph/LEARNINGS.md',
          agents: '.ralph/AGENTS.md'
        },
        loop: {
          maxIterations: 15,
          maxE2eAttempts: 3,
          defaultModel: 'opus',
          planningModel: 'sonnet'
        }
      };`;

      writeFileSync(join(tempDir, 'ralph.config.cjs'), configContent);

      const config = await loadConfigWithDefaults(tempDir);
      expect(config.loop.reviewMode).toBe('manual');
    });
  });

  describe('getLoopSettings', () => {
    it('returns correct reviewMode from config', async () => {
      const configContent = `module.exports = {
        name: 'test-project',
        stack: {
          framework: { name: 'react' },
          packageManager: 'npm',
          testing: { unit: 'vitest', e2e: 'playwright' },
          styling: 'tailwind'
        },
        commands: {
          dev: 'npm run dev',
          build: 'npm run build',
          test: 'npm test',
          lint: 'npm run lint',
          typecheck: 'npm run typecheck'
        },
        paths: {
          root: '.ralph',
          prompts: '.ralph/prompts',
          guides: '.ralph/guides',
          specs: '.ralph/specs',
          scripts: '.ralph/scripts',
          learnings: '.ralph/LEARNINGS.md',
          agents: '.ralph/AGENTS.md'
        },
        loop: {
          maxIterations: 15,
          maxE2eAttempts: 3,
          defaultModel: 'opus',
          planningModel: 'sonnet',
          reviewMode: 'auto'
        }
      };`;

      writeFileSync(join(tempDir, 'ralph.config.cjs'), configContent);

      const loopSettings = await getLoopSettings(tempDir);
      expect(loopSettings.reviewMode).toBe('auto');
      expect(loopSettings.maxIterations).toBe(15);
      expect(loopSettings.defaultModel).toBe('opus');
    });

    it('falls back to default reviewMode when not in config', async () => {
      const loopSettings = await getLoopSettings(tempDir);
      expect(loopSettings.reviewMode).toBe('manual');
      expect(loopSettings).toEqual(DEFAULT_CONFIG.loop);
    });
  });

  describe('hasConfig', () => {
    it('returns false when config file does not exist', () => {
      expect(hasConfig(tempDir)).toBe(false);
    });

    it('returns true when config file exists', () => {
      writeFileSync(join(tempDir, 'ralph.config.cjs'), 'module.exports = {};');
      expect(hasConfig(tempDir)).toBe(true);
    });
  });
});
