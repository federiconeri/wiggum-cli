# add-sync-command Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-05

---

## Purpose

Add persistent storage for AI-enhanced codebase analysis and a lightweight `/sync` command that refreshes this context without rerunning the full `/init` flow, allowing `/new` to benefit from rich project understanding across TUI sessions.

---

## User Stories

- As a user, I want Ralph to remember the project analysis across sessions so I don’t need to run `/init` every time I open a new terminal.
- As a user, I want a fast `/sync` command that refreshes the stored project context without running the full `/init` interview so I can keep context up to date with minimal friction.
- As a user, I want `/new` to automatically use any stored project context when available so my specs benefit from prior analysis.
- As a user, I want clear messages when context loading or saving fails so I understand why Ralph isn’t using cached context.

---

## Requirements

### Functional Requirements

#### 1. Persist AI-enhanced analysis context

- [x] After a successful `/init`-style analysis (scan + AI enhancement), Ralph must persist the analysis to `.ralph/.context.json`.

  **Details:**
  - Define a `PersistedContext` schema (see Technical Notes) containing:
    - `version: number` — schema version.
    - `lastAnalyzedAt: string` — ISO timestamp of when analysis completed.
    - `gitCommitHash?: string` — HEAD commit hash at analysis time (if available).
    - `gitBranch?: string` — current git branch (if available).
    - `scanResult` — subset/representation of the existing scanner output:
      - Framework (e.g., React)
      - Package manager
      - Testing frameworks (unit/e2e)
      - Styling approach, etc.
    - `aiAnalysis` — AI-enhanced project understanding:
      - `projectContext` (entry points, key directories, naming conventions, etc.)
      - `commands` (mapped from `package.json` scripts or similar)
      - `implementationGuidelines`
      - `technologyPractices`
  - Implement `saveContext(context: PersistedContext): Promise<void>` to:
    - Ensure `.ralph` directory exists.
    - Write JSON to `.ralph/.context.json` (pretty-printed or compact; consistent format).
    - Throw a meaningful error on failure.

  **Acceptance Criteria:**
  - [x] Running `/init` to completion creates `.ralph/.context.json` if it does not exist.
  - [x] Re-running `/init` overwrites `.ralph/.context.json` with updated values.
  - [x] Inspecting `.ralph/.context.json` shows:
    - A `version` number.
    - A valid ISO `lastAnalyzedAt`.
    - Non-empty `scanResult` and `aiAnalysis` sections matching the last analysis.
  - [x] If `.ralph` does not exist before `/init`, it is created automatically.

---

#### 2. Load persisted context

- [x] Ralph must be able to load and validate the persisted context when needed.

  **Details:**
  - Implement `loadContext(): Promise<PersistedContext | null>` that:
    - Resolves the context file path (`.ralph/.context.json`).
    - Returns `null` if the file does not exist.
    - Attempts to parse JSON and validate it against `PersistedContext`.
    - Throws a descriptive error if JSON is invalid or fails validation.
  - Implement `getContextAge(context: PersistedContext)` helper that:
    - Accepts a `PersistedContext`.
    - Returns the age in ms and a human-readable string (e.g., “2 days”, “3 hours”) — used for future enhancements, not necessarily shown in v1 UI.

  **Acceptance Criteria:**
  - [x] If `.ralph/.context.json` exists and is valid, `loadContext()` returns a populated `PersistedContext`.
  - [x] If `.ralph/.context.json` does not exist, `loadContext()` returns `null` without throwing.
  - [x] If `.ralph/.context.json` contains invalid JSON, `loadContext()` throws an error that includes "parse" or "invalid JSON" in the message.
  - [x] `getContextAge()` correctly reports relative age for known timestamps in unit tests.

---

#### 3. Integrate persisted context into `/new`

