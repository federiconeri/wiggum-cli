/**
 * URL Fetcher
 * Fetches content from URLs and local files for context gathering
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { isGitHubIssueUrl, isGhInstalled, fetchGitHubIssue } from '../../utils/github.js';

const MAX_CONTENT_LENGTH = 10000;
const FETCH_TIMEOUT = 10000;

/**
 * Fetched content result
 */
export interface FetchedContent {
  source: string;
  content: string;
  truncated: boolean;
  error?: string;
}

/**
 * Check if a string is a URL
 */
export function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract text content from HTML
 * Simple extraction that removes scripts, styles, and HTML tags
 */
function extractTextFromHtml(html: string): string {
  // Remove script, style, and noscript blocks before generic tag stripping.
  let text = stripElementBlocks(html, 'script');
  text = stripElementBlocks(text, 'style');
  text = stripElementBlocks(text, 'noscript');

  // Remove HTML tags but keep content
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode only safe presentation entities; keep angle brackets encoded.
  text = decodeSafeHtmlEntities(text);

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Remove full HTML element blocks (open tag + content + closing tag) using
 * deterministic string scanning instead of regex.
 */
function stripElementBlocks(input: string, tagName: string): string {
  let output = input;
  const openToken = `<${tagName}`;
  const closeToken = `</${tagName}`;

  while (true) {
    const lower = output.toLowerCase();
    const openStart = lower.indexOf(openToken);
    if (openStart === -1) {
      break;
    }

    const openEnd = lower.indexOf('>', openStart + openToken.length);
    if (openEnd === -1) {
      output = output.slice(0, openStart);
      break;
    }

    const closeStart = lower.indexOf(closeToken, openEnd + 1);
    if (closeStart === -1) {
      output = output.slice(0, openStart);
      break;
    }

    const closeEnd = lower.indexOf('>', closeStart + closeToken.length);
    if (closeEnd === -1) {
      output = output.slice(0, openStart);
      break;
    }

    output = output.slice(0, openStart) + output.slice(closeEnd + 1);
  }

  return output;
}

/** Decode non-structural entities only (quotes/spaces), preserving `<`/`>`/`&`. */
function decodeSafeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Fetch content from a URL
 */
async function fetchFromUrl(url: string): Promise<FetchedContent> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Wiggum-CLI/1.0 (Feature Spec Generator)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        source: url,
        content: '',
        truncated: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let text = await response.text();

    // If HTML, extract text content
    if (contentType.includes('text/html')) {
      text = extractTextFromHtml(text);
    }

    // Truncate if too long
    const truncated = text.length > MAX_CONTENT_LENGTH;
    if (truncated) {
      text = text.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
    }

    return {
      source: url,
      content: text,
      truncated,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      source: url,
      content: '',
      truncated: false,
      error: errorMessage.includes('abort') ? 'Request timed out' : errorMessage,
    };
  }
}

/**
 * Read content from a local file
 */
function readFromFile(filePath: string, projectRoot: string): FetchedContent {
  try {
    const absolutePath = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);

    if (!existsSync(absolutePath)) {
      return {
        source: filePath,
        content: '',
        truncated: false,
        error: 'File not found',
      };
    }

    let content = readFileSync(absolutePath, 'utf-8');

    // Truncate if too long
    const truncated = content.length > MAX_CONTENT_LENGTH;
    if (truncated) {
      content = content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
    }

    return {
      source: filePath,
      content,
      truncated,
    };
  } catch (error) {
    return {
      source: filePath,
      content: '',
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch GitHub issue content via gh CLI
 */
async function fetchGitHubContent(
  owner: string,
  repo: string,
  number: number,
): Promise<FetchedContent | null> {
  if (!(await isGhInstalled())) return null;

  const issue = await fetchGitHubIssue(owner, repo, number);
  if (!issue) return null;

  let content = `# ${issue.title}\n\n${issue.body ?? ''}`;
  const truncated = content.length > MAX_CONTENT_LENGTH;
  if (truncated) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
  }

  return {
    source: `GitHub issue #${number}`,
    content,
    truncated,
  };
}

/**
 * Fetch content from a URL or local file path
 */
export async function fetchContent(
  input: string,
  projectRoot: string
): Promise<FetchedContent> {
  if (isUrl(input)) {
    const ghIssue = isGitHubIssueUrl(input);
    if (ghIssue) {
      const result = await fetchGitHubContent(ghIssue.owner, ghIssue.repo, ghIssue.number);
      if (result) return result;
    }
    return fetchFromUrl(input);
  }
  return readFromFile(input, projectRoot);
}

/**
 * Fetch multiple sources in parallel
 */
export async function fetchMultipleSources(
  inputs: string[],
  projectRoot: string
): Promise<FetchedContent[]> {
  return Promise.all(inputs.map(input => fetchContent(input, projectRoot)));
}
