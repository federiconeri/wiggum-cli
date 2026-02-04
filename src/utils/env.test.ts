import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseEnvContent, loadApiKeysFromEnvLocal, writeKeysToEnvFile } from './env.js';

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
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY=sk-test-123\nANTHROPIC_API_KEY=sk-ant-456\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-test-123');
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-456');
  });

  it('overrides existing process.env values (file takes precedence)', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    process.env.OPENAI_API_KEY = 'from-shell';
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('OPENAI_API_KEY=from-file\n');

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('from-file');
  });

  it('ignores unknown keys not in KNOWN_API_KEYS', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY=sk-test\nSOME_OTHER_KEY=should-not-load\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-test');
    expect(process.env.SOME_OTHER_KEY).toBeUndefined();
  });


  it('does not throw when file read fails', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(() => loadApiKeysFromEnvLocal()).not.toThrow();
  });

  it('loads optional service keys (TAVILY, CONTEXT7)', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'TAVILY_API_KEY=tvly-xxx\nCONTEXT7_API_KEY=c7-yyy\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.TAVILY_API_KEY).toBe('tvly-xxx');
    expect(process.env.CONTEXT7_API_KEY).toBe('c7-yyy');
  });

  it('prefers .ralph/.env.local over root .env.local when both exist', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    const rootPath = path.join(process.cwd(), '.env.local');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // Both files exist
      return p === ralphPath || p === rootPath;
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === ralphPath) {
        return 'OPENAI_API_KEY=from-ralph\n';
      }
      if (p === rootPath) {
        return 'OPENAI_API_KEY=from-root\n';
      }
      return '';
    });

    loadApiKeysFromEnvLocal();

    // Should load from .ralph/.env.local, not root
    expect(process.env.OPENAI_API_KEY).toBe('from-ralph');
  });

  it('falls back to root .env.local when .ralph/.env.local does not exist', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    const rootPath = path.join(process.cwd(), '.env.local');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // Only root exists
      return p === rootPath;
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === rootPath) {
        return 'OPENAI_API_KEY=from-root\n';
      }
      return '';
    });

    loadApiKeysFromEnvLocal();

    // Should load from root .env.local as fallback
    expect(process.env.OPENAI_API_KEY).toBe('from-root');
  });

  it('is a no-op when neither .ralph/.env.local nor root .env.local exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const readSpy = vi.spyOn(fs, 'readFileSync');

    loadApiKeysFromEnvLocal();

    expect(readSpy).not.toHaveBeenCalled();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it('resolves path relative to process.cwd()', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const existsSpy = vi.spyOn(fs, 'existsSync');

    loadApiKeysFromEnvLocal();

    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    const rootPath = path.join(process.cwd(), '.env.local');
    expect(existsSpy).toHaveBeenCalledWith(ralphPath);
    expect(existsSpy).toHaveBeenCalledWith(rootPath);
  });

  it('loads BRAINTRUST_API_KEY as a known key', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'BRAINTRUST_API_KEY=bt-xxx\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.BRAINTRUST_API_KEY).toBe('bt-xxx');
  });

  it('does not override existing env with empty value from file', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    process.env.OPENAI_API_KEY = 'from-shell';
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('OPENAI_API_KEY=\n');

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('from-shell');
  });

  it('strips quotes from values before setting env', () => {
    const ralphPath = path.join(process.cwd(), '.ralph', '.env.local');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ralphPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY="sk-quoted-123"\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-quoted-123');
  });
});

describe('writeKeysToEnvFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates file when it does not exist', () => {
    const filePath = '/fake/path/.env.local';
    const keys = { OPENAI_API_KEY: 'sk-test-123' };

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      filePath,
      'OPENAI_API_KEY=sk-test-123\n'
    );
  });

  it('merges keys into existing file content (preserves other keys)', () => {
    const filePath = '/fake/path/.env.local';
    const keys = { ANTHROPIC_API_KEY: 'sk-ant-456' };
    const existingContent = 'OPENAI_API_KEY=sk-test-123\nOTHER_KEY=value\n';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(existingContent);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    const writtenContent = (fs.writeFileSync as any).mock.calls[0][1];
    expect(writtenContent).toContain('OPENAI_API_KEY=sk-test-123');
    expect(writtenContent).toContain('OTHER_KEY=value');
    expect(writtenContent).toContain('ANTHROPIC_API_KEY=sk-ant-456');
  });

  it('replaces existing key value', () => {
    const filePath = '/fake/path/.env.local';
    const keys = { OPENAI_API_KEY: 'sk-new-value' };
    const existingContent = 'OPENAI_API_KEY=sk-old-value\nOTHER_KEY=value\n';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(existingContent);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    const writtenContent = (fs.writeFileSync as any).mock.calls[0][1];
    expect(writtenContent).toContain('OPENAI_API_KEY=sk-new-value');
    expect(writtenContent).not.toContain('sk-old-value');
    expect(writtenContent).toContain('OTHER_KEY=value');
  });

  it('handles empty keys object (no-op)', () => {
    const filePath = '/fake/path/.env.local';
    const keys = {};
    const existingContent = 'OPENAI_API_KEY=sk-test-123\n';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(existingContent);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      filePath,
      existingContent
    );
  });

  it('skips keys with empty string values', () => {
    const filePath = '/fake/path/.env.local';
    const keys = { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant-456' };

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    const writtenContent = (fs.writeFileSync as any).mock.calls[0][1];
    expect(writtenContent).not.toContain('OPENAI_API_KEY');
    expect(writtenContent).toContain('ANTHROPIC_API_KEY=sk-ant-456');
  });

  it('creates parent directory if it does not exist', () => {
    const filePath = '/fake/path/to/.env.local';
    const keys = { OPENAI_API_KEY: 'sk-test-123' };

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === '/fake/path/to') return false;
      return false;
    });
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/path/to', { recursive: true });
  });

  it('handles multiple keys at once', () => {
    const filePath = '/fake/path/.env.local';
    const keys = {
      OPENAI_API_KEY: 'sk-test-123',
      ANTHROPIC_API_KEY: 'sk-ant-456',
      TAVILY_API_KEY: 'tvly-789',
    };

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    const writtenContent = (fs.writeFileSync as any).mock.calls[0][1];
    expect(writtenContent).toContain('OPENAI_API_KEY=sk-test-123');
    expect(writtenContent).toContain('ANTHROPIC_API_KEY=sk-ant-456');
    expect(writtenContent).toContain('TAVILY_API_KEY=tvly-789');
  });

  it('preserves formatting when replacing keys', () => {
    const filePath = '/fake/path/.env.local';
    const keys = { OPENAI_API_KEY: 'sk-new-value' };
    const existingContent = '# Comment\nOPENAI_API_KEY=sk-old-value\n# Another comment\nOTHER_KEY=value\n';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(existingContent);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    writeKeysToEnvFile(filePath, keys);

    const writtenContent = (fs.writeFileSync as any).mock.calls[0][1];
    expect(writtenContent).toContain('# Comment');
    expect(writtenContent).toContain('# Another comment');
    expect(writtenContent).toContain('OPENAI_API_KEY=sk-new-value');
    expect(writtenContent).toContain('OTHER_KEY=value');
  });
});
