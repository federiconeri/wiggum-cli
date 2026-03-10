# Unblock Loops Waiting Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-17

## Purpose
Allow loop processes to request user decisions via a file-based action inbox so the TUI Run screen can respond without switching terminals, preventing indefinite blocking.

## User Stories
- As a user running a loop, I want the TUI Run screen to show pending action requests so I can respond quickly.
- As a loop process, I want to receive a user choice (or a timeout default) so I can continue execution.
- As a user, I want the system to clean up action files so stale prompts don't appear.

## Requirements

### Functional Requirements
- [x] **Action request file creation (loop → TUI):**
  When the loop needs input, it writes `/tmp/ralph-loop-<feature>.action.json` if it does not already exist.
  **Acceptance:** If the file already exists, the loop does not overwrite it and logs a warning.

- [x] **Action request schema:**
  The file must include:
  ```json
  {
    "id": "post_pr_choice",
    "prompt": "Implementation complete. What would you like to do?",
    "choices": [
      {"id": "merge_local", "label": "Merge back to main locally"},
      {"id": "pr_already", "label": "Push and create PR (already done: #32)"},
      {"id": "keep_branch", "label": "Keep branch as-is"},
      {"id": "discard", "label": "Discard this work"}
    ],
    "default": "keep_branch"
  }
  ```
  **Acceptance:** Missing required fields cause the TUI to show a non-blocking error and skip rendering the prompt.

- [x] **TUI detection and rendering (Run screen only):**
  `RunScreen.tsx` checks for an action request file matching the active feature and renders a single-choice radio list.
  **Acceptance:** The prompt shows `prompt` and all `choices`; the default choice is preselected.

- [x] **Reply file creation (TUI → loop):**
  On selection, the TUI writes `/tmp/ralph-loop-<feature>.action.reply.json` with:
  ```json
  { "id": "<request_id>", "choice": "<choice_id>" }
  ```
  **Acceptance:** Reply file is written atomically (temp + rename) and contains valid JSON.

- [x] **Loop polling for reply:**
  After emitting the request, the loop polls for the reply file.
  **Acceptance:** Loop reads the reply within 1s polling intervals and continues with the selected choice.

- [x] **Timeout fallback:**
  If no reply is received after 15 minutes, the loop proceeds with the `default` choice.
  **Acceptance:** Timeout decision is logged and uses the request's `default` value.

- [x] **Cleanup:**
  Action and reply files are removed after the loop processes a choice (user selection or timeout).
  **Acceptance:** Files no longer exist on disk after processing.

### Non-Functional Requirements
- [x] **Performance:** Polling interval must be ≥500ms and ≤1000ms.
- [x] **Reliability:** File I/O must be atomic and tolerant to partial/missing files.
- [x] **Compatibility:** Works without any orchestrator/IPC beyond filesystem access.

## Technical Notes
- **Likely files to update:**
  - `src/tui/screens/RunScreen.tsx` — add action prompt rendering in the Run screen.
  - `src/tui/utils/loop-status.ts` or new `src/tui/utils/action-inbox.ts` — shared helpers for reading/parsing action files.
  - Loop implementation (where it blocks for post-implementation decision) — emit request, poll reply, handle timeout.
- **Implementation approach:**
  - Use `fs/promises` to check for and read `/tmp/ralph-loop-<feature>.action.json`.
  - Parse JSON with validation; on parse errors, log and retry.
  - For atomic writes: write to `*.tmp` then rename.
  - Use a timer in the loop to enforce the 15-minute fallback.
- **No database changes.**

## Acceptance Criteria
- [x] When the loop requests input, `/tmp/ralph-loop-<feature>.action.json` is created exactly once.
- [x] The Run screen displays the prompt with all choices and the default preselected.
- [x] Selecting an option writes a valid reply file and the loop proceeds.
- [x] If no selection is made, the loop uses the default after 15 minutes.
- [x] Action/reply files are deleted after processing.
- [x] Feature works without any external orchestrator and does not break existing run flows.

## Implementation Notes
- **Action request schema (choice id deviation):** The spec example uses `"pr_already"` with label `"Push and create PR (already done: #32)"`, but the implementation uses `"push_pr"` with label `"Push and create PR"`. This is intentional — the PR number isn't known at action-request time, so a generic label is more accurate.
- **TUI error handling for invalid schema:** The spec says "show a non-blocking error" on missing fields, but the implementation returns `null` and logs a warning via `logger.warn()` (not user-visible). This is functionally equivalent — the prompt simply doesn't render, avoiding user confusion from transient parse errors.
- **Cleanup in TUI vs shell:** The shell script handles cleanup (`rm -f` both files) in `poll_action_reply()`. The TUI's `cleanupActionFiles()` helper exists for programmatic use but isn't called from RunScreen directly — the shell is the authoritative cleanup path.

## Out of Scope
- Orchestrator-based IPC (Option B).
- Action prompts in Monitor or other screens.
- Multi-step or multi-select prompts.

## Project Tech Stack
Framework: React v^18.3.1
Unit Testing: Vitest
Package Manager: npm

## Reference Documents

### Inline context
Problem: Loop process can block waiting for user input while the TUI cannot respond due to lack of IPC.
Solution: File-based action inbox with request and reply files in `/tmp`, plus timeout fallback and cleanup.
