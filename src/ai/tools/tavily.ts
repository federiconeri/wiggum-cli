/**
 * Tavily Web Search Tool
 * Enables web search for current best practices and documentation
 */

import { tool, zodSchema } from 'ai';
import { z } from 'zod';

/**
 * Tavily search result
 */
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/**
 * Tavily API response
 */
interface TavilyApiResponse {
  results: TavilySearchResult[];
  query: string;
  answer?: string;
}

/**
 * Create a Tavily web search tool
 * @param apiKey - Tavily API key
 */
export function createTavilySearchTool(apiKey: string) {
  return tool({
    description: `Search the web for current information.

USAGE TIPS:
- Keep queries concise and specific (not conversational)
- Use timeRange: "year" for recent best practices
- Break complex research into focused individual searches
- Good: "Express middleware error handling patterns"
- Bad: "best practices production 2024 testing documentation"`,
    inputSchema: zodSchema(z.object({
      query: z.string().describe('Search query - be specific and concise'),
      searchDepth: z.enum(['basic', 'advanced']).optional()
        .describe('Search depth - use "advanced" for comprehensive results'),
      maxResults: z.number().min(1).max(10).optional()
        .describe('Maximum number of results (default 5)'),
      timeRange: z.enum(['day', 'week', 'month', 'year']).optional()
        .describe('Time filter for results. Use "year" for recent best practices'),
    })),
    execute: async ({ query, searchDepth, maxResults, timeRange }) => {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: searchDepth || 'basic',
            max_results: maxResults || 5,
            ...(timeRange && { time_range: timeRange }),
            include_answer: true,
            include_raw_content: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return `Search failed: ${response.status} - ${errorText}`;
        }

        const data = await response.json() as TavilyApiResponse;

        // Format results for the AI
        const results: string[] = [];

        if (data.answer) {
          results.push(`Summary: ${data.answer}`);
          results.push('');
        }

        results.push('Sources:');
        for (const result of data.results) {
          results.push(`- ${result.title}`);
          results.push(`  URL: ${result.url}`);
          results.push(`  ${result.content.substring(0, 300)}...`);
          results.push('');
        }

        return results.join('\n');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return `Search error: ${errMsg}`;
      }
    },
  });
}

/**
 * Create a function that checks if Tavily search can be performed
 */
export function canUseTavily(apiKey?: string): boolean {
  return !!apiKey && apiKey.length > 0;
}
