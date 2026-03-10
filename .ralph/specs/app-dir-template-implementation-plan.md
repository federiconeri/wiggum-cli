# app-dir-template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Spec:** .ralph/specs/app-dir-template.md
**Branch:** feat/app-dir-template
**Status:** Planning

**Goal:** Fix the `appDir` template variable to default to `.` (project root) instead of `src`, and only use `src` or `app` when those directories are clearly valid entry points.

**Architecture:** Modify `extractVariables()` in `src/generator/templates.ts` to change `appDir` resolution: default to `.`, set to `app` for Next.js App Router, set to `src` only when canonical entry files (`src/index.ts`, `src/index.tsx`, `src/main.ts`) exist. Also update the `DEFAULT_VARIABLES` constant to match.

**Tech Stack:** TypeScript, Vitest, Node.js `fs.existsSync`

---

## Tasks

### Phase 1: Setup

- [x] Task 1: Update DEFAULT_VARIABLES.appDir from `'app'` to `'.'` - [complexity: S]

### Phase 2: Core Implementation

- [x] Task 2: Rewrite appDir resolution logic in `extractVariables()` - [complexity: M]

### Phase 3: Tests

- [x] Task 3: Write unit tests for `extractVariables()` appDir behavior - [complexity: M]
- [x] Task 4: Run full test suite and build to verify no regressions - [complexity: S]

---

### Task 1: Update DEFAULT_VARIABLES.appDir

**Files:**
- Modify: `src/generator/templates.ts:83`

**Step 1: Change the default**

In `src/generator/templates.ts`, change line 83 from:
```ts
appDir: 'app',
```
to:
```ts
appDir: '.',
```

This constant is the fallback. With Task 2's logic change, it won't be the primary source of the value, but it should be consistent with the new default.

**Step 2: Commit**

```bash
git add src/generator/templates.ts
git commit -m "chore(templates): change DEFAULT_VARIABLES.appDir to '.'"
```

---

### Task 2: Rewrite appDir resolution logic in `extractVariables()`

**Files:**
- Modify: `src/generator/templates.ts:218` (top of `extractVariables()`)
- Modify: `src/generator/templates.ts:250-261` (current `appDir` logic block)

**Step 1: Add `existsSync` import**

At `src/generator/templates.ts:6`, add `existsSync` to the existing `node:fs/promises` import or add a new import. The file currently imports from `node:fs/promises` (async). Since `existsSync` is in `node:fs` (sync), add:

```ts
import { existsSync } from 'node:fs';
```

Place it after the existing `import { readFile, readdir, stat } from 'node:fs/promises';` line.

Note: `join` is already imported from `node:path` on line 7.

**Step 2: Replace the appDir resolution block**

Replace the current block at lines 250-261:
```ts
  // Determine app directory - use AI entry points if available
  let appDir = 'src';
  if (frameworkVariant === 'app-router' || framework.toLowerCase().includes('next')) {
    appDir = 'app';
  } else if (aiData.aiEntryPoints) {
    // Try to extract common directory from entry points
    const entryPoints = (scanResult as { aiAnalysis?: { projectContext?: { entryPoints?: string[] } } })
      .aiAnalysis?.projectContext?.entryPoints || [];
    if (entryPoints.length > 0 && entryPoints[0].startsWith('src/')) {
      appDir = 'src';
    }
  }
```

With:
```ts
  // Determine app directory
  let appDir = '.'; // Default to project root

  if (frameworkVariant === 'app-router') {
    appDir = 'app';
  } else if (
    existsSync(join(projectRoot, 'src', 'index.ts')) ||
    existsSync(join(projectRoot, 'src', 'index.tsx')) ||
    existsSync(join(projectRoot, 'src', 'main.ts'))
  ) {
    appDir = 'src';
  }
```

Key changes:
- Default is now `'.'` instead of `'src'`
- Removed the `framework.toLowerCase().includes('next')` check — the spec says only `frameworkVariant === 'app-router'` should trigger `'app'`
- Replaced the AI entry-point heuristic with explicit filesystem checks for three canonical entry files
- Uses `existsSync` (sync) which is consistent with the rest of the scanner codebase

**Step 3: Commit**

```bash
git add src/generator/templates.ts
git commit -m "feat(templates): fix appDir to default to project root

Default appDir to '.' instead of 'src'. Only use 'src' when
canonical entry files exist (src/index.ts, src/index.tsx, or
src/main.ts). Use 'app' only for app-router frameworkVariant."
```

---

### Task 3: Write unit tests for `extractVariables()` appDir behavior

**Files:**
- Create: `src/generator/templates.test.ts`

**Step 1: Write the test file**

Follow the existing test pattern from `src/ai/agents/codebase-analyzer.test.ts` — use real temp directories with `beforeEach`/`afterEach` cleanup.

```ts
/**
 * Tests for extractVariables appDir resolution
 *
 * Run with: npx vitest run src/generator/templates.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractVariables } from './templates.js';
import type { ScanResult } from '../scanner/types.js';

function makeScanResult(overrides: {
  projectRoot: string;
  frameworkVariant?: string;
}): ScanResult {
  return {
    projectRoot: overrides.projectRoot,
    stack: {
      framework: {
        name: 'react',
        confidence: 100,
        evidence: [],
        variant: overrides.frameworkVariant,
      },
    },
    scanTime: 0,
  };
}

describe('extractVariables - appDir resolution', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `wiggum-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('defaults appDir to "." when no src entry files exist', () => {
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('.');
  });

  it('sets appDir to "src" when src/index.ts exists', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.ts'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('src');
  });

  it('sets appDir to "src" when src/index.tsx exists', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.tsx'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('src');
  });

  it('sets appDir to "src" when src/main.ts exists', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'main.ts'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('src');
  });

  it('sets appDir to "app" when frameworkVariant is "app-router"', () => {
    // Even if src entry files exist, app-router takes precedence
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.ts'), '');
    const result = extractVariables(
      makeScanResult({ projectRoot: testDir, frameworkVariant: 'app-router' })
    );
    expect(result.appDir).toBe('app');
  });

  it('defaults appDir to "." when src dir exists but has no entry files', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'utils.ts'), '');
    const result = extractVariables(makeScanResult({ projectRoot: testDir }));
    expect(result.appDir).toBe('.');
  });
});
```

**Step 2: Run the tests to verify they pass**

```bash
npx vitest run src/generator/templates.test.ts
```

Expected: All 6 tests pass.

**Step 3: Commit**

```bash
git add src/generator/templates.test.ts
git commit -m "test(templates): add unit tests for appDir resolution"
```

---

### Task 4: Run full test suite and build to verify no regressions

**Files:** None (validation only)

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All existing tests pass (including the new ones from Task 3).

**Step 2: Run TypeScript type-check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Run build**

```bash
npm run build
```

Expected: Clean build with no errors.

**Step 4: Verify no regressions by inspecting a generated template (manual)**

If you have a test project, run ralph on it and verify `appDir` resolves as expected in the generated output. Otherwise, the unit tests from Task 3 cover the core logic.

---

## Done
- [x] Task 1: Update DEFAULT_VARIABLES.appDir from 'app' to '.' (commit: 40e43eb)
- [x] Task 2: Rewrite appDir resolution logic in extractVariables() (commit: 55c80a1)
- [x] Task 3: Write unit tests for extractVariables() appDir behavior (commit: 7a9161b)
- [x] Task 4: Run full test suite and build to verify no regressions (verified: all tests pass, typecheck pass, build pass)
