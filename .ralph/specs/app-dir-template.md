# app-dir-template Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-04

## Purpose

Fix the `appDir` template variable so it defaults to the project root (`.`) instead of `src`, and only uses `src` or `app` when those directories are clearly valid entry points. This ensures generated prompts work out-of-the-box for a wide variety of project structures.

## User Stories

- As a Ralph user, I want generated prompts to run correctly from my project root without manual edits so that I can copy-paste them into my terminal and get immediate value.
- As a developer whose app lives at the repository root (no `src` directory), I want Ralph to avoid adding `cd src &&` so that prompts don’t fail.
- As a developer using a conventional `src` entry point, I want Ralph to still recognize and use `src` automatically so my existing workflow is preserved.
- As a Next.js App Router user, I want Ralph to use the `app` directory when appropriate so the generated prompts target my actual app structure.
- As a Ralph maintainer, I want `appDir` resolution to be simple, deterministic, and easy to reason about so future template changes remain robust.

## Requirements

### Functional Requirements

1. **Default behavior for `appDir`**
   - [x] In `src/generator/templates.ts` within `extractVariables()`, set the default `appDir` to the project root:
     - `let appDir = '.';`
   - [x] Ensure this default is used when no specific framework or entry directory can be inferred.

2. **Next.js App Router handling**
   - [x] If `frameworkVariant === 'app-router'`, then `appDir` must be set to `'app'`.

3. **Conventional `src` entry detection**
   - [x] If `frameworkVariant` is not `'app-router'`, and **any** of the following files exist under `projectRoot`:
     - `src/index.ts`
     - `src/index.tsx`
     - `src/main.ts`
     then `appDir` must be set to `'src'`.
   - [x] File existence checks must be implemented using synchronous checks (e.g., `fs.existsSync`) with `path.join(projectRoot, ...)`.

4. **Template integration**
   - [x] All template rendering that uses `appDir` (e.g., for building `cd` commands in generated prompts/scripts) must pick up the updated value from `extractVariables()`.
   - [x] No existing templates should need manual path hard-coding to keep working; they should rely on the `appDir` variable.

5. **CLI and TUI behavior**
   - [x] The updated `appDir` logic must be applied consistently regardless of entry flow:
     - Ralph CLI (non-TUI)
     - Ink-based TUI flows
   - [x] No additional configuration is required from the user (no new flags or config fields).

### Non-Functional Requirements

- [x] **Performance:** `appDir` resolution must use a minimal number of file system checks (exactly the three `src` entry candidates) and avoid any heavy scanning; the impact on generation time should be negligible.
- [x] **Determinism:** Use `path.join(projectRoot, ...)` for cross-platform correctness (Windows/macOS/Linux); the same project tree must always resolve to the same `appDir`.
- [x] **Backward compatibility:**
  - Projects that already rely on `src` as their app directory and contain one of the specified entry files must keep working without changes.
  - Projects with no `src` entry must improve (no more failing `cd src &&`).
- [x] **Simplicity:** Do not introduce additional heuristics (e.g., monorepo scanning or `.ralph`-based overrides) in this change; keep logic minimal and predictable.

## Technical Notes

### Implementation Approach

1. **Locate and modify `extractVariables()`**
   - File: `src/generator/templates.ts`
   - Function: `extractVariables(...)` (currently computes `appDir` with default `'src'`).

2. **Change `appDir` logic**

   Replace the existing initialization and related logic with something functionally equivalent to:

   ```ts
   import { existsSync } from 'fs';
   import { join } from 'path';

   // ... inside extractVariables(...)
   let appDir = '.'; // Default to project root

   if (frameworkVariant === 'app-router') {
     appDir = 'app';
   } else if (
     existsSync(join(projectRoot, 'src', 'index.ts')) ||
     existsSync(join(projectRoot, 'src', 'index.tsx')) ||
     existsSync(join(projectRoot, 'src', 'main.ts'))
   ) {
     appDir = 'src'; // Only use src if it actually contains an entry point
   }

   // Ensure appDir is included in the variables returned by extractVariables()
   ```

   - Keep import style consistent with the rest of `templates.ts` (e.g., if `existsSync` and `join` are already imported, reuse them).
   - Ensure `projectRoot` and `frameworkVariant` variables used here match the existing function scope and are properly typed.

3. **Check for later overrides**
   - Inspect `extractVariables()` for any subsequent reassignments of `appDir`. If any exist:
     - [x] Confirm they are still valid with the new defaulting logic.
     - [x] If they are redundant or conflict with the desired behavior, refactor them to respect the new rules.