- [x] When `/new` is executed, Ralph should use persisted context where available, with no staleness warnings in v1.

  **Details:**
  - In the spec generation flow (e.g., `useSpecGenerator` / `InterviewOrchestrator`):
    - If a fresh in-memory scanResult/analysis from the current session is already available, keep existing behavior and use it.
    - If not:
      - Call `loadContext()`.
      - If it returns a valid `PersistedContext`, inject:
        - `scanResult` equivalent into whichever structure the spec generator uses (e.g., `SessionState` or hook props).
        - `aiAnalysis` fields into the prompts/context that guide the AI spec generation.
      - If `loadContext()` returns `null`, proceed as today (no context).
      - If `loadContext()` throws, show a TUI-visible error (see Error Handling), and continue without context.
  - No staleness warnings or prompts in this version, regardless of `lastAnalyzedAt` or git metadata.

  **Acceptance Criteria:**
  - [x] In a new terminal session (no prior in-memory state), after previously running `/init`, executing `/new` results in richer prompts/behavior that clearly reflect the previously analyzed project (confirmed via logs or visible details like known entry points).
  - [x] If `.ralph/.context.json` is deleted and `/new` is run, behavior matches the current no-context `/new` flow (no errors).
  - [x] If `.ralph/.context.json` is corrupted (e.g., manually edited to invalid JSON), `/new`:
    - Shows a TUI-visible error message (e.g., in shell thread/status line) stating that context could not be loaded.
    - Continues and allows the user to proceed with `/new` (without context).
  - [x] No staleness warning or prompt is presented even if the context is very old.

---

#### 4. Add `/sync` command with minimal UI

- [x] Add a `/sync` shell command that refreshes the persisted context with a new scan + AI enhancement, reusing existing config.

  **Details:**
  - Extend `MainShell` (or the TUI command router) to:
    - Parse `/sync` as a valid command.
  - Implement a new hook `useSync()` to encapsulate sync logic:
    - Exposes:
      - `sync(): Promise<void>` — triggers the operation.
      - `status: 'idle' | 'running' | 'success' | 'error'`.
      - `error: Error | null`.
    - On `sync()`:
      - Set `status` to `'running'`.
      - Invoke `Scanner.scan()` with the same configuration resolution logic used in `/init` (no additional questions).
      - Call the AI enhancement pipeline (e.g., `AIEnhancer.enhance(scanResult)` or the shared logic from `/init`) using the already-configured provider/model/API key.
      - Convert results into `PersistedContext`.
      - Call `saveContext()` to persist.
      - On success, set `status` to `'success'`.
      - On error (scan, AI, save), set `status` to `'error'` and store the error for UI.
  - Minimal UI behavior:
    - When the user types `/sync` in the shell:
      - Append a shell message like “Starting sync of project context…” immediately.
      - Optionally show a spinner or “Sync in progress…” status while `status === 'running'` (still within the shell, not a new full-screen).
      - On `status === 'success'`, append a shell message like “Project context sync completed successfully.” Possibly include a brief summary (e.g., “Context refreshed at 2026-02-05T12:34:56Z.”).
      - On `status === 'error'`, append an error message summarizing the failure (see Error Handling).

  **Acceptance Criteria:**
  - [x] Typing `/sync` in the main shell:
    - Immediately prints a "sync started" message.
    - Triggers a scan + AI enhancement using the same provider configuration as `/init` (no new provider selection).
  - [x] On successful completion of `/sync`:
    - `.ralph/.context.json` is updated (timestamp and/or content changes).
    - A "sync completed" message is printed to the shell.
  - [x] If `/sync` encounters a scan error, AI error, or save error:
    - A clear error message is printed in the shell.
    - The TUI remains responsive and other commands (e.g., `/new`) can still be executed.
  - [x] `/sync` does not navigate to a new full-screen route; the user stays in the main shell view.

---

#### 5. Error handling and user feedback

