# load-api-keys Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically load known AI provider API keys from `.ralph/.env.local` into `process.env` at CLI startup, so provider detection works without manual shell exports.

**Architecture:** A small utility module (`src/utils/env.ts`) provides a `parseEnvContent()` parser and a `loadApiKeysFromEnvLocal()` loader. The loader reads `.ralph/.env.local`, filters to a centralized `KNOWN_PROVIDER_KEYS` list (extracted from `src/ai/providers.ts`), and sets `process.env` entries. It is called once at the top of `main()` in `src/index.ts`, before any provider detection.

**Tech Stack:** Node.js `fs`/`path` (no external deps), TypeScript, Vitest for tests.

---

**Spec:** `.ralph/specs/load-api-keys.md`
**Branch:** `feat/load-api-keys`
**Status:** ✅ Complete

## Key Design Decisions

1. **Known keys list** — The existing `API_KEY_ENV_VARS` map in `src/ai/providers.ts:27-31` already defines the three provider keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`). The `OPTIONAL_SERVICE_ENV_VARS` at `providers.ts:36-39` defines two more (`TAVILY_API_KEY`, `CONTEXT7_API_KEY`). We will export a single `KNOWN_API_KEYS` array combining both sets, keeping the source of truth in `providers.ts` to avoid drift.

2. **File location** — The spec says `.ralph/.env.local`. The existing `saveKeyToEnvLocal()` in `src/commands/config.ts:45-64` and `saveKeysToEnvLocal()` in `src/tui/screens/InitScreen.tsx:81-82` currently write to `<projectRoot>/.env.local`. This plan loads from `.ralph/.env.local` per the spec. The existing save functions are **not** changed (out of scope per spec).

3. **Precedence** — `.ralph/.env.local` values override `process.env` (file wins over shell), per spec requirement.

4. **No dotenv dependency** — Custom parser using core Node APIs only.

---

## Tasks

### Phase 1: Extract Known Keys Constant

- [x] **Task 1** — Export `KNOWN_API_KEYS` from `src/ai/providers.ts` — [complexity: S] — `3dbd448`

### Phase 2: Core Implementation (TDD)

- [x] **Task 2** — Write failing tests for `parseEnvContent()` — [complexity: S] — `c537c0c`
- [x] **Task 3** — Implement `parseEnvContent()` to pass tests — [complexity: S] — `6b054fc`
- [x] **Task 4** — Write failing tests for `loadApiKeysFromEnvLocal()` — [complexity: M] — `3f5c0cb`
- [x] **Task 5** — Implement `loadApiKeysFromEnvLocal()` to pass tests — [complexity: S] — `1f17edb`
- [x] **Task 6** — Run full test suite, verify no regressions — [complexity: S] — ✅ Verified

### Phase 3: Integration

- [x] **Task 7** — Call `loadApiKeysFromEnvLocal()` in `src/index.ts` `main()` — [complexity: S] — `3273dc8`
- [x] **Task 8** — Build project and verify no type errors — [complexity: S] — ✅ Verified

---

## Detailed Tasks

### Task 1: Export `KNOWN_API_KEYS` from `src/ai/providers.ts`

**Files:**
- Modify: `src/ai/providers.ts:27-39`

**Step 1: Add the exported constant**

Add after the `OPTIONAL_SERVICE_ENV_VARS` definition (after line 41) in `src/ai/providers.ts`:

```typescript
/**
 * All known API keys that can be loaded from .ralph/.env.local
 * Combines provider keys and optional service keys.
 * This is the single source of truth — used by the env loader.
 */
