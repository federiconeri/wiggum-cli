# load-api-keys Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-04

---

## Purpose

Ensure Wiggum reliably detects AI providers by automatically loading known AI API keys from `.ralph/.env.local` into `process.env` at startup, so provider detection and downstream UI state (e.g., “configured/unconfigured”) are accurate without extra manual steps.

---

## User Stories

- As a developer using Wiggum, I want API keys stored in `.ralph/.env.local` to be automatically loaded on startup so that Wiggum immediately recognizes configured AI providers.
- As a developer, I want only known AI provider keys to be loaded from `.ralph/.env.local` so that unrelated environment variables are not injected into the process.
- As a developer, I want `.ralph/.env.local` values to override any existing shell environment values for provider keys so that my project-local configuration is the source of truth.

---

## Requirements

### Functional Requirements

1. **Startup Load Behavior**
   - [x] On CLI startup, before any provider detection (e.g., `getAvailableProvider()`), Wiggum MUST attempt to load known AI provider keys from `<project-root>/.ralph/.env.local`.
   - [x] If `.ralph/.env.local` does not exist, the loader MUST be a no-op and MUST NOT introduce new user-facing warnings or errors.

2. **Scope of Loaded Keys**
   - [x] The loader MUST only consider a defined set of **known AI provider keys**, e.g.:
     - `OPENAI_API_KEY`
     - `ANTHROPIC_API_KEY`
     - (and any others already supported by the existing provider logic)
   - [x] Keys present in `.ralph/.env.local` that are not in this known list MUST be ignored and MUST NOT be added to `process.env`.

3. **Precedence Rules**
   - [x] For each known provider key:
     - If the key exists in `.ralph/.env.local`, the loader MUST set `process.env[KEY]` to the value from the file, **even if** `process.env[KEY]` was already set by the shell.
     - If the key does not exist in `.ralph/.env.local`, the loader MUST leave `process.env[KEY]` unchanged (if set) or unset (if not set).

4. **Parsing Rules**
   - [x] The loader MUST support a simple dotenv-style format:
     - `KEY=VALUE` per line.
   - [x] The loader MUST:
     - [x] Ignore empty lines.
     - [x] Ignore lines starting with `#` (treated as comments).
     - [x] Ignore malformed lines that do not contain `=` (skip, do not throw).
   - [x] The loader MUST treat everything after the first `=` as the value (including additional `=` characters).
   - [x] The loader MUST trim whitespace around keys and values.

5. **Error Handling**
   - [x] If `.ralph/.env.local` cannot be read (e.g., permission issues, transient I/O error), the loader MUST:
     - Catch the error.
     - Fail silently from the user's perspective (no new TUI error screens).
     - Optionally log at a debug/trace level if existing logging utilities support it, without exposing API key values.
   - [x] A malformed line MUST NOT cause the entire load to fail; the loader continues processing remaining lines.

6. **Idempotency**
   - [x] Multiple invocations of the loader within the same process MUST produce the same final `process.env` state as a single invocation (i.e., re-applying the same values is allowed, with no additional side-effects).

---

### Non-Functional Requirements

- **Performance**
  - [x] File reading and parsing for `.ralph/.env.local` MUST be lightweight; it should not add a perceptible delay to CLI startup (single small file, synchronous or early async read is acceptable).
- **Security & Privacy**
  - [x] The loader MUST NOT log or display full API key values.
  - [x] Any debug or error logs MUST restrict themselves to file path and error type, not secrets.
- **Maintainability**
  - [x] The list of known provider keys MUST be centralized in one module or reused from existing provider detection logic to avoid duplication and drift.
  - [x] The parsing and loading logic MUST be encapsulated in a small, testable utility with clear unit tests (Vitest).
- **Compatibility**
  - [x] The feature MUST not require adding additional dependencies like `dotenv`; it should rely on core Node APIs.
  - [x] The behavior for missing `.ralph/.env.local` MUST match existing behavior (no new user-visible warnings for that case).

---

## Technical Notes

### Relevant Project Context

- Entry point: `src/index.ts` (compiled to `dist/index.js`, with `bin/ralph.js` as the CLI shim).
- AI provider detection: implemented under `src/ai` (e.g., providers and `getAvailableProvider()`).
- Project-local data: stored under `.ralph/` directory in the project root.
- TUI and CLI flows depend on provider availability to render header status and tips (though header/tip changes are out-of-scope for this feature).

### Implementation Approach

1. **Utility Function for Loading Keys**

   - Create a utility function, e.g. `loadApiKeysFromEnvLocal()` in a shared location such as:
     - `src/utils/env.ts` (or another appropriate existing utilities module).
   - Function responsibilities:
     1. Resolve path: `path.join(process.cwd(), '.ralph', '.env.local')`.
     2. If file does not exist:
        - Return immediately (no logging required).
     3. Read the file content (UTF-8).
     4. Parse it into a map using a simple line-based parser.
     5. For each key in the centralized `KNOWN_PROVIDER_KEYS` list:
        - If present in the parsed map, assign `process.env[KEY] = parsedValue`.

