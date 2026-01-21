/**
 * Stack Utilities
 * Shared helper functions for working with DetectedStack
 */

import type { DetectedStack } from '../../scanner/types.js';

/**
 * Detect project type from the stack
 * Returns a human-readable project type string
 */
export function detectProjectType(stack: DetectedStack | undefined): string {
  if (!stack) {
    return 'Unknown';
  }

  if (stack.mcp?.isProject) {
    return 'MCP Server';
  }

  if (stack.framework?.name?.includes('Next')) {
    return 'Next.js App';
  }

  if (stack.framework?.name?.includes('React')) {
    return 'React SPA';
  }

  if (stack.framework?.name) {
    return `${stack.framework.name} Project`;
  }

  return 'Unknown';
}
