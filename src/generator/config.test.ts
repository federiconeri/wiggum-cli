import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateConfig } from './config.js';
import type { ScanResult } from '../scanner/types.js';

function makeScanResult(projectRoot: string): ScanResult {
  return {
    projectRoot,
    stack: {
      framework: {
        name: 'react',
        confidence: 100,
        evidence: [],
      },
    },
    scanTime: 0,
  };
}

describe('generateConfig - CLI-aware loop model defaults', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'wiggum-generate-config-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('keeps Claude loop defaults when coding CLI is claude', () => {
    const config = generateConfig(makeScanResult(testDir), {
      codingCli: 'claude',
      reviewCli: 'claude',
    });

    expect(config.loop.defaultModel).toBe('sonnet');
    expect(config.loop.planningModel).toBe('opus');
  });

  it('uses gpt-5.3-codex for both loop model fields when coding+review CLI are codex', () => {
    const config = generateConfig(makeScanResult(testDir), {
      codingCli: 'codex',
      reviewCli: 'codex',
    });

    expect(config.loop.defaultModel).toBe('gpt-5.3-codex');
    expect(config.loop.planningModel).toBe('gpt-5.3-codex');
  });

  it('preserves explicit custom loop model overrides', () => {
    const config = generateConfig(makeScanResult(testDir), {
      codingCli: 'codex',
      reviewCli: 'codex',
      defaultModel: 'gpt-5.2',
      planningModel: 'gpt-5.2',
    });

    expect(config.loop.defaultModel).toBe('gpt-5.2');
    expect(config.loop.planningModel).toBe('gpt-5.2');
  });
});
