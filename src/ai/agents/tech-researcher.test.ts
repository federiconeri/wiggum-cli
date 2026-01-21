/**
 * Tests for Tech Researcher
 *
 * Run with: npx vitest run src/ai/agents/tech-researcher.test.ts
 */

import { describe, it, expect } from 'vitest';
import { getDocumentationHints, DOCUMENTATION_HINTS } from './tech-researcher.js';

describe('getDocumentationHints', () => {
  describe('direct matches', () => {
    it('returns hints for exact match "Next.js"', () => {
      const result = getDocumentationHints('Next.js');
      expect(result).toEqual(DOCUMENTATION_HINTS['Next.js']);
      expect(result).toContain('https://nextjs.org/docs/app');
    });

    it('returns hints for exact match "React"', () => {
      const result = getDocumentationHints('React');
      expect(result).toEqual(DOCUMENTATION_HINTS['React']);
      expect(result).toContain('https://react.dev');
    });

    it('returns hints for exact match "MCP"', () => {
      const result = getDocumentationHints('MCP');
      expect(result).toEqual(DOCUMENTATION_HINTS['MCP']);
      expect(result).toContain('https://modelcontextprotocol.io/docs');
    });

    it('returns hints for exact match "Vitest"', () => {
      const result = getDocumentationHints('Vitest');
      expect(result).toEqual(DOCUMENTATION_HINTS['Vitest']);
      expect(result).toContain('https://vitest.dev/guide');
    });

    it('returns hints for exact match "TypeScript"', () => {
      const result = getDocumentationHints('TypeScript');
      expect(result).toEqual(DOCUMENTATION_HINTS['TypeScript']);
      expect(result).toContain('https://www.typescriptlang.org/docs');
    });
  });

  describe('partial matches (case-insensitive)', () => {
    it('matches "next.js" (lowercase) to Next.js', () => {
      const result = getDocumentationHints('next.js');
      expect(result).toEqual(DOCUMENTATION_HINTS['Next.js']);
    });

    it('matches "REACT" (uppercase) to React', () => {
      const result = getDocumentationHints('REACT');
      expect(result).toEqual(DOCUMENTATION_HINTS['React']);
    });

    it('matches "typescript" (lowercase) to TypeScript', () => {
      const result = getDocumentationHints('typescript');
      expect(result).toEqual(DOCUMENTATION_HINTS['TypeScript']);
    });

    it('matches "vitest" (lowercase) to Vitest', () => {
      const result = getDocumentationHints('vitest');
      expect(result).toEqual(DOCUMENTATION_HINTS['Vitest']);
    });
  });

  describe('partial string matches', () => {
    it('matches "Next.js 14" to Next.js', () => {
      const result = getDocumentationHints('Next.js 14');
      expect(result).toEqual(DOCUMENTATION_HINTS['Next.js']);
    });

    it('matches "React 18" to React', () => {
      const result = getDocumentationHints('React 18');
      expect(result).toEqual(DOCUMENTATION_HINTS['React']);
    });

    it('matches "MCP Server" key exactly', () => {
      const result = getDocumentationHints('MCP Server');
      expect(result).toEqual(DOCUMENTATION_HINTS['MCP Server']);
    });
  });

  describe('fallback behavior', () => {
    it('returns generic hint for unknown technology', () => {
      const result = getDocumentationHints('UnknownFramework');
      expect(result).toEqual(['Check official UnknownFramework documentation']);
    });

    it('returns generic hint for empty string', () => {
      const result = getDocumentationHints('');
      expect(result).toEqual(['Check official  documentation']);
    });

    it('returns generic hint for technology not in mapping', () => {
      const result = getDocumentationHints('SomeRandomLib');
      expect(result).toEqual(['Check official SomeRandomLib documentation']);
    });
  });

  describe('specific technology coverage', () => {
    it('has MCP ecosystem hints', () => {
      expect(DOCUMENTATION_HINTS['MCP']).toBeDefined();
      expect(DOCUMENTATION_HINTS['MCP Server']).toBeDefined();
      expect(DOCUMENTATION_HINTS['@modelcontextprotocol/sdk']).toBeDefined();
    });

    it('has frontend framework hints', () => {
      expect(DOCUMENTATION_HINTS['Next.js']).toBeDefined();
      expect(DOCUMENTATION_HINTS['React']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Vue']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Svelte']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Nuxt']).toBeDefined();
    });

    it('has backend framework hints', () => {
      expect(DOCUMENTATION_HINTS['Express']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Fastify']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Hono']).toBeDefined();
      expect(DOCUMENTATION_HINTS['NestJS']).toBeDefined();
    });

    it('has testing tool hints', () => {
      expect(DOCUMENTATION_HINTS['Vitest']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Jest']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Playwright']).toBeDefined();
    });

    it('has database/ORM hints', () => {
      expect(DOCUMENTATION_HINTS['Prisma']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Drizzle']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Supabase']).toBeDefined();
    });

    it('has CLI tool hints', () => {
      expect(DOCUMENTATION_HINTS['Commander']).toBeDefined();
      expect(DOCUMENTATION_HINTS['Yargs']).toBeDefined();
    });
  });
});

describe('DOCUMENTATION_HINTS', () => {
  it('has valid URLs for all entries', () => {
    for (const [tech, hints] of Object.entries(DOCUMENTATION_HINTS)) {
      expect(Array.isArray(hints)).toBe(true);
      expect(hints.length).toBeGreaterThan(0);
      for (const hint of hints) {
        expect(hint).toMatch(/^https?:\/\//);
      }
    }
  });

  it('has no duplicate entries', () => {
    const keys = Object.keys(DOCUMENTATION_HINTS);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