export const KNOWN_API_KEYS: readonly string[] = [
  ...Object.values(API_KEY_ENV_VARS),
  ...Object.values(OPTIONAL_SERVICE_ENV_VARS),
] as const;
```

This produces: `['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'TAVILY_API_KEY', 'CONTEXT7_API_KEY']`.

Note: `API_KEY_ENV_VARS` is a private `const` (not exported). We derive from it rather than duplicating the list.

**Step 2: Export from `src/ai/index.ts`**

Add `KNOWN_API_KEYS` to the existing re-export block from `./providers.js` in `src/ai/index.ts`:

```typescript
export {
  // ... existing exports ...
  KNOWN_API_KEYS,
} from './providers.js';
```

**Step 3: Commit**

```bash
git add src/ai/providers.ts src/ai/index.ts
git commit -m "feat(providers): export KNOWN_API_KEYS constant for env loader"
```

---

### Task 2: Write failing tests for `parseEnvContent()`

**Files:**
- Create: `src/utils/env.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { parseEnvContent } from './env.js';

describe('parseEnvContent', () => {
  it('returns empty object for empty input', () => {
    expect(parseEnvContent('')).toEqual({});
  });

  it('parses simple KEY=VALUE lines', () => {
    const content = 'FOO=bar\nBAZ=qux';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores comment lines starting with #', () => {
    const content = '# This is a comment\nFOO=bar\n# Another comment';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar' });
  });

  it('ignores empty lines', () => {
    const content = '\nFOO=bar\n\n\nBAZ=qux\n';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores malformed lines without =', () => {
    const content = 'INVALIDLINE\nFOO=bar\nANOTHER_BAD';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar' });
  });

  it('treats everything after first = as the value', () => {
    const content = 'KEY=value=with=equals';
    expect(parseEnvContent(content)).toEqual({ KEY: 'value=with=equals' });
  });

  it('trims whitespace around keys and values', () => {
    const content = '  FOO  =  bar baz  ';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar baz' });
  });

  it('skips lines where key is empty after trimming', () => {
    const content = '=nokey\nFOO=bar';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar' });
  });

  it('handles Windows-style line endings (CRLF)', () => {
    const content = 'FOO=bar\r\nBAZ=qux\r\n';
    expect(parseEnvContent(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/env.test.ts`
Expected: FAIL — `Cannot find module './env.js'`

**Step 3: Commit**

```bash
git add src/utils/env.test.ts
git commit -m "test(env): add failing tests for parseEnvContent"
```

---

### Task 3: Implement `parseEnvContent()` to pass tests

**Files:**
- Create: `src/utils/env.ts`

**Step 1: Write minimal implementation**

```typescript
/**
 * Env Loader Utility
 * Loads known AI provider API keys from .ralph/.env.local into process.env
 */

/**
 * Parse dotenv-style content into a key-value map.
 * - Ignores empty lines and comments (lines starting with #).
 * - Ignores malformed lines without `=`.
 * - Treats everything after the first `=` as the value.
 * - Trims whitespace around keys and values.
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (!key) continue;
    result[key] = value;
  }

  return result;
}
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/utils/env.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/utils/env.ts
git commit -m "feat(env): implement parseEnvContent parser"
```

---

### Task 4: Write failing tests for `loadApiKeysFromEnvLocal()`

**Files:**
- Modify: `src/utils/env.test.ts`

**Step 1: Add tests for the loader**

Append to `src/utils/env.test.ts`:

```typescript
import { vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadApiKeysFromEnvLocal } from './env.js';

describe('loadApiKeysFromEnvLocal', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env to a clean-ish state for provider keys
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.CONTEXT7_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('sets known provider keys from file into process.env', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY=sk-test-123\nANTHROPIC_API_KEY=sk-ant-456\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-test-123');
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-456');
  });

  it('overrides existing process.env values (file takes precedence)', () => {
    process.env.OPENAI_API_KEY = 'from-shell';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('OPENAI_API_KEY=from-file\n');

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('from-file');
  });

  it('ignores unknown keys not in KNOWN_API_KEYS', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'OPENAI_API_KEY=sk-test\nSOME_OTHER_KEY=should-not-load\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.OPENAI_API_KEY).toBe('sk-test');
    expect(process.env.SOME_OTHER_KEY).toBeUndefined();
  });

  it('is a no-op when file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const readSpy = vi.spyOn(fs, 'readFileSync');

    loadApiKeysFromEnvLocal();

    expect(readSpy).not.toHaveBeenCalled();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it('does not throw when file read fails', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(() => loadApiKeysFromEnvLocal()).not.toThrow();
  });

  it('loads optional service keys (TAVILY, CONTEXT7)', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'TAVILY_API_KEY=tvly-xxx\nCONTEXT7_API_KEY=c7-yyy\n'
    );

    loadApiKeysFromEnvLocal();

    expect(process.env.TAVILY_API_KEY).toBe('tvly-xxx');
    expect(process.env.CONTEXT7_API_KEY).toBe('c7-yyy');
  });

  it('resolves path relative to process.cwd()', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const existsSpy = vi.spyOn(fs, 'existsSync');

    loadApiKeysFromEnvLocal();

    const expectedPath = path.join(process.cwd(), '.ralph', '.env.local');
    expect(existsSpy).toHaveBeenCalledWith(expectedPath);
  });
});
```

Note: The import block at the top of the file needs to be merged with the existing one. The final file should have a single set of imports:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseEnvContent, loadApiKeysFromEnvLocal } from './env.js';
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/env.test.ts`
Expected: FAIL — `loadApiKeysFromEnvLocal is not a function` (not yet exported)

**Step 3: Commit**

```bash
git add src/utils/env.test.ts
git commit -m "test(env): add failing tests for loadApiKeysFromEnvLocal"
```

---

### Task 5: Implement `loadApiKeysFromEnvLocal()` to pass tests

**Files:**
- Modify: `src/utils/env.ts`

**Step 1: Add the loader function**

Append to `src/utils/env.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { KNOWN_API_KEYS } from '../ai/providers.js';

