# alig-api-loader Feature Specification

**Status:** Planned  
**Version:** 1.0  
**Last Updated:** 2026-02-04  

---

## Purpose

Align all configuration write paths with the existing API key loader so that `/init` and `/config set` write to `.ralph/.env.local` (the loader’s canonical location), ensuring the header and other UI elements correctly reflect configured providers/models without manual file manipulation.

---

## User Stories

- As a new user initializing Ralph in a project, I want `/init` to save my API keys where Ralph reads them from so that everything works automatically on the next run.
- As an existing user managing configuration via `/config set`, I want my API keys written to `.ralph/.env.local` so they are picked up correctly by the loader without needing to move files.
- As a user with an existing root `.env.local`, I want Ralph to prefer `.ralph/.env.local` without altering or deleting my root `.env.local`, so my environment is not unexpectedly changed.
- As a user running `/config set` in an uninitialized project, I want a clear error that tells me to run `/init` first, so I understand why the command fails and how to fix it.

---

## Requirements

### Functional Requirements

#### FR1: `/init` writes API keys to `.ralph/.env.local`

- `/init` (via the TUI `InitScreen` flow) MUST:
  - Write API keys to `.ralph/.env.local` relative to the project root.
  - Create the `.ralph` directory if it does not exist.
  - Create `.ralph/.env.local` if it does not exist.
  - Not rely on or update a project-root `.env.local` for API key storage.

**Acceptance Criteria:**

- [ ] In a new project directory (no `.ralph` and no `.env.local`):
  - Run `ralph init` and complete the TUI with valid API keys.
  - After completion:
    - `.ralph/` directory exists at the project root.
    - `.ralph/.env.local` exists and contains the provided keys.
    - No new root `.env.local` is created for these keys.
- [ ] On the next `ralph` startup in that directory:
  - The header or configuration status reads from `.ralph/.env.local` and displays the configured provider/model as entered during init.

---

#### FR2: `/config set` writes to `.ralph/.env.local` in initialized projects

- The `ralph config set` command MUST:
  - Target `.ralph/.env.local` for writing config keys.
  - Assume the project has already been initialized.
  - Refuse to run (with a clear error) if the project is not initialized (e.g., `.ralph/` is missing).
  - Preserve any existing content in `.ralph/.env.local` while updating or adding keys (same behavior as currently used for root `.env.local`).

**Acceptance Criteria:**

- [ ] In a project that has been initialized via `ralph init` and already has `.ralph/`:
  - Run `ralph config set OPENAI_API_KEY new-key`.
  - `.ralph/.env.local` is created if missing, or updated if present.
  - The `OPENAI_API_KEY` entry in `.ralph/.env.local` matches `new-key`, and other entries (if any) are preserved.
  - On next `ralph` startup, the loader reflects the updated key (e.g., successfully uses it for API calls / header shows the correct provider).
- [ ] In a project that does not have `.ralph/` (not initialized):
  - Run `ralph config set OPENAI_API_KEY some-key`.
  - Command exits with a non-success status.
  - A clear error message is printed, e.g.:  
    `"This project is not initialized. Run 'ralph init' to set up .ralph/ before using 'ralph config set'."`
  - No `.ralph/` directory or `.ralph/.env.local` file is created as a side effect.

---

#### FR3: Prefer `.ralph/.env.local` over root `.env.local`, without migration

- The existing loader behavior MUST:
  - Prefer `.ralph/.env.local` as the canonical source for API keys.
  - Only fall back to root `.env.local` if `.ralph/.env.local` is missing.
  - Not automatically move, merge, or delete the root `.env.local`.

**Acceptance Criteria:**

- [ ] If only `.ralph/.env.local` exists and contains valid API keys:
  - Ralph loads keys from `.ralph/.env.local`.
  - Root `.env.local` (if absent) is not created.
- [ ] If both `.ralph/.env.local` and `.env.local` exist:
  - Ralph uses values from `.ralph/.env.local` (e.g., API calls work using keys defined in `.ralph/.env.local` even if different values exist in root `.env.local`).
  - Root `.env.local` content remains unchanged on disk after all operations.
