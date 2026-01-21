/**
 * MCP Detector (Phase 3 helper)
 * Detects ralph-essential MCP servers based on the detected stack
 *
 * This is a pure function (no LLM) - uses rule-based detection for efficiency
 */

import type { DetectedStack } from '../../scanner/types.js';
import type { RalphMcpServers } from './types.js';

/**
 * Database name to MCP server mapping
 */
const DATABASE_MCP_MAP: Record<string, string> = {
  supabase: 'supabase',
  convex: 'convex',
  postgres: 'postgres',
  postgresql: 'postgres',
  sqlite: 'sqlite',
  firebase: 'firebase',
  firestore: 'firebase',
  mongodb: 'mongodb',
  mysql: 'mysql',
  redis: 'redis',
  planetscale: 'planetscale',
  neon: 'postgres', // Neon is PostgreSQL-compatible
  turso: 'sqlite',  // Turso is SQLite-compatible
};

/**
 * Framework-specific MCP recommendations
 */
const FRAMEWORK_MCP_MAP: Record<string, string[]> = {
  'next.js': ['vercel'],
  'nextjs': ['vercel'],
  'vercel': ['vercel'],
  'remix': [],
  'astro': [],
  'nuxt': [],
  'sveltekit': [],
};

/**
 * Service-specific MCP recommendations
 */
const SERVICE_MCP_MAP: Record<string, string> = {
  stripe: 'stripe',
  clerk: 'clerk',
  auth0: 'auth0',
  github: 'github',
  gitlab: 'gitlab',
  aws: 'aws',
  gcp: 'gcp',
  azure: 'azure',
  docker: 'docker',
  kubernetes: 'kubernetes',
  k8s: 'kubernetes',
  posthog: 'posthog',
  sentry: 'sentry',
  resend: 'resend',
  sendgrid: 'sendgrid',
  twilio: 'twilio',
};

/**
 * Detect ralph-essential MCP servers from the stack
 *
 * Ralph loop essentials:
 * - Playwright: Always recommended for E2E testing
 * - Database MCP: If database is detected
 * - Additional MCPs based on services and deployment
 */
export function detectRalphMcpServers(stack: DetectedStack): RalphMcpServers {
  const result: RalphMcpServers = {
    e2eTesting: 'playwright', // Always recommend Playwright for ralph loop
    additional: [],
  };

  // Detect database MCP
  if (stack.database) {
    const dbName = stack.database.name.toLowerCase();

    // Check direct mapping
    for (const [key, mcp] of Object.entries(DATABASE_MCP_MAP)) {
      if (dbName.includes(key)) {
        result.database = mcp;
        break;
      }
    }
  }

  // Check ORM for database hints
  if (!result.database && stack.orm) {
    const ormName = stack.orm.name.toLowerCase();
    if (ormName.includes('prisma') || ormName.includes('drizzle')) {
      // These ORMs often use PostgreSQL by default
      // But we don't set a default - let it be detected from actual DB config
    }
  }

  // Detect framework-specific MCPs
  if (stack.framework) {
    const frameworkName = stack.framework.name.toLowerCase();
    for (const [key, mcps] of Object.entries(FRAMEWORK_MCP_MAP)) {
      if (frameworkName.includes(key)) {
        result.additional.push(...mcps);
        break;
      }
    }
  }

  // Detect deployment MCPs
  if (stack.deployment) {
    for (const deploy of stack.deployment) {
      const deployName = deploy.name.toLowerCase();
      if (deployName.includes('docker')) {
        addIfNotExists(result.additional, 'docker');
      }
      if (deployName.includes('vercel')) {
        addIfNotExists(result.additional, 'vercel');
      }
      if (deployName.includes('railway')) {
        addIfNotExists(result.additional, 'railway');
      }
    }
  }

  // Detect auth provider MCPs
  if (stack.auth) {
    const authName = stack.auth.name.toLowerCase();
    for (const [key, mcp] of Object.entries(SERVICE_MCP_MAP)) {
      if (authName.includes(key)) {
        addIfNotExists(result.additional, mcp);
        break;
      }
    }
  }

  // Detect analytics MCPs
  if (stack.analytics) {
    for (const analytics of stack.analytics) {
      const analyticsName = analytics.name.toLowerCase();
      for (const [key, mcp] of Object.entries(SERVICE_MCP_MAP)) {
        if (analyticsName.includes(key)) {
          addIfNotExists(result.additional, mcp);
          break;
        }
      }
    }
  }

  // Detect payment MCPs
  if (stack.payments) {
    const paymentName = stack.payments.name.toLowerCase();
    for (const [key, mcp] of Object.entries(SERVICE_MCP_MAP)) {
      if (paymentName.includes(key)) {
        addIfNotExists(result.additional, mcp);
        break;
      }
    }
  }

  // Add any MCP recommendations from scanner
  if (stack.mcp?.recommended) {
    for (const rec of stack.mcp.recommended) {
      const normalizedRec = rec.toLowerCase();
      // Skip if it's the database or playwright (already handled)
      if (normalizedRec !== result.database && normalizedRec !== 'playwright') {
        addIfNotExists(result.additional, rec);
      }
    }
  }

  return result;
}

/**
 * Convert RalphMcpServers to the legacy McpRecommendations format
 * for backward compatibility with existing code
 *
 * Ralph loop essentials only:
 * - Playwright for E2E testing (always)
 * - Database MCP if detected (Supabase, Convex, Postgres, etc.)
 *
 * Note: filesystem and git are assumed available in Claude Code
 */
export function convertToLegacyMcpRecommendations(ralphMcp: RalphMcpServers): {
  essential: string[];
  recommended: string[];
} {
  const essential: string[] = [];

  // Ralph loop essentials only
  // 1. Playwright for E2E testing (always)
  if (ralphMcp.e2eTesting) {
    essential.push(ralphMcp.e2eTesting);
  }

  // 2. Database MCP if detected (Supabase, Convex, Postgres, etc.)
  if (ralphMcp.database) {
    essential.push(ralphMcp.database);
  }

  return {
    essential,
    recommended: [], // No optional MCPs - keep focused on Ralph loop
  };
}

/**
 * Helper to add item to array if not already present
 */
function addIfNotExists(arr: string[], item: string): void {
  if (!arr.includes(item)) {
    arr.push(item);
  }
}
