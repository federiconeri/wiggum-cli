import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCI } from './ci.js';

describe('isCI', () => {
  let originalCI: string | undefined;
  let originalContinuousIntegration: string | undefined;

  beforeEach(() => {
    originalCI = process.env['CI'];
    originalContinuousIntegration = process.env['CONTINUOUS_INTEGRATION'];
    delete process.env['CI'];
    delete process.env['CONTINUOUS_INTEGRATION'];
  });

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env['CI'] = originalCI;
    } else {
      delete process.env['CI'];
    }
    if (originalContinuousIntegration !== undefined) {
      process.env['CONTINUOUS_INTEGRATION'] = originalContinuousIntegration;
    } else {
      delete process.env['CONTINUOUS_INTEGRATION'];
    }
  });

  it('returns false when neither CI env var is set', () => {
    expect(isCI()).toBe(false);
  });

  it('returns true when CI is set to "true"', () => {
    process.env['CI'] = 'true';
    expect(isCI()).toBe(true);
  });

  it('returns true when CI is set to "1"', () => {
    process.env['CI'] = '1';
    expect(isCI()).toBe(true);
  });

  it('returns true when CONTINUOUS_INTEGRATION is set', () => {
    process.env['CONTINUOUS_INTEGRATION'] = 'true';
    expect(isCI()).toBe(true);
  });

  it('returns true when both CI and CONTINUOUS_INTEGRATION are set', () => {
    process.env['CI'] = 'true';
    process.env['CONTINUOUS_INTEGRATION'] = 'true';
    expect(isCI()).toBe(true);
  });
});