- [ ] If only root `.env.local` exists (legacy scenario):
  - Behavior matches current pre-feature behavior (no regression).
  - Ralph successfully loads keys from root `.env.local` and continues to function.

---

#### FR4: Ensure `.ralph/.env.local` is ignored by version control

- The project MUST:
  - Ignore `.ralph/.env.local` in Git (directly or via ignoring the entire `.ralph` directory), consistent with how other sensitive env files are ignored.

**Acceptance Criteria:**

- [ ] In the project root `.gitignore`:
  - Either `.ralph/` or `.ralph/.env.local` is listed.
- [ ] After creating `.ralph/.env.local` via `ralph init`:
  - Running `git status` shows `.ralph/.env.local` as untracked only if `.gitignore` is misconfigured; under proper configuration it should not appear as a tracked/changed file.

---

### Non-Functional Requirements

#### NFR1: Backward Compatibility

- Existing projects that rely only on root `.env.local` MUST continue to function exactly as before.
- Introducing `.ralph/.env.local` MUST not break any existing startup or config flows.

**Acceptance Criteria:**

- [ ] A project created before this feature (only root `.env.local` present, no `.ralph`):
  - Continues to load and use API keys from root `.env.local` after updating Ralph.
  - All existing commands behave as before.

---

#### NFR2: Developer Consistency

- Implementations MUST:
  - Use existing path resolution and fs utilities used elsewhere in the project when possible.
  - Follow existing patterns for env file read/write (formatting, merging behavior).

**Acceptance Criteria:**

- [ ] Code changes use the same or compatible helpers/utilities for reading/writing env files as other parts of the project.
- [ ] Path handling consistently uses Node APIs (e.g., `path.join`, `fs`/`fs.promises`) in line with the rest of the codebase.

---

#### NFR3: Error Handling and UX

- Errors MUST be explicit and actionable, particularly when `/config set` is used in a non-initialized project.
- No silent failures when writing `.ralph/.env.local`.

**Acceptance Criteria:**

- [ ] Running `ralph config set` in an uninitialized project yields a clear error referencing initialization and how to proceed.
- [ ] Any write failures to `.ralph/.env.local` (e.g., permission issues) are surfaced with messages that include the path and nature of the failure.

---

#### NFR4: Security

- Sensitive keys MUST remain in local, ignored files and not be accidentally committed or logged.

**Acceptance Criteria:**

- [ ] `.ralph/.env.local` is never printed in full to logs or console in standard flows.
- [ ] Git configuration prevents `.ralph/.env.local` from being accidentally committed.

---

## Technical Notes

### Relevant Files and Responsibilities

- **`src/tui/screens/InitScreen.tsx`**
  - Contains `saveKeysToEnvLocal` or equivalent logic that currently writes to root `.env.local`.
  - **Changes:**
    - Update the target path from `{projectRoot}/.env.local` to `{projectRoot}/.ralph/.env.local`.
    - Before writing:
      - Compute `const ralphDir = path.join(projectRoot, '.ralph');`
      - Ensure directory exists: `fs.mkdirSync(ralphDir, { recursive: true });`
      - Compute env file path: `const envLocalPath = path.join(ralphDir, '.env.local');`
    - Use existing env writing logic to:
      - Retain any existing entries in `.ralph/.env.local` (if file exists).
      - Overwrite or insert only the keys being set by `/init`.

- **`src/commands/config.ts`**
  - Implements `ralph config set` and currently uses root `.env.local`.
  - **Changes:**
    - Resolve the project root (existing mechanism).
    - Determine `.ralph` path: `const ralphDir = path.join(projectRoot, '.ralph');`
    - Before writing:
      - Check that `ralphDir` exists and is a directory.
      - If not, throw/return a user-facing error: project not initialized; instruct to run `ralph init`.
    - Target env file: `const envLocalPath = path.join(ralphDir, '.env.local');`
    - Read current env file contents (if any) and merge:
      - Update or add the specified key(s) while preserving other entries.
    - Write back to `.ralph/.env.local` in the standard `.env` format.

- **Loader (e.g., `loadApiKeysFromEnvLocal`)**
  - Already reading from `.ralph/.env.local` based on earlier work.
  - **Check/Confirm:**
    - Loader’s precedence should be:
      1. `.ralph/.env.local`
      2. Fallback: root `.env.local` (for backward compatibility)
    - No changes required if this order already exists; if not, adjust to this order.

- **`.gitignore`**
  - Ensure it includes either:
    - `.ralph/`  
      or
    - `.ralph/.env.local`
  - Prefer matching existing conventions (e.g., if `.env.local` is already ignored, adding `.ralph/` is acceptable and simpler).

### Implementation Considerations

- **Env File Merge Behavior:**
  - Preserve the current behavior of env file merging:
    - If an env-writing utility already merges key/value pairs (rather than overwriting the whole file), reuse it.
    - If not, implement minimal merge logic:
      - Parse existing `.ralph/.env.local` lines.
      - Update or append the specified key.
      - Preserve comments and unrelated keys where feasible.

- **Detection of “Initialized” Project for `/config set`:**
  - Simple heuristic: presence of `.ralph/` directory at project root.
  - Optionally, also check for a known file inside `.ralph` (e.g., a config file) if that better signals initialization; follow existing conventions in the codebase.
  - Do **not** auto-create `.ralph/` from `/config set`.

- **Path Resolution:**
  - Use consistent project root detection (whatever the repo currently uses for commands).
  - Never hard-code absolute paths; always derive from the detected project root.

---

## Acceptance Criteria (Consolidated, Testable)

- [ ] **Init Flow**
  - In a fresh directory:
    - Run `ralph init` with valid API keys.
    - `.ralph/.env.local` is created with those keys.
    - No root `.env.local` is created for these keys.
    - Next run shows the provider/model from `.ralph/.env.local`.

- [ ] **Config Set in Initialized Project**
  - After `ralph init` (with `.ralph/` present):
    - Run `ralph config set OPENAI_API_KEY override-key`.
    - `.ralph/.env.local` contains `OPENAI_API_KEY=override-key`.
    - Other keys remain unchanged.
    - Next run uses `override-key` (observable via correct API behavior or logs).

- [ ] **Config Set in Uninitialized Project**
  - In a directory with no `.ralph/`:
    - Run `ralph config set OPENAI_API_KEY some-key`.
    - Command exits non-zero and prints a clear “project not initialized; run 'ralph init'” style message.
    - `.ralph/` is not created.

- [ ] **Precedence and Backward Compatibility**
  - Project with only root `.env.local`:
    - Ralph continues to function as before, loading keys from root `.env.local`.
  - Project with both `.ralph/.env.local` and root `.env.local`:
    - Ralph uses `.ralph/.env.local` values.
    - Root `.env.local` file is not modified or deleted.

- [ ] **Version Control**
  - `.ralph/.env.local` is not added to Git by default when created via `ralph init` or `ralph config set`, assuming `.gitignore` has been updated accordingly.

---

## Out of Scope

- Automatic migration, merging, or deletion of root `.env.local` into/from `.ralph/.env.local`.
- Introducing new configuration fields or providers beyond what is already supported.
- Redesigning the `/init` or `/config` UX beyond necessary path and error message updates.
- Any changes to runtime environment variable handling outside the `.ralph/.env.local` vs root `.env.local` decisions.

---

## Reference Documents

### Inline Context Summary

- Previous PR (#36) added `loadApiKeysFromEnvLocal` to read from `.ralph/.env.local`.
- Current gap: `/init` and `/config set` still write to root `.env.local`, causing the header to show “not configured” unless the user manually moves the file.
- This spec completes the integration by ensuring write paths align with the loader and by enforcing sensible behavior for initialized vs non-initialized projects.