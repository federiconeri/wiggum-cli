/**
 * Unit tests for interview-orchestrator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractSessionContext,
  buildSystemPrompt,
  parseInterviewResponse,
  type SessionContext,
} from './interview-orchestrator.js';
import type { ScanResult } from '../../scanner/types.js';

describe('extractSessionContext', () => {
  it('extracts full context when aiAnalysis is present', () => {
    const scanResult = {
      aiAnalysis: {
        projectContext: {
          entryPoints: ['src/index.ts'],
          keyDirectories: { src: 'TypeScript source' },
          namingConventions: 'Use PascalCase for components',
        },
        commands: { build: 'npm run build', test: 'npm run test' },
        implementationGuidelines: ['Use hooks', 'Avoid class components'],
        technologyPractices: { practices: ['Repository pattern', 'Functional components'] },
      },
    } as unknown as ScanResult;

    const ctx = extractSessionContext(scanResult);
    expect(ctx?.entryPoints).toEqual(['src/index.ts']);
    expect(ctx?.keyDirectories).toEqual({ src: 'TypeScript source' });
    expect(ctx?.commands).toEqual({ build: 'npm run build', test: 'npm run test' });
    expect(ctx?.namingConventions).toBe('Use PascalCase for components');
    expect(ctx?.implementationGuidelines).toEqual(['Use hooks', 'Avoid class components']);
    expect(ctx?.keyPatterns).toEqual(['Repository pattern', 'Functional components']);
  });

  it('handles partial data gracefully', () => {
    const scanResult = {
      aiAnalysis: {
        projectContext: {
          entryPoints: ['src/main.ts'],
        },
        commands: { dev: 'npm run dev' },
      },
    } as unknown as ScanResult;

    const ctx = extractSessionContext(scanResult);
    expect(ctx?.entryPoints).toEqual(['src/main.ts']);
    expect(ctx?.keyDirectories).toBeUndefined();
    expect(ctx?.commands).toEqual({ dev: 'npm run dev' });
    expect(ctx?.namingConventions).toBeUndefined();
    expect(ctx?.implementationGuidelines).toBeUndefined();
    expect(ctx?.keyPatterns).toBeUndefined();
  });

  it('handles missing aiAnalysis gracefully', () => {
    const scanResult = {} as ScanResult;
    const ctx = extractSessionContext(scanResult);
    expect(ctx).toBeUndefined();
  });

  it('extracts keyPatterns from technologyPractices.practices', () => {
    const scanResult = {
      aiAnalysis: {
        technologyPractices: {
          practices: ['CQRS', 'Event sourcing', 'DDD'],
        },
      },
    } as unknown as ScanResult;

    const ctx = extractSessionContext(scanResult);
    expect(ctx?.keyPatterns).toEqual(['CQRS', 'Event sourcing', 'DDD']);
  });

  it('handles missing technologyPractices gracefully', () => {
    const scanResult = {
      aiAnalysis: {
        projectContext: {
          entryPoints: ['index.js'],
        },
      },
    } as unknown as ScanResult;

    const ctx = extractSessionContext(scanResult);
    expect(ctx?.keyPatterns).toBeUndefined();
  });
});

describe('buildSystemPrompt', () => {
  describe('new context sections', () => {
    it('includes Naming Conventions section when data is present', () => {
      const ctx: SessionContext = {
        namingConventions: 'Kebab-case for file names.',
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Naming Conventions:');
      expect(prompt).toContain('Kebab-case for file names.');
    });

    it('includes Implementation Guidelines section when data is present', () => {
      const ctx: SessionContext = {
        implementationGuidelines: ['Prefer composition over inheritance', 'Use TypeScript strict mode'],
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Implementation Guidelines:');
      expect(prompt).toContain('- Prefer composition over inheritance');
      expect(prompt).toContain('- Use TypeScript strict mode');
    });

    it('includes Key Patterns section when data is present', () => {
      const ctx: SessionContext = {
        keyPatterns: ['CQRS', 'Event sourcing'],
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Key Patterns:');
      expect(prompt).toContain('- CQRS');
      expect(prompt).toContain('- Event sourcing');
    });

    it('includes all new sections when all data is present', () => {
      const ctx: SessionContext = {
        namingConventions: 'Use camelCase for variables',
        implementationGuidelines: ['Write tests first', 'Keep functions pure'],
        keyPatterns: ['Factory pattern', 'Singleton pattern'],
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Naming Conventions:');
      expect(prompt).toContain('Use camelCase for variables');
      expect(prompt).toContain('Implementation Guidelines:');
      expect(prompt).toContain('- Write tests first');
      expect(prompt).toContain('- Keep functions pure');
      expect(prompt).toContain('Key Patterns:');
      expect(prompt).toContain('- Factory pattern');
      expect(prompt).toContain('- Singleton pattern');
    });
  });

  describe('omits sections when data is missing', () => {
    it('omits Naming Conventions when undefined', () => {
      const ctx: SessionContext = {};
      const prompt = buildSystemPrompt(ctx);
      expect(prompt).not.toContain('Naming Conventions:');
    });

    it('omits Implementation Guidelines when empty array', () => {
      const ctx: SessionContext = {
        implementationGuidelines: [],
      };
      const prompt = buildSystemPrompt(ctx);
      expect(prompt).not.toContain('Implementation Guidelines:');
    });

    it('omits Key Patterns when empty array', () => {
      const ctx: SessionContext = {
        keyPatterns: [],
      };
      const prompt = buildSystemPrompt(ctx);
      expect(prompt).not.toContain('Key Patterns:');
    });

    it('omits all new sections when all data is missing', () => {
      const ctx: SessionContext = {};
      const prompt = buildSystemPrompt(ctx);
      expect(prompt).not.toContain('Naming Conventions:');
      expect(prompt).not.toContain('Implementation Guidelines:');
      expect(prompt).not.toContain('Key Patterns:');
    });
  });

  describe('existing sections', () => {
    it('includes Entry Points section when present', () => {
      const ctx: SessionContext = {
        entryPoints: ['src/index.ts', 'src/main.ts'],
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Entry Points:');
      expect(prompt).toContain('- src/index.ts');
      expect(prompt).toContain('- src/main.ts');
    });

    it('includes Key Directories section when present', () => {
      const ctx: SessionContext = {
        keyDirectories: {
          src: 'Source code',
          tests: 'Test files',
        },
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Key Directories:');
      expect(prompt).toContain('- src: Source code');
      expect(prompt).toContain('- tests: Test files');
    });

    it('includes Commands section when present', () => {
      const ctx: SessionContext = {
        commands: {
          build: 'npm run build',
          test: 'npm test',
        },
      };

      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain('Commands:');
      expect(prompt).toContain('- build: npm run build');
      expect(prompt).toContain('- test: npm test');
    });
  });

  describe('full context scenario', () => {
    it('includes all sections in correct order', () => {
      const ctx: SessionContext = {
        entryPoints: ['src/index.ts'],
        keyDirectories: { src: 'Source' },
        commands: { build: 'npm run build' },
        namingConventions: 'Use kebab-case',
        implementationGuidelines: ['Follow DRY principle'],
        keyPatterns: ['MVC pattern'],
      };

      const prompt = buildSystemPrompt(ctx);

      // Check all sections are present
      expect(prompt).toContain('Entry Points:');
      expect(prompt).toContain('Key Directories:');
      expect(prompt).toContain('Commands:');
      expect(prompt).toContain('Naming Conventions:');
      expect(prompt).toContain('Implementation Guidelines:');
      expect(prompt).toContain('Key Patterns:');

      // Check order: Entry Points should come before Naming Conventions
      const entryPointsPos = prompt.indexOf('Entry Points:');
      const namingPos = prompt.indexOf('Naming Conventions:');
      const guidelinesPos = prompt.indexOf('Implementation Guidelines:');
      const patternsPos = prompt.indexOf('Key Patterns:');

      expect(entryPointsPos).toBeLessThan(namingPos);
      expect(namingPos).toBeLessThan(guidelinesPos);
      expect(guidelinesPos).toBeLessThan(patternsPos);
    });
  });

  describe('minimal context scenario', () => {
    it('works with no session context', () => {
      const prompt = buildSystemPrompt();

      // Should still include base prompt parts
      expect(prompt).toContain('expert product manager');
      expect(prompt).toContain('Spec Format');

      // Should not include project context sections
      expect(prompt).not.toContain('Entry Points:');
      expect(prompt).not.toContain('Naming Conventions:');
    });

    it('works with empty session context', () => {
      const ctx: SessionContext = {};
      const prompt = buildSystemPrompt(ctx);

      // Should include base prompt
      expect(prompt).toContain('expert product manager');

      // Should not include any project context sections
      expect(prompt).not.toContain('Entry Points:');
      expect(prompt).not.toContain('Naming Conventions:');
      expect(prompt).not.toContain('Implementation Guidelines:');
      expect(prompt).not.toContain('Key Patterns:');
    });
  });

  describe('tool awareness', () => {
    it('includes tool sections when tools are available', () => {
      const hasTools = { codebase: true, tavily: true, context7: true };
      const prompt = buildSystemPrompt(undefined, hasTools);

      expect(prompt).toContain('Available Tools');
      expect(prompt).toContain('read_file');
      expect(prompt).toContain('tavily_search');
      expect(prompt).toContain('resolveLibraryId');
    });

    it('omits tool sections when no tools', () => {
      const hasTools = { codebase: false, tavily: false, context7: false };
      const prompt = buildSystemPrompt(undefined, hasTools);

      expect(prompt).not.toContain('Available Tools');
    });
  });
});

describe('parseInterviewResponse', () => {
  describe('valid responses', () => {
    it('parses valid response with question text and options block', () => {
      const response = `What database would you like to use?

\`\`\`options
[
  {"id": "postgres", "label": "PostgreSQL"},
  {"id": "mysql", "label": "MySQL"},
  {"id": "mongodb", "label": "MongoDB"}
]
\`\`\``;

      const result = parseInterviewResponse(response);

      expect(result).not.toBeNull();
      expect(result?.context).toBe('');
      expect(result?.text).toBe('What database would you like to use?');
      expect(result?.options).toHaveLength(3);
      expect(result?.options[0]).toEqual({ id: 'postgres', label: 'PostgreSQL' });
      expect(result?.options[1]).toEqual({ id: 'mysql', label: 'MySQL' });
      expect(result?.options[2]).toEqual({ id: 'mongodb', label: 'MongoDB' });
      expect(result?.id).toMatch(/^q_\d+_[a-z0-9]+$/);
    });

    it('handles options with extra whitespace/newlines', () => {
      const response = `  Which testing framework?

\`\`\`options
[
  {"id": "jest", "label": "Jest"},

  {"id": "vitest", "label": "Vitest"},
  {"id": "mocha", "label": "Mocha"}
]
\`\`\`  `;

      const result = parseInterviewResponse(response);

      expect(result).not.toBeNull();
      expect(result?.context).toBe('');
      expect(result?.text).toBe('Which testing framework?');
      expect(result?.options).toHaveLength(3);
    });

    it('preserves option order and labels exactly', () => {
      const response = `Choose your styling approach:

\`\`\`options
[
  {"id": "z", "label": "Z - Third alphabetically"},
  {"id": "a", "label": "A - First alphabetically"},
  {"id": "m", "label": "M - Middle alphabetically"}
]
\`\`\``;

      const result = parseInterviewResponse(response);

      expect(result).not.toBeNull();
      expect(result?.options[0].label).toBe('Z - Third alphabetically');
      expect(result?.options[1].label).toBe('A - First alphabetically');
      expect(result?.options[2].label).toBe('M - Middle alphabetically');
    });

    it('splits context from question when multiple paragraphs with question mark', () => {
      const response = `Got it, you want JWT authentication.

Which database would you prefer?

\`\`\`options
[
  {"id": "postgres", "label": "PostgreSQL"},
  {"id": "mysql", "label": "MySQL"}
]
\`\`\``;

      const result = parseInterviewResponse(response);

      expect(result).not.toBeNull();
      expect(result?.context).toBe('Got it, you want JWT authentication.');
      expect(result?.text).toBe('Which database would you prefer?');
    });

    it('keeps all text as text when multiple paragraphs but none end with ?', () => {
      const response = `Let me ask about authentication.

This is important for security.

\`\`\`options
[
  {"id": "jwt", "label": "JWT tokens"},
  {"id": "session", "label": "Session cookies"}
]
\`\`\``;

      const result = parseInterviewResponse(response);

      expect(result).not.toBeNull();
      expect(result?.context).toBe('');
      expect(result?.text).toBe('Let me ask about authentication.\n\nThis is important for security.');
    });
  });

  describe('invalid responses', () => {
    it('returns null for response without options block', () => {
      const response = 'What database would you like to use?';
      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON in options block', () => {
      const response = `What database?

\`\`\`options
[
  {"id": "postgres", "label": "PostgreSQL",}
  {"id": "mysql", "label": "MySQL"}
]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null when JSON is not an array', () => {
      const response = `What database?

\`\`\`options
{"id": "postgres", "label": "PostgreSQL"}
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null when options have missing id field', () => {
      const response = `What database?

\`\`\`options
[
  {"label": "PostgreSQL"},
  {"id": "mysql", "label": "MySQL"}
]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null when options have missing label field', () => {
      const response = `What database?

\`\`\`options
[
  {"id": "postgres"},
  {"id": "mysql", "label": "MySQL"}
]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null for empty options array', () => {
      const response = `What database?

\`\`\`options
[]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null when question text is missing', () => {
      const response = `\`\`\`options
[
  {"id": "postgres", "label": "PostgreSQL"},
  {"id": "mysql", "label": "MySQL"}
]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null when options have non-string id', () => {
      const response = `What database?

\`\`\`options
[
  {"id": 123, "label": "PostgreSQL"}
]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('returns null when options have non-string label', () => {
      const response = `What database?

\`\`\`options
[
  {"id": "postgres", "label": 456}
]
\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles options block with context text after', () => {
      const response = `What database?

\`\`\`options
[
  {"id": "postgres", "label": "PostgreSQL"},
  {"id": "mysql", "label": "MySQL"}
]
\`\`\`

Choose based on your needs.`;

      const result = parseInterviewResponse(response);

      expect(result).not.toBeNull();
      expect(result?.context).toBe('');
      expect(result?.text).toBe('What database?');
      expect(result?.options).toHaveLength(2);
    });

    it('handles response with only options block marker but empty', () => {
      const response = `What database?

\`\`\`options

\`\`\``;

      const result = parseInterviewResponse(response);
      expect(result).toBeNull();
    });

    it('generates unique question IDs for multiple calls', () => {
      const response = `Test question

\`\`\`options
[{"id": "opt1", "label": "Option 1"}]
\`\`\``;

      const result1 = parseInterviewResponse(response);
      const result2 = parseInterviewResponse(response);

      expect(result1?.id).not.toBe(result2?.id);
    });
  });
});

