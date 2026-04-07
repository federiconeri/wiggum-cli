import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/github.js', () => ({
  isGitHubIssueUrl: vi.fn(),
  isGhInstalled: vi.fn(),
  fetchGitHubIssue: vi.fn(),
}));

import { fetchContent, isUrl } from './url-fetcher.js';
import { isGitHubIssueUrl, isGhInstalled, fetchGitHubIssue } from '../../utils/github.js';

const mockIsGitHubIssueUrl = vi.mocked(isGitHubIssueUrl);
const mockIsGhInstalled = vi.mocked(isGhInstalled);
const mockFetchGitHubIssue = vi.mocked(fetchGitHubIssue);

describe('fetchContent with GitHub URLs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes GitHub issue URLs through gh CLI', async () => {
    mockIsGitHubIssueUrl.mockReturnValue({ owner: 'acme', repo: 'api', number: 42 });
    mockIsGhInstalled.mockResolvedValue(true);
    mockFetchGitHubIssue.mockResolvedValue({
      title: 'Fix login bug',
      body: 'Login form breaks on mobile.',
      labels: ['bug'],
    });

    const result = await fetchContent('https://github.com/acme/api/issues/42', '/tmp');

    expect(result.content).toContain('# Fix login bug');
    expect(result.content).toContain('Login form breaks on mobile.');
    expect(result.source).toBe('GitHub issue #42');
    expect(result.error).toBeUndefined();
  });

  it('falls back to HTTP when gh is not installed', async () => {
    mockIsGitHubIssueUrl.mockReturnValue({ owner: 'acme', repo: 'api', number: 42 });
    mockIsGhInstalled.mockResolvedValue(false);

    const result = await fetchContent('https://github.com/acme/api/issues/42', '/tmp');
    expect(mockFetchGitHubIssue).not.toHaveBeenCalled();
  });

  it('falls back to HTTP when gh fetch fails', async () => {
    mockIsGitHubIssueUrl.mockReturnValue({ owner: 'acme', repo: 'api', number: 42 });
    mockIsGhInstalled.mockResolvedValue(true);
    mockFetchGitHubIssue.mockResolvedValue(null);

    const result = await fetchContent('https://github.com/acme/api/issues/42', '/tmp');
    expect(result.source).not.toBe('GitHub issue #42');
  });
});

describe('isUrl', () => {
  it('recognizes http URLs', () => {
    expect(isUrl('http://example.com')).toBe(true);
  });

  it('recognizes https URLs', () => {
    expect(isUrl('https://github.com/foo/bar')).toBe(true);
  });

  it('rejects non-URLs', () => {
    expect(isUrl('not a url')).toBe(false);
  });
});

describe('fetchContent HTML sanitization', () => {
  it('removes script/style blocks and preserves encoded angle brackets', async () => {
    mockIsGitHubIssueUrl.mockReturnValue(null);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => `
        <html>
          <head><style>.x { color: red; }</style></head>
          <body>
            <script>alert('xss')</script>
            Hello&nbsp;&lt;script&gt;safe&lt;/script&gt; &amp; &quot;ok&quot;
          </body>
        </html>
      `,
    } as unknown as Response);

    const result = await fetchContent('https://example.com/page', '/tmp');

    fetchSpy.mockRestore();

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Hello');
    expect(result.content).not.toContain("alert('xss')");
    expect(result.content).toContain('&lt;script&gt;safe&lt;/script&gt;');
    expect(result.content).toContain('&amp;');
    expect(result.content).toContain('"ok"');
  });
});