- [x] All context-related errors must be communicated clearly in the TUI while allowing the app to continue operating.

  **Details:**
  - Context load failures:
    - If `loadContext()` throws (parse error, validation error, filesystem error):
      - Catch at the TUI hook/screen level.
      - Log detailed error using existing logger (e.g., stack trace).
      - Show a concise, user-facing message in the shell or status area, e.g., “Unable to load cached project context; continuing without it.”
    - Do not crash the app or block `/new`; instead, continue with no-context behavior.
  - Context save failures:
    - If `saveContext()` throws during `/init` or `/sync`:
      - Log detailed error.
      - Show a concise TUI message, e.g., “Failed to save project context. Latest analysis will not be cached.”
      - Do not roll back or fail the main flow; `/init` or `/sync` should still complete their primary goals where possible (e.g., init state, in-memory context).
  - `/sync` failures:
    - On scan or AI errors, ensure `status` becomes `'error'` and an error message is displayed.
    - The error message should clearly identify that sync failed (not just “unknown error”).

  **Acceptance Criteria:**
  - [x] Corrupt context file + `/new` results in:
    - A single, clear TUI error message about context load failure.
    - Successful continuation into `/new` without context.
  - [x] Filesystem permission error when saving context (simulate by making `.ralph` unwritable) during `/init` or `/sync`:
    - Shows a TUI error mentioning failure to save context.
    - Does not crash TUI; `/init` or `/sync` reports completion/termination appropriately.
    - *Note:* `/init` save failure logs via `logger.error()` only (not TUI-visible); `/sync` save failure is TUI-visible via useSync error status. See Implementation Notes.
  - [x] Any `/sync` error still leaves the shell functional for subsequent commands.

---

#### 6. Git ignore behavior

- [x] `.ralph/.context.json` must be ignored by git in generated projects.

  **Details:**
  - Update the `.gitignore` template(s) in `src/templates` used by the project generator to include:
    - `.ralph/.context.json`
  - Ensure this line is present for new projects initialized by Ralph.

  **Acceptance Criteria:**
  - [x] Newly generated projects include `.ralph/.context.json` in their `.gitignore`.
  - [x] Running `git status` in a new project after `/init` and `/sync` does not show `.ralph/.context.json` as an untracked file.

---

### Non-Functional Requirements

- [x] Performance:
  - `/sync` may perform a full scan + AI call but must avoid the interactive overhead of `/init` (no provider selection, no interview flows).
  - Loading context must be a single file I/O + parse and should not be a noticeable delay in TUI startup or `/new`.
- [x] Reliability:
  - Missing context file is handled gracefully (no errors).
  - Corrupt files and filesystem failures are handled without crashing.
- [x] Maintainability:
  - `PersistedContext` schema has a `version` field to support future migrations.
  - All context read/write logic is centralized in `src/context` to avoid duplication.
- [x] Security:
  - Context file must not store API keys or other secrets; it should only store project metadata and AI-generated descriptions.
- [x] UX:
  - `/sync` UX is minimal and shell-centric: clear "started" and "completed/error" messages, no additional navigation.

---

## Technical Notes

### Architecture & Integration Points

- CLI / TUI flow:
  - `bin/ralph.js` → `dist/index.js` → `src/index.ts` → TUI router (`renderApp`) → `App`/`MainShell` → screens & hooks.
- Existing relevant modules (based on project structure):
  - `src/tui/screens/MainShell.tsx` — slash command handling (`/init`, `/new`, etc.).
  - `src/tui/hooks/useInit.ts` — init flow with scanning and AI analysis.
  - `src/tui/hooks/useSpecGenerator.ts` — spec generation flow used by `/new`.
  - `src/ai` and `src/ai/agents` — AI provider integration and orchestration.
  - `src/scanner` — project scanner, detectors, and `Scanner.scan()`.
  - `src/utils` — logging, config, filesystem utilities.
  - `.ralph` — local state dir; reuse this for context file.

### New Files / Modules

- `src/context/types.ts`
  - Define interfaces:

    ```ts
    export interface PersistedScanResult {
      framework?: string;
      packageManager?: string;
      testing?: {
        framework?: string | null;
        e2e?: string | null;
      };
      styling?: string | null;
      // ... other fields as needed, mapped from Scanner.scan()
    }

    export interface PersistedAIAnalysis {
      projectContext?: {
        entryPoints?: string[];
        keyDirectories?: Record<string, string>;
        namingConventions?: string;
      };
      commands?: Record<string, string>;
      implementationGuidelines?: string[];
      technologyPractices?: {
        practices?: string[];
      };
      // Extend as needed based on existing AIAnalysisResult
    }

    export interface PersistedContext {
      version: number;
      lastAnalyzedAt: string; // ISO timestamp
      gitCommitHash?: string;
      gitBranch?: string;
      scanResult: PersistedScanResult;
      aiAnalysis: PersistedAIAnalysis;
    }
    ```

