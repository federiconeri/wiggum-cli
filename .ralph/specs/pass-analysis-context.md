# pass-analysis-context Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-02

## Purpose

Extend the `/init → /new` data flow so that the `/new` spec-generation system prompt receives all targeted analysis fields defined in the issue (naming conventions, implementation guidelines, key patterns, etc.), enabling generated specs to more accurately reflect the scanned project's architecture and practices.

## User Stories

- As a developer using `ralph new` after `ralph init`, I want the spec generator to understand my project's naming conventions so that generated specs and examples match my existing style.
- As a developer, I want the spec generator to follow my project's implementation guidelines and technology patterns so that new features align with how the codebase is already structured.
- As a maintainer, I want the context flow from `/init` to `/new` to be strongly typed and centralized so that we can safely add more analysis fields in the future without breaking the orchestration.
- As a maintainer, I want `/new` to degrade gracefully when older `.ralph` data lacks newer analysis fields so that users don't experience crashes or confusing errors.

## Requirements

### Functional Requirements

1. **SessionContext extension**
   - [x] Update the `SessionContext` interface to include all target analysis fields from the issue:
     - [x] `namingConventions?: string`
     - [x] `implementationGuidelines?: string[]`
     - [x] `keyPatterns?: string[]`
   - [x] Keep existing fields intact:
     - [x] `entryPoints?: string[]`
     - [x] `keyDirectories?: Record<string, string>`
     - [x] `commands?: { build?: string; dev?: string; test?: string }`

   **Acceptance Criteria**
   - [x] TypeScript build passes with the extended `SessionContext` interface.
   - [x] No existing references to `SessionContext` require mandatory updates (all new fields are optional).
   - [x] IDE type hints for `SessionContext` show the newly added properties.

2. **Analysis extraction from ScanResult**
   - [x] Update `extractSessionContext(scanResult: ScanResult)` in `src/tui/orchestration/interview-orchestrator.ts` to read the richer analysis fields from `scanResult.aiAnalysis`.
   - [x] Define an internal, narrowed type for `scanResult` that includes:
     - [x] `aiAnalysis.projectContext` containing `entryPoints`, `keyDirectories`, and `namingConventions`.
     - [x] `aiAnalysis.commands` for build/dev/test commands.
     - [x] `aiAnalysis.implementationGuidelines` as `string[]`.
     - [x] `aiAnalysis.technologyPractices.practices` as `string[]` (mapped to `keyPatterns`).
   - [x] Return a `SessionContext` object that maps:
     - [x] `entryPoints` from `aiAnalysis.projectContext.entryPoints`
     - [x] `keyDirectories` from `aiAnalysis.projectContext.keyDirectories`
     - [x] `commands` from `aiAnalysis.commands`
     - [x] `namingConventions` from `aiAnalysis.projectContext.namingConventions`
     - [x] `implementationGuidelines` from `aiAnalysis.implementationGuidelines`
     - [x] `keyPatterns` from `aiAnalysis.technologyPractices.practices`
   - [x] Use optional chaining and optional fields to handle missing properties safely.

   **Acceptance Criteria**
   - [x] When `scanResult.aiAnalysis` includes the above fields, `extractSessionContext` returns a `SessionContext` whose properties match the input data exactly (verified with a unit test).
   - [x] When `scanResult.aiAnalysis` is missing one or more of these fields, `extractSessionContext` returns a `SessionContext` object with the corresponding properties `undefined` but does not throw.
   - [x] When `scanResult.aiAnalysis` is completely absent, `extractSessionContext` returns `undefined` or a minimal object without causing runtime errors in callers.
   - [x] A unit test (e.g., using Vitest) covers:
     - A "full data" scenario.
     - A "partial data" scenario.
     - A "no aiAnalysis" scenario.

3. **Prompt building for /new**
   - [x] Update `buildSystemPrompt()` (or equivalent function) in `src/tui/orchestration/interview-orchestrator.ts` to include the new `SessionContext` properties as separate sections in the prompt used for `/new`.
   - [x] Ensure the prompt includes, in order:
     - [x] Existing context sections:
       - Entry Points
       - Key Directories
       - Commands
     - [x] New sections (conditionally included when data exists):
       - [x] `Naming Conventions` section if `sessionContext.namingConventions` is defined.
       - [x] `Implementation Guidelines` section if `sessionContext.implementationGuidelines` is a non-empty array.
       - [x] `Key Patterns` section if `sessionContext.keyPatterns` is a non-empty array.
   - [x] Format the new sections as:
     - [x] `Naming Conventions:` followed by the text body (string).
     - [x] `Implementation Guidelines:` followed by one bullet `- ` per guideline string.
     - [x] `Key Patterns:` followed by one bullet `- ` per pattern string.
   - [x] Ensure no extra blank sections are rendered when fields are absent or empty.

   **Acceptance Criteria**
   - [x] Given a `SessionContext` with all fields present, the resulting system prompt string contains:
     - [x] A "Naming Conventions:" header followed by the exact `namingConventions` content.
     - [x] An "Implementation Guidelines:" header followed by bullet lines for each guideline.
     - [x] A "Key Patterns:" header followed by bullet lines for each pattern.
   - [x] Given a `SessionContext` with only some fields present, only the corresponding sections are included; missing ones are omitted cleanly (no empty headers or stray newlines).
   - [x] Snapshot or string-based tests confirm the presence/absence and order of sections for:
     - A full-context scenario.
     - A minimal-context scenario.
   - [x] Existing behavior for entry points, directories, and commands in the prompt remains unchanged (verified by existing or updated snapshots).

4. **Graceful degradation with older data**
   - [x] Ensure all property access within `extractSessionContext` and `buildSystemPrompt` uses optional chaining or defensive checks.
   - [x] If `.ralph` or the current session lacks newer analysis fields (e.g., `technologyPractices`), the `/new` flow still runs without error and simply omits those sections from the prompt.
   - [x] No new runtime errors are introduced if the structure of `aiAnalysis` evolves or some fields are missing.

   **Acceptance Criteria**
   - [x] Manual test: run `ralph new` in a project that has not been initialized with the updated `/init` but still has older `.ralph` data; command completes successfully.
   - [x] Any logging added for debugging is either non-intrusive or disabled in production builds.
   - [x] No uncaught exceptions appear in logs when running `/new` with minimal or legacy scan data.

5. **No behavior change to unrelated areas**
   - [x] Do not modify the logic that produces `/init` analysis beyond reading existing fields.
   - [x] Do not change AI model configuration, temperature, or core spec-generation logic.
   - [x] Keep TUI behavior and flow unchanged aside from richer prompt content.

   **Acceptance Criteria**
   - [x] Existing `/init` behavior and outputs remain identical (verified by running `ralph init` before and after the change in a sample project).
   - [x] Any existing tests for `/init` and `/new` pass without changes to their expectations, except where they depend specifically on the system prompt contents (which should be updated only for the added sections).

### Non-Functional Requirements

- [x] **Performance:** Prompt construction remains CPU-light; no asynchronous or I/O-heavy operations are added to `buildSystemPrompt`. There is no noticeable delay added to `/new`.
- [x] **Maintainability:** The mapping from `aiAnalysis` → `SessionContext` → system prompt is clear, with all transformations centralized in `interview-orchestrator.ts`.
- [x] **Testability:** Unit and/or snapshot tests cover the new behavior in both extraction and prompt-building steps using Vitest.
- [x] **Backward Compatibility:** All new fields are optional, and older `.ralph` data or older `aiAnalysis` structures do not break the flow.

## Technical Notes

### Implementation Approach

1. **Update `SessionContext` interface**

   File: `src/tui/orchestration/interview-orchestrator.ts` (or wherever `SessionContext` is defined)

   ```ts
   export interface SessionContext {
     entryPoints?: string[];
     keyDirectories?: Record<string, string>;
     commands?: {
       build?: string;
       dev?: string;
       test?: string;
     };
     namingConventions?: string;
     implementationGuidelines?: string[];
     keyPatterns?: string[]; // NEW
   }
   ```

2. **Enhance `extractSessionContext()`**

   - Narrow the `scanResult` shape with an internal type that exposes the `aiAnalysis` fields we care about.
   - Map them into `SessionContext` with optional chaining.

   Example:

   ```ts
   function extractSessionContext(scanResult: ScanResult): SessionContext | undefined {
     const enhanced = scanResult as ScanResult & {
       aiAnalysis?: {
         projectContext?: {
           entryPoints?: string[];
           keyDirectories?: Record<string, string>;
           namingConventions?: string;
         };
         commands?: SessionContext['commands'];
         implementationGuidelines?: string[];
         technologyPractices?: { practices?: string[] };
       };
     };

     const ai = enhanced.aiAnalysis;
     if (!ai) return undefined;

     return {
       entryPoints: ai.projectContext?.entryPoints,
       keyDirectories: ai.projectContext?.keyDirectories,
       commands: ai.commands,
       namingConventions: ai.projectContext?.namingConventions,
       implementationGuidelines: ai.implementationGuidelines,
       keyPatterns: ai.technologyPractices?.practices,
     };
   }
   ```

3. **Update `buildSystemPrompt()`**

   - Append new sections conditionally based on `SessionContext` fields.
   - Reuse existing `contextParts` pattern.

   Example snippet:

   ```ts
   function buildSystemPrompt(sessionContext?: SessionContext /*, ...other args */): string {
     const contextParts: string[] = [];

     // existing sections (entry points, key directories, commands) ...

     if (sessionContext?.namingConventions) {
       contextParts.push(`\nNaming Conventions:\n${sessionContext.namingConventions}`);
     }

     if (sessionContext?.implementationGuidelines?.length) {
       contextParts.push(`\nImplementation Guidelines:`);
       for (const guideline of sessionContext.implementationGuidelines) {
         contextParts.push(`- ${guideline}`);
       }
     }

     if (sessionContext?.keyPatterns?.length) {
       contextParts.push(`\nKey Patterns:`);
       for (const pattern of sessionContext.keyPatterns) {
         contextParts.push(`- ${pattern}`);
       }
     }

     return contextParts.join('\n');
   }
   ```

