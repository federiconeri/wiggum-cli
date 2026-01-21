/**
 * Context7 Documentation Lookup Tools
 * Uses official @upstash/context7-tools-ai-sdk for proper two-step workflow
 */

import {
  resolveLibraryId as createResolveLibraryIdTool,
  queryDocs as createQueryDocsTool,
} from '@upstash/context7-tools-ai-sdk';

/**
 * Create Context7 tools using official AI SDK integration
 *
 * The official tools implement the proper two-step workflow:
 * 1. resolveLibraryId - finds the correct library ID
 * 2. queryDocs - queries documentation with specific questions
 *
 * @param apiKey - Context7 API key
 */
export function createContext7Tools(apiKey: string) {
  return {
    resolveLibraryId: createResolveLibraryIdTool({ apiKey }),
    queryDocs: createQueryDocsTool({ apiKey }),
  };
}

/**
 * Check if Context7 can be used
 */
export function canUseContext7(apiKey?: string): boolean {
  return !!apiKey && apiKey.length > 0;
}