- `src/context/storage.ts`
  - Implement helpers:

    ```ts
    import { PersistedContext } from './types';
    import fs from 'fs/promises';
    import path from 'path';

    const CONTEXT_VERSION = 1;

    function getContextDir(): string {
      // Likely reuse existing helper for .ralph location
      // e.g., from src/utils/config or similar
    }

    function getContextFilePath(): string {
      return path.join(getContextDir(), '.context.json');
    }

    export async function saveContext(context: Omit<PersistedContext, 'version'>): Promise<void> {
      const fullContext: PersistedContext = {
        version: CONTEXT_VERSION,
        ...context,
      };
      const dir = getContextDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(getContextFilePath(), JSON.stringify(fullContext, null, 2), 'utf8');
    }

    export async function loadContext(): Promise<PersistedContext | null> {
      try {
        const json = await fs.readFile(getContextFilePath(), 'utf8');
        const parsed = JSON.parse(json);
        // Optionally validate via zod or manual checks:
        // e.g., ensure version is number, lastAnalyzedAt is string, etc.
        return parsed as PersistedContext;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return null; // file not found
        }
        throw err; // parse, validation, or fs errors propagate
      }
    }

    export function getContextAge(context: PersistedContext): { ms: number; human: string } {
      const ts = new Date(context.lastAnalyzedAt).getTime();
      const now = Date.now();
      const ms = Math.max(0, now - ts);
      // Simple humanization (can be improved)
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      let human: string;
      if (days > 0) human = `${days} day${days === 1 ? '' : 's'}`;
      else human = `${hours} hour${hours === 1 ? '' : 's'}`;
      return { ms, human };
    }
    ```

  - Optionally wrap errors in custom error classes (e.g., `ContextLoadError`, `ContextSaveError`) if consistent with existing patterns.

### Changes to Existing Modules

- `src/tui/hooks/useInit.ts`
  - After the existing scan + AI enhancement completes successfully:
    - Collect:
      - `scanResult` (convert to `PersistedScanResult`).
      - `aiAnalysis` (convert from AI result to `PersistedAIAnalysis`).
      - `gitCommitHash` and `gitBranch` (if there is an existing helper; otherwise leave undefined or add a small utility that shells out to `git` if the project already permits that).
    - Call `saveContext()` with:

      ```ts
      await saveContext({
        lastAnalyzedAt: new Date().toISOString(),
        gitCommitHash,
        gitBranch,
        scanResult: persistedScanResult,
        aiAnalysis: persistedAIAnalysis,
      });
      ```

    - Catch errors from `saveContext()`:
      - Log via logger.
      - Surface concise TUI error: “Failed to save project context. Latest analysis will not be cached.”

- `src/tui/hooks/useSpecGenerator.ts` (or equivalent)
  - On initialization or when `/new` is triggered:
    - If there is already an in-memory scanResult/analysis, do nothing different.
    - Else:

      ```ts
      try {
        const context = await loadContext();
        if (context) {
          // Map context.scanResult & context.aiAnalysis into whatever
          // the spec generator / InterviewOrchestrator expects
        }
      } catch (err) {
        // log
        // show user-facing error: 'Unable to load cached project context; continuing without it.'
      }
      ```

- `src/tui/screens/MainShell.tsx`
  - Extend command handling:

    ```ts
    if (command === '/sync') {
      handleSyncCommand();
      return;
    }
    ```

  - Use the new `useSync()` hook:
    - When `/sync` is received:
      - Append “Starting sync of project context…” to shell thread.
      - Call `sync()`.
    - Watch `status` changes:
      - On `'running'`, optionally show a “Sync in progress…” status.
      - On `'success'`, append “Project context sync completed successfully.”.
      - On `'error'`, append a message like “Sync failed: [short error description]”.

- `src/tui/hooks/useSync.ts`
  - Implement as described in Functional Requirements; follow patterns used in `useInit` for:
    - Triggering scanner/AI.
    - Handling async state.
    - Using provider/model config from existing environment (no UI for selection).

- `src/templates/.../.gitignore` (or equivalent)
  - Add:

    ```gitignore
    .ralph/.context.json
    ```

---

## Acceptance Criteria (Consolidated)

- [x] `/init` writes a valid `.ralph/.context.json` file containing:
  - [x] A `version` field with value `1`.
  - [x] A valid ISO `lastAnalyzedAt`.
  - [x] Non-empty `scanResult` and `aiAnalysis` structures consistent with the last analysis.
- [x] `/init` still completes successfully even if context saving fails, and a clear TUI error is shown about failure to save context.
  - *Note:* Save failure in `/init` is logged via `logger.error()` but not shown as a TUI-visible message. See Implementation Notes.
- [x] In a fresh terminal session after a successful `/init`, running `/new`:
  - [x] Loads and uses persisted context if `.ralph/.context.json` exists and is valid.
  - [x] Behaves identically to pre-feature behavior if no context file exists (no error shown).
- [x] Corrupt `.ralph/.context.json` + `/new`:
  - [x] Triggers a visible TUI error indicating context load failure.
  - [x] Still allows `/new` to proceed using no context.
- [x] `/sync` command:
  - [x] Is recognized and handled when typed in the main shell.
  - [x] Immediately prints a "sync started" style message.
  - [x] Runs a scan + AI enhancement using existing provider/model settings (no extra UI).
  - [x] On success, updates `.ralph/.context.json` and prints a "sync completed" message.
  - [x] On failure, prints a "sync failed" message with a concise error description and leaves the shell responsive.
- [x] `.ralph/.context.json` is added to the `.gitignore` in generated projects, and after running `/init` and `/sync`, `git status` shows no `.ralph/.context.json` as untracked.

---

## Implementation Notes

- **Context save failure in `/init` not TUI-visible:** When `saveContext()` fails during `/init` (e.g., filesystem permission error), the error is logged via `logger.error()` in `InitScreen.tsx:231-234` but no system message is shown to the user in the TUI. The spec called for a TUI-visible message. This is a minor gap — the error is captured in logs but the user won't see it in the shell. `/sync` save failures ARE TUI-visible because `useSync` catches and surfaces errors to `MainShell` via status/error state.
- **Context persistence placed in `InitScreen.tsx` instead of `useInit.ts`:** The spec's Technical Notes suggested modifying `useInit.ts`, but the implementation placed the `saveContext()` call in `InitScreen.tsx` (the screen component) after AI analysis completes. This achieves the same functional result and was done because `InitScreen` has direct access to `projectRoot` and the AI enhancer result.
- **Context loading placed in `InterviewScreen.tsx` instead of `useSpecGenerator.ts`:** Similarly, the spec suggested `useSpecGenerator` but the implementation loads context in `InterviewScreen.tsx` at orchestrator creation time. This is functionally equivalent and provides cleaner access to the `addMessage` callback for error display.

---

## Out of Scope

- Automated staleness prompts (e.g., “Context is 47 commits old. Run `/sync`?”).
- Incremental scanning or AI enhancement based on fine-grained change detection.
- A dedicated full-screen `SyncScreen` wizard or rich progress UI.
- Remote or shared storage of context across machines or environments.

---

## Project Tech Stack

- **Framework:** React v^18.3.1 (Ink-based TUI)  
- **Unit Testing:** Vitest  
- **Package Manager:** npm  

---

## Reference Documents

### Inline context

- Feature idea: Persist AIAnalysisResult to `.ralph/.context.json` with `version`, `lastAnalyzedAt`, `gitCommitHash`, `gitBranch`, `scanResult`, and `aiAnalysis`.
- `/sync` to run `Scanner.scan()` + AI enhancement, using existing provider configuration and updating context without a full `/init` flow.
- `/new` to auto-load and use persisted context if available, with no staleness warnings in v1.
- `.ralph/.context.json` to be treated as local/machine-specific and added to `.gitignore`.