4. **Testing (Vitest)**

   - Add/extend tests under the appropriate `src/tui/orchestration/__tests__/` or similar directory.

   Example test outlines:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { extractSessionContext, buildSystemPrompt } from '../interview-orchestrator';

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
       } as any;

       const ctx = extractSessionContext(scanResult);
       expect(ctx?.namingConventions).toBe('Use PascalCase for components');
       expect(ctx?.implementationGuidelines).toEqual(['Use hooks', 'Avoid class components']);
       expect(ctx?.keyPatterns).toEqual(['Repository pattern', 'Functional components']);
     });

     it('handles missing aiAnalysis gracefully', () => {
       const scanResult = {} as any;
       const ctx = extractSessionContext(scanResult);
       expect(ctx).toBeUndefined();
     });
   });

   describe('buildSystemPrompt', () => {
     it('includes new sections when data is present', () => {
       const ctx = {
         namingConventions: 'Kebab-case for file names.',
         implementationGuidelines: ['Prefer composition over inheritance'],
         keyPatterns: ['CQRS', 'Event sourcing'],
       };

       const prompt = buildSystemPrompt(ctx as any);
       expect(prompt).toContain('Naming Conventions:');
       expect(prompt).toContain('Kebab-case for file names.');
       expect(prompt).toContain('Implementation Guidelines:');
       expect(prompt).toContain('- Prefer composition over inheritance');
       expect(prompt).toContain('Key Patterns:');
       expect(prompt).toContain('- CQRS');
       expect(prompt).toContain('- Event sourcing');
     });

     it('omits sections when data is missing', () => {
       const ctx = {};
       const prompt = buildSystemPrompt(ctx as any);
       expect(prompt).not.toContain('Naming Conventions:');
       expect(prompt).not.toContain('Implementation Guidelines:');
       expect(prompt).not.toContain('Key Patterns:');
     });
   });
   ```

### Key Dependencies

- **Framework:** React ^18.3.1 (used in TUI components/hooks, not directly affected but context flows into TUI-driven flows).
- **Testing:** Vitest for unit and snapshot tests.
- **Runtime:** Node.js CLI environment for `ralph` commands.
- **Config/state:** `.ralph` directory may store analysis output; code must not assume presence of new fields.

### Database / Persistence Changes

- No explicit database changes.
- Any persisted `.ralph` analysis data is read as-is; new fields are optional and must be handled defensively.
- No schema migrations are required; the code should tolerate both old and new shapes of `aiAnalysis`.

## Acceptance Criteria (Consolidated, Testable)

- [x] `SessionContext` is extended with `namingConventions`, `implementationGuidelines`, and `keyPatterns` as optional fields, and TypeScript compilation succeeds.
- [x] `extractSessionContext` correctly maps:
  - [x] `aiAnalysis.projectContext.namingConventions` → `SessionContext.namingConventions`
  - [x] `aiAnalysis.implementationGuidelines` → `SessionContext.implementationGuidelines`
  - [x] `aiAnalysis.technologyPractices.practices` → `SessionContext.keyPatterns`
- [x] Unit tests validate `extractSessionContext` for:
  - [x] Full data.
  - [x] Partial data.
  - [x] No `aiAnalysis`.
- [x] `buildSystemPrompt` includes:
  - [x] A "Naming Conventions" section when `namingConventions` is set.
  - [x] An "Implementation Guidelines" section with bullets when `implementationGuidelines` is non-empty.
  - [x] A "Key Patterns" section with bullets when `keyPatterns` is non-empty.
- [x] `buildSystemPrompt` omits the above sections entirely if the respective fields are absent or empty.
- [x] Snapshot/string tests confirm the presence and order of all sections for:
  - [x] A full-context `SessionContext`.
  - [x] A minimal-context `SessionContext`.
- [x] Running `ralph new` on a project initialized with older `/init` data completes successfully without runtime errors and without empty context sections.
- [x] No behavioral regressions are observed in `/init` outputs or core `/new` logic aside from the richer prompt content.

## Out of Scope

- Changing how `/init` generates or structures `aiAnalysis` beyond what is already available.
- Introducing new analysis dimensions not listed in the issue (e.g., performance metrics, dependency graphs).
- Modifying TUI layout, navigation, or UX beyond the richer prompt content behind the scenes.
- Adjusting AI model selection, temperature, or retry logic for the spec generator.
