import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseEnvContent, loadApiKeysFromEnvLocal } from './env.js';

describe('parseEnvContent', () => {
  it('returns empty object for empty input', () => {
    expect(parseEnvContent('')).toEqual({});
  });

  it('parses simple KEY=VALUE lines', () => {
    const content = 'FOO=bar\nBAZ=qux';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores comment lines starting with #', () => {
    const content = '# This is a comment\nFOO=bar\n# Another comment';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar' });
  });

  it('ignores empty lines', () => {
    const content = '\nFOO=bar\n\n\nBAZ=qux\n';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores malformed lines without =', () => {
    const content = 'INVALIDLINE\nFOO=bar\nANOTHER_BAD';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar' });
  });

  it('treats everything after first = as the value', () => {
    const content = 'KEY=value=with=equals';
    expect(parseEnvContent(content)).toEqual({ KEY: 'value=with=equals' });
  });

  it('trims whitespace around keys and values', () => {
    const content = '  FOO  =  bar baz  ';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar baz' });
  });

  it('skips lines where key is empty after trimming', () => {
    const content = '=nokey\nFOO=bar';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar' });
  });

  it('handles Windows-style line endings (CRLF)', () => {
    const content = 'FOO=bar\r\nBAZ=qux\r\n';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('strips matching double quotes from values', () => {
    const content = 'KEY="quoted-value"';
    expect(parseEnvContent(content)).toEqual({ KEY: 'quoted-value' });
  });

  it('strips matching single quotes from values', () => {
    const content = "KEY='quoted-value'";
    expect(parseEnvContent(content)).toEqual({ KEY: 'quoted-value' });
  });

  it('does not strip mismatched quotes', () => {
    const content = 'KEY="mismatched\'';
    expect(parseEnvContent(content)).toEqual({ KEY: '"mismatched\'' });
  });

  it('does not strip quotes from single-char values', () => {
    const content = 'KEY="';
    expect(parseEnvContent(content)).toEqual({ KEY: '"' });
  });

  it('returns empty string for KEY= with no value', () => {
    const content = 'KEY=';
    expect(parseEnvContent(content)).toEqual({ KEY: '' });
  });
});

describe('loadApiKeysFromEnvLocal', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env to a clean-ish state for provider keys
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.CONTEXT7_API_KEY;
    delete process.env.BRAINTRUST_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('sets known provider keys from file into process.env', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY=sk-test-123\nANTHROPIC_API_KEY=sk-ant-456\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-test-123');
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-456');
  });

  it('overrides existing process.env values (file takes precedence)', () => {
    process.env.OPENAI_API_KEY = 'from-shell';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('OPENAI_API_KEY=from-file\n');

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('from-file');
  });

  it('ignores unknown keys not in KNOWN_API_KEYS', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY=sk-test\nSOME_OTHER_KEY=should-not-load\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-test');
    expect(process.env.SOME_OTHER_KEY).toBeUndefined();
  });

  it('is a no-op when file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const readSpy = vi.spyOn(fs, 'readFileSync');

    loadApiKeysFromEnvLocal();

    expect(readSpy).not.toHaveBeenCalled();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it('does not throw when file read fails', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(() => loadApiKeysFromEnvLocal()).not.toThrow();
  });

  it('loads optional service keys (TAVILY, CONTEXT7)', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'TAVILY_API_KEY=tvly-xxx\nCONTEXT7_API_KEY=c7-yyy\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.TAVILY_API_KEY).toBe('tvly-xxx');
    expect(process.env.CONTEXT7_API_KEY).toBe('c7-yyy');
  });

  it('resolves path relative to process.cwd()', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const existsSpy = vi.spyOn(fs, 'existsSync');

    loadApiKeysFromEnvLocal();

    const expectedPath = path.join(process.cwd(), '.ralph', '.env.local');
    expect(existsSpy).toHaveBeenCalledWith(expectedPath);
  });

  it('loads BRAINTRUST_API_KEY as a known key', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'BRAINTRUST_API_KEY=bt-xxx\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.BRAINTRUST_API_KEY).toBe('bt-xxx');
  });

  it('does not override existing env with empty value from file', () => {
    process.env.OPENAI_API_KEY = 'from-shell';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('OPENAI_API_KEY=\n');

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('from-shell');
  });

  it('strips quotes from values before setting env', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY="sk-quoted-123"\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-quoted-123');
  });
});
