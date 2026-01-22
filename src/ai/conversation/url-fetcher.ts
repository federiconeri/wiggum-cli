/**
 * URL Fetcher
 * Fetches content from URLs and local files for context gathering
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

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
  // Remove script and style tags with their content
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML tags but keep content
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
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
 * Fetch content from a URL or local file path
 */
export async function fetchContent(
  input: string,
  projectRoot: string
): Promise<FetchedContent> {
  if (isUrl(input)) {
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