4. **Template usage**
   - Search for usage of `appDir` in templates:
     - Directory: `src/templates/` (especially `src/templates/prompts` and `src/templates/specs` if they use `cd {{appDir}} &&`).
   - Confirm that:
     - [x] Templates interpolate `appDir` (e.g., `{{appDir}}`) rather than hard-coded `src`.
     - [x] Where commands are generated (e.g., `cd {{appDir}} && npm run dev`), the new `appDir` values will behave as expected.

5. **Tech Stack Alignment**
   - Language: TypeScript (`src/`).
   - Testing: Use Vitest for unit tests where appropriate; follow existing `*.test.ts` patterns.
   - Ensure TypeScript builds via `npm run build` and tests via `npm run test` succeed after the change.

### Suggested Tests

1. **Unit Tests (Vitest) for `extractVariables()`**
   - Create or extend tests in a file like `src/generator/templates.test.ts` (or equivalent existing test file).

   Scenarios to cover:

   1. **Root-based app (no `src` entry)**
      - Setup: Mock `projectRoot` with no `src/index.ts`, no `src/index.tsx`, no `src/main.ts`.
      - Expectation:
        - [x] `extractVariables(...).appDir === '.'`

   2. **`src` entry via `src/index.ts`**
      - Setup: Mock `projectRoot` with `src/index.ts` present.
      - Expectation:
        - [x] `extractVariables(...).appDir === 'src'`

   3. **`src` entry via `src/index.tsx`**
      - Setup: Mock `projectRoot` with `src/index.tsx` present.
      - Expectation:
        - [x] `extractVariables(...).appDir === 'src'`

   4. **`src` entry via `src/main.ts`**
      - Setup: Mock `projectRoot` with `src/main.ts` present.
      - Expectation:
        - [x] `extractVariables(...).appDir === 'src'`

   5. **Next.js App Router project**
      - Setup: `frameworkVariant === 'app-router'` regardless of `src` files.
      - Expectation:
        - [x] `extractVariables(...).appDir === 'app'`

   - Where direct filesystem access is inconvenient in tests:
     - Use mocking tools (e.g., mocking `fs.existsSync`) to simulate presence/absence of files.

2. **Integration / Smoke Tests (Manual or Scripted)**

   Prepare three minimal example projects (or fixtures):

   1. **Root app (like wiggum-cli itself)**
      - No `src/index.ts`, `src/index.tsx`, or `src/main.ts`.
      - Run Ralph (e.g., `ralph run` or equivalent flow that generates prompts).
      - [x] Verify generated prompts:
        - Do not contain `cd src &&`.
        - Use `.` for `appDir` where applicable.

   2. **Standard `src` app**
      - Includes `src/index.ts` (or `index.tsx` / `main.ts`).
      - Run the same Ralph command.
      - [x] Verify generated prompts:
        - Contain `cd src &&` (or equivalent usage of `appDir`).
        - Commands execute successfully when run from project root.

   3. **Next.js App Router app**
      - Marked as `frameworkVariant === 'app-router'` by relevant detection logic.
      - Run Ralph.
      - [x] Verify:
        - `appDir` resolves to `app`.
        - Prompts use `cd app &&` or equivalent.
        - Commands work from the project root.

## Acceptance Criteria

- [x] `extractVariables()` in `src/generator/templates.ts` initializes `appDir` to `'.'` and only overwrites it to `'app'` or `'src'` based on the documented rules.
- [x] For a project without `src/index.ts`, `src/index.tsx`, or `src/main.ts`, `appDir` resolves to `'.'` and generated prompts do not include `cd src &&`.
- [x] For a project with `src/index.ts` present, `appDir` resolves to `'src'` and generated prompts use `cd src &&` (or equivalent path usage), and executing those prompts from the project root succeeds.
- [x] For a project with `src/main.ts` (and no conflicting conditions), `appDir` resolves to `'src'` with the same correct behavior.
- [x] For a Next.js App Router project (`frameworkVariant === 'app-router'`), `appDir` resolves to `'app'` and prompts use that directory; executing them from the project root succeeds.
- [x] All existing tests pass, and new unit tests asserting the `appDir` behavior are in place and passing.
- [x] No regressions are observed in existing template flows that previously worked for `src`-based projects.

## Out of Scope

- Automatic detection of more complex layouts (e.g., monorepos with `packages/*`, custom `app/` under nested folders, etc.).
- Adding user-configurable overrides for `appDir` in a Ralph config file.
- Changes to the structure or semantics of the `.ralph` directory or other generator variables.

## Project Tech Stack

- **Framework:** React v^18.3.1 (Ink-based TUI for CLI UX)
- **Unit Testing:** Vitest
- **Language:** TypeScript
- **Runtime:** Node.js (CLI via `bin/ralph.js` → `dist/index.js` → `src/index.ts`)
- **Package Manager:** npm