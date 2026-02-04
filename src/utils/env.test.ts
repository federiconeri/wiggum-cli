import { describe, it, expect } from 'vitest';
import { parseEnvContent } from './env.js';

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
});
