/**
 * Context7 Documentation Lookup Tool
 * Enables documentation lookup for libraries and frameworks
 */

import { tool, zodSchema } from 'ai';
import { z } from 'zod';

/**
 * Context7 library info
 */
export interface Context7Library {
  id: string;
  name: string;
  description?: string;
  codeSnippetCount?: number;
}

/**
 * Context7 documentation result
 */
export interface Context7DocResult {
  title: string;
  content: string;
  codeExamples?: string[];
}

/**
 * Create a Context7 documentation lookup tool
 * @param apiKey - Context7 API key
 */
export function createContext7Tool(apiKey: string) {
  return tool({
    description: `Look up documentation for libraries and frameworks.
Use this to find:
- API documentation for specific functions
- Usage examples and patterns
- Configuration options
- Best practices from official docs`,
    inputSchema: zodSchema(z.object({
      library: z.string().describe('Library name (e.g., "react", "express", "prisma")'),
      query: z.string().describe('What you want to find in the documentation'),
    })),
    execute: async ({ library, query }) => {
      try {
        // First, resolve the library ID
        const resolveResponse = await fetch('https://api.context7.com/v1/resolve-library-id', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            libraryName: library,
            query: query,
          }),
        });

        if (!resolveResponse.ok) {
          // Try alternative endpoint structure
          return await fallbackDocLookup(apiKey, library, query);
        }

        const resolveData = await resolveResponse.json() as { libraryId?: string; libraries?: Context7Library[] };
        const libraryId = resolveData.libraryId || resolveData.libraries?.[0]?.id;

        if (!libraryId) {
          return `No documentation found for "${library}". Try a different library name.`;
        }

        // Query the documentation
        const queryResponse = await fetch('https://api.context7.com/v1/query-docs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            libraryId,
            query,
          }),
        });

        if (!queryResponse.ok) {
          const errorText = await queryResponse.text();
          return `Documentation lookup failed: ${queryResponse.status} - ${errorText}`;
        }

        const docsData = await queryResponse.json() as { results?: Context7DocResult[] };

        // Format results
        const results: string[] = [];
        results.push(`Documentation for ${library}:`);
        results.push('');

        if (docsData.results && docsData.results.length > 0) {
          for (const doc of docsData.results.slice(0, 3)) {
            results.push(`## ${doc.title}`);
            results.push(doc.content.substring(0, 500));
            if (doc.codeExamples && doc.codeExamples.length > 0) {
              results.push('');
              results.push('Example:');
              results.push('```');
              results.push(doc.codeExamples[0].substring(0, 300));
              results.push('```');
            }
            results.push('');
          }
        } else {
          results.push(`No specific documentation found for query: "${query}"`);
        }

        return results.join('\n');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return `Documentation lookup error: ${errMsg}`;
      }
    },
  });
}

/**
 * Fallback documentation lookup using alternative approach
 */
async function fallbackDocLookup(apiKey: string, library: string, query: string): Promise<string> {
  try {
    // Try a simpler query format
    const response = await fetch(`https://api.context7.com/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `${library} ${query}`,
        limit: 5,
      }),
    });

    if (!response.ok) {
      return `Unable to find documentation for "${library}". The Context7 API may not support this library or the request format has changed.`;
    }

    const data = await response.json() as { results?: Array<{ title: string; content: string }> };

    if (data.results && data.results.length > 0) {
      const results: string[] = [`Documentation for ${library}:`, ''];
      for (const item of data.results.slice(0, 3)) {
        results.push(`## ${item.title}`);
        results.push(item.content.substring(0, 400));
        results.push('');
      }
      return results.join('\n');
    }

    return `No documentation found for "${library}" with query "${query}"`;
  } catch {
    return `Documentation lookup for "${library}" failed. Please check your Context7 API key.`;
  }
}

/**
 * Check if Context7 can be used
 */
export function canUseContext7(apiKey?: string): boolean {
  return !!apiKey && apiKey.length > 0;
}