2. **Centralizing Known Provider Keys**

   - Identify existing provider detection logic (e.g., under `src/ai/providers` or `src/ai/index`).
   - Extract or define a shared list, e.g.:

     ```ts
     export const KNOWN_PROVIDER_KEYS = [
       'OPENAI_API_KEY',
       'ANTHROPIC_API_KEY',
       // ...any other provider keys supported today
     ] as const;
     ```

   - Reuse this list in both the loader and provider detection to avoid divergence.

3. **Parser Implementation**

   - Implement a minimal parser instead of pulling in `dotenv`:

     ```ts
     function parseEnvContent(content: string): Record<string, string> {
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

   - This parser:
     - Properly ignores comments and malformed lines.
     - Supports values containing `=` and whitespace.
     - Does not attempt quote parsing/unquoting.

4. **Loader Implementation Sketch**

   ```ts
   import fs from 'fs';
   import path from 'path';
   import { KNOWN_PROVIDER_KEYS } from '../ai/providers/keys'; // example path

   export function loadApiKeysFromEnvLocal(): void {
     try {
       const envPath = path.join(process.cwd(), '.ralph', '.env.local');
       if (!fs.existsSync(envPath)) return;

       const content = fs.readFileSync(envPath, 'utf8');
       const parsed = parseEnvContent(content);

       for (const key of KNOWN_PROVIDER_KEYS) {
         if (parsed[key] !== undefined) {
           process.env[key] = parsed[key]; // .ralph/.env.local takes precedence
         }
       }
     } catch (err) {
       // Optional: use existing logger at debug/trace level, without secrets
       // logger.debug?.(`Failed to load .ralph/.env.local: ${String(err)}`);
     }
   }
   ```

5. **Entry Point Integration**

   - In `src/index.ts` (or the earliest shared startup point):
     - Import and invoke the loader **before** any provider detection or TUI initialization.

     ```ts
     import { loadApiKeysFromEnvLocal } from './utils/env'; // example path
     import { getAvailableProvider } from './ai/providers'; // example

     // Early in main:
     loadApiKeysFromEnvLocal();

     // Then run existing logic:
     const provider = getAvailableProvider();
     // ...rest of initialization
     ```

   - Ensure this call happens exactly once on process startup.

6. **Testing with Vitest**

   - **Unit Tests for `parseEnvContent`:**
     - Empty input returns `{}`.
     - Lines with comments and empty lines are ignored.
     - Malformed lines without `=` are ignored.
     - Values with spaces and `=` characters are parsed correctly.
   - **Unit Tests for `loadApiKeysFromEnvLocal`:**
     - Use a temporary directory or mock `fs`:
       - When `.ralph/.env.local` exists with known keys:
         - `process.env` is updated with those values.
       - When `.ralph/.env.local` defines a key already present in `process.env`:
         - After loading, `process.env[KEY]` equals the file’s value (file precedence).
       - When `.ralph/.env.local` defines unknown keys:
         - Those keys do not appear in `process.env` after loading.
       - When file does not exist:
         - No changes to `process.env`.
         - No errors thrown.
       - When file read throws:
         - The function does not throw to the caller.

---

## Acceptance Criteria

- [x] When `.ralph/.env.local` contains `OPENAI_API_KEY=abc123` and the shell has no `OPENAI_API_KEY`, then after startup and before `getAvailableProvider()` runs, `process.env.OPENAI_API_KEY === 'abc123'`.
- [x] When the shell has `OPENAI_API_KEY=from-shell` and `.ralph/.env.local` contains `OPENAI_API_KEY=from-file`, then after startup, `process.env.OPENAI_API_KEY === 'from-file'`.
- [x] When `.ralph/.env.local` contains `SOME_OTHER_KEY=value` and no known provider keys, then after startup, `process.env.SOME_OTHER_KEY` remains `undefined` (the loader does not inject it).
- [x] When `.ralph/.env.local` is missing, running the CLI does not throw or show a new warning, and any existing provider detection continues to rely solely on existing `process.env`.
- [x] Malformed lines (e.g., `INVALIDLINE`, `=novalue`) in `.ralph/.env.local` do not cause an exception; valid lines in the same file are still applied.
- [x] No logs or error messages produced by this feature contain the actual API key values.

---

## Out of Scope

- Migrating an existing `<project-root>/.env.local` file into `.ralph/.env.local`.
- Modifying TUI header text, “Ready” status, or tip-line behavior based on provider availability.
- Adding support for new or additional AI providers or new key names.
- Loading arbitrary (non-provider) environment variables from `.ralph/.env.local`.
- Introducing `dotenv` or any third-party env loader dependency.

---

## Project Tech Stack

- **Framework:** React v^18.3.1 (Ink-based TUI)  
- **Unit Testing:** Vitest  
- **Package Manager:** npm  

---

## Reference Documents

### Inline context

The current implementation detects AI providers using `process.env` only and writes keys to an env file during `/init` and `/config`, but there is no mechanism to reload keys from `.ralph/.env.local` on subsequent startup. This feature introduces a focused loader in the CLI startup path that parses `.ralph/.env.local`, injects only known AI provider keys into `process.env` (with file precedence over shell), and does so without adding external dependencies or changing user-facing behavior when the file is absent.