/**
 * Load known AI provider API keys from .ralph/.env.local into process.env.
 *
 * - Only keys in KNOWN_API_KEYS are loaded; all others are ignored.
 * - File values override existing process.env values (file takes precedence).
 * - If the file does not exist or cannot be read, this is a silent no-op.
 * - Malformed lines are skipped without aborting.
 */
export function loadApiKeysFromEnvLocal(): void {
  try {
    const envPath = path.join(process.cwd(), '.ralph', '.env.local');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnvContent(content);

    for (const key of KNOWN_API_KEYS) {
      if (parsed[key] !== undefined) {
        process.env[key] = parsed[key];
      }
    }
  } catch {
    // Silent failure — do not surface errors to the user.
    // The loader is best-effort; provider detection falls back to shell env.
  }
}
```

Also update the top of `src/utils/env.ts` to add the `fs`, `path`, and `KNOWN_API_KEYS` imports. The full file should look like:

```typescript
/**
 * Env Loader Utility
 * Loads known AI provider API keys from .ralph/.env.local into process.env
 */

import fs from 'fs';
import path from 'path';
import { KNOWN_API_KEYS } from '../ai/providers.js';

// ... parseEnvContent function (already exists) ...

// ... loadApiKeysFromEnvLocal function (added above) ...
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/utils/env.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/utils/env.ts
git commit -m "feat(env): implement loadApiKeysFromEnvLocal loader"
```

---

### Task 6: Run full test suite, verify no regressions

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (existing tests + new tests)

**Step 2: Fix any failures if needed**

If any existing test fails, investigate and fix without breaking the new feature.

---

### Task 7: Call `loadApiKeysFromEnvLocal()` in `src/index.ts`

**Files:**
- Modify: `src/index.ts:1-11` (imports) and `src/index.ts:107-111` (main function)

**Step 1: Add import**

Add to the imports section of `src/index.ts`:

```typescript
import { loadApiKeysFromEnvLocal } from './utils/env.js';
```

**Step 2: Call loader at start of `main()`**

In the `main()` function (currently line 107), add the loader call as the very first statement, before `notifyIfUpdateAvailable()`:

```typescript
export async function main(): Promise<void> {
  // Load API keys from .ralph/.env.local before any provider detection
  loadApiKeysFromEnvLocal();

  const args = process.argv.slice(2);
  // ... rest of main() unchanged
```

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(startup): load API keys from .ralph/.env.local on CLI startup"
```

---

### Task 8: Build project and verify no type errors

**Step 1: Run TypeScript build**

Run: `npm run build`
Expected: No type errors, successful compilation.

**Step 2: Run tests one final time**

Run: `npm test`
Expected: ALL PASS

**Step 3: Verify manually (smoke test)**

Run: `node bin/ralph.js --version`
Expected: Prints version without errors (loader runs silently when `.ralph/.env.local` is absent).

---

## Done

All tasks completed successfully!

### Summary of Implementation

**Phase 1: Extract Known Keys Constant**
- ✅ Exported `KNOWN_API_KEYS` combining provider and service keys (`3dbd448`)

**Phase 2: Core Implementation (TDD)**
- ✅ Created comprehensive test suite for `parseEnvContent()` (`c537c0c`)
- ✅ Implemented `parseEnvContent()` with full dotenv parsing support (`6b054fc`)
- ✅ Created comprehensive test suite for `loadApiKeysFromEnvLocal()` (`3f5c0cb`)
- ✅ Implemented `loadApiKeysFromEnvLocal()` with silent failure handling (`1f17edb`)
- ✅ All 201 tests pass (16 new tests for env loader)

**Phase 3: Integration**
- ✅ Integrated loader into CLI startup in `src/index.ts` (`3273dc8`)
- ✅ TypeScript compilation successful
- ✅ Build successful

### Validation Results

```
✅ Tests: 201 passed (201) - including 16 new env loader tests
✅ TypeScript: No type errors
✅ Build: Successful compilation
```

### Files Created/Modified

1. `src/ai/providers.ts` - Added `KNOWN_API_KEYS` export
2. `src/utils/env.ts` - New utility module (parser + loader)
3. `src/utils/env.test.ts` - New test suite (16 tests)
4. `src/index.ts` - Added loader call at startup

The feature is ready for use. API keys in `.ralph/.env.local` will now be automatically loaded at CLI startup.
