/**
 * Tests for MCP Detector
 *
 * Run with: npx vitest run src/ai/agents/mcp-detector.test.ts
 * (Requires vitest to be installed: npm install -D vitest)
 */

import { describe, it, expect } from 'vitest';
import { detectRalphMcpServers, convertToLegacyMcpRecommendations } from './mcp-detector.js';
import type { DetectedStack } from '../../scanner/types.js';

/**
 * Helper to create a DetectionResult
 */
function detection(name: string) {
  return { name, confidence: 1, evidence: [`detected ${name}`] };
}

/**
 * Helper to create a minimal DetectedStack for testing
 */
function createStack(overrides: Partial<DetectedStack> = {}): DetectedStack {
  return {
    language: detection('TypeScript'),
    ...overrides,
  } as DetectedStack;
}

describe('detectRalphMcpServers', () => {
  describe('e2eTesting', () => {
    it('always returns playwright for e2eTesting', () => {
      const result = detectRalphMcpServers(createStack());
      expect(result.e2eTesting).toBe('playwright');
    });
  });

  describe('database detection', () => {
    it('detects Supabase', () => {
      const stack = createStack({
        database: detection('Supabase'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('supabase');
    });

    it('detects PostgreSQL', () => {
      const stack = createStack({
        database: detection('PostgreSQL'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('postgres');
    });

    it('detects Neon as postgres', () => {
      const stack = createStack({
        database: detection('Neon'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('postgres');
    });

    it('detects SQLite', () => {
      const stack = createStack({
        database: detection('SQLite'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('sqlite');
    });

    it('detects Turso as sqlite', () => {
      const stack = createStack({
        database: detection('Turso'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('sqlite');
    });

    it('detects Firebase/Firestore', () => {
      const stack = createStack({
        database: detection('Firestore'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('firebase');
    });

    it('detects MongoDB', () => {
      const stack = createStack({
        database: detection('MongoDB'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBe('mongodb');
    });

    it('returns undefined for unknown database', () => {
      const stack = createStack({
        database: detection('UnknownDB'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.database).toBeUndefined();
    });

    it('returns undefined when no database is detected', () => {
      const result = detectRalphMcpServers(createStack());
      expect(result.database).toBeUndefined();
    });
  });

  describe('framework detection', () => {
    it('adds vercel for Next.js projects', () => {
      const stack = createStack({
        framework: detection('Next.js'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('vercel');
    });

    it('does not add vercel for non-Next.js projects', () => {
      const stack = createStack({
        framework: detection('React'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).not.toContain('vercel');
    });
  });

  describe('deployment detection', () => {
    it('detects Docker deployment', () => {
      const stack = createStack({
        deployment: [detection('Docker')],
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('docker');
    });

    it('detects Vercel deployment', () => {
      const stack = createStack({
        deployment: [detection('Vercel')],
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('vercel');
    });

    it('detects multiple deployments', () => {
      const stack = createStack({
        deployment: [
          detection('Docker'),
          detection('Railway'),
        ],
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('docker');
      expect(result.additional).toContain('railway');
    });
  });

  describe('auth provider detection', () => {
    it('detects Clerk auth', () => {
      const stack = createStack({
        auth: detection('Clerk'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('clerk');
    });

    it('detects Auth0', () => {
      const stack = createStack({
        auth: detection('Auth0'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('auth0');
    });
  });

  describe('analytics detection', () => {
    it('detects PostHog analytics', () => {
      const stack = createStack({
        analytics: [detection('PostHog')],
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('posthog');
    });

    it('detects Sentry', () => {
      const stack = createStack({
        analytics: [detection('Sentry')],
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('sentry');
    });
  });

  describe('payments detection', () => {
    it('detects Stripe payments', () => {
      const stack = createStack({
        payments: detection('Stripe'),
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('stripe');
    });
  });

  describe('scanner recommendations', () => {
    it('includes scanner MCP recommendations', () => {
      const stack = createStack({
        mcp: {
          isProject: false,
          recommended: ['custom-mcp', 'another-mcp'],
        },
      });
      const result = detectRalphMcpServers(stack);
      expect(result.additional).toContain('custom-mcp');
      expect(result.additional).toContain('another-mcp');
    });

    it('deduplicates scanner recommendations', () => {
      const stack = createStack({
        database: detection('Supabase'),
        mcp: {
          isProject: false,
          recommended: ['supabase', 'other-mcp'],
        },
      });
      const result = detectRalphMcpServers(stack);
      // supabase should be in database, not duplicated in additional
      expect(result.database).toBe('supabase');
      expect(result.additional).toContain('other-mcp');
      expect(result.additional).not.toContain('supabase');
    });
  });

  describe('deduplication', () => {
    it('does not duplicate MCPs in additional', () => {
      const stack = createStack({
        framework: detection('Next.js'),
        deployment: [detection('Vercel')],
      });
      const result = detectRalphMcpServers(stack);
      const vercelCount = result.additional.filter(m => m === 'vercel').length;
      expect(vercelCount).toBe(1);
    });
  });
});

describe('convertToLegacyMcpRecommendations', () => {
  it('always includes filesystem and git as essential', () => {
    const result = convertToLegacyMcpRecommendations({
      e2eTesting: 'playwright',
      additional: [],
    });
    expect(result.essential).toContain('filesystem');
    expect(result.essential).toContain('git');
  });

  it('includes playwright in essential', () => {
    const result = convertToLegacyMcpRecommendations({
      e2eTesting: 'playwright',
      additional: [],
    });
    expect(result.essential).toContain('playwright');
  });

  it('includes database in essential when detected', () => {
    const result = convertToLegacyMcpRecommendations({
      e2eTesting: 'playwright',
      database: 'supabase',
      additional: [],
    });
    expect(result.essential).toContain('supabase');
  });

  it('moves additional MCPs to recommended', () => {
    const result = convertToLegacyMcpRecommendations({
      e2eTesting: 'playwright',
      additional: ['docker', 'vercel'],
    });
    expect(result.recommended).toContain('docker');
    expect(result.recommended).toContain('vercel');
  });

  it('returns correct structure for full stack', () => {
    const result = convertToLegacyMcpRecommendations({
      e2eTesting: 'playwright',
      database: 'postgres',
      additional: ['docker', 'stripe'],
    });

    expect(result.essential).toEqual(['filesystem', 'git', 'playwright', 'postgres']);
    expect(result.recommended).toEqual(['docker', 'stripe']);
  });
});
