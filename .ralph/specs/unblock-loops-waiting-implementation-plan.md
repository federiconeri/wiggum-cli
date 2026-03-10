# unblock-loops-waiting Implementation Plan

**Spec:** .ralph/specs/unblock-loops-waiting.md
**Branch:** feat/unblock-loops-waiting
**Status:** Complete

## Tasks

### Phase 1: Core Library — Action Inbox Helpers

- [x] **Create `src/tui/utils/action-inbox.ts`** — [complexity: M] <!-- commit: b6ee61b -->
  New module with these exports:
  - `ActionRequest` interface: `{ id: string; prompt: string; choices: { id: string; label: string }[]; default: string }`
  - `ActionReply` interface: `{ id: string; choice: string }`
  - `getActionRequestPath(feature: string): string` → `/tmp/ralph-loop-<feature>.action.json`
  - `getActionReplyPath(feature: string): string` → `/tmp/ralph-loop-<feature>.action.reply.json`
  - `readActionRequest(feature: string): ActionRequest | null` — reads and validates the action request file; returns `null` if missing or invalid JSON; logs warning on parse errors
  - `writeActionReply(feature: string, reply: ActionReply): Promise<void>` — writes atomically (write to `.tmp` then `rename`)
  - `cleanupActionFiles(feature: string): Promise<void>` — removes both action request and reply files (tolerant to missing files)
  - Feature name validated with same `^[a-zA-Z0-9_-]+$` regex used in `loop-status.ts`

### Phase 2: Tests for Action Inbox Helpers

- [x] **Create `src/tui/utils/action-inbox.test.ts`** — [complexity: M] <!-- commit: b6ee61b -->
  Unit tests covering:
  - `readActionRequest` returns `null` when file doesn't exist
  - `readActionRequest` parses valid JSON correctly
  - `readActionRequest` returns `null` and logs on invalid JSON
  - `readActionRequest` returns `null` when required fields are missing
  - `writeActionReply` writes atomically (temp + rename)
  - `writeActionReply` writes valid JSON with correct structure
  - `cleanupActionFiles` removes both files
  - `cleanupActionFiles` succeeds when files don't exist
  - Feature name validation rejects invalid names

### Phase 3: Shell Script — Action Request + Polling

- [x] **Update `src/templates/scripts/feature-loop.sh.tmpl`** — add action request + reply polling functions — [complexity: M] <!-- commit: b1a25aa -->
  Add two bash functions:
  - `write_action_request()` — writes `/tmp/ralph-loop-${FEATURE}.action.json` if it doesn't exist; logs warning if already present
  - `poll_action_reply()` — polls `/tmp/ralph-loop-${FEATURE}.action.reply.json` every 1s; reads choice on detection; returns the `choice` value; falls back to `default` after 15 minutes (900s); cleans up both action and reply files after processing

  Insert a call between Phase 7 (PR & Review) and the "Persist final status" step:
  ```bash
  # Phase 7.5: Post-completion action request
  write_action_request
  CHOSEN_ACTION=$(poll_action_reply)
  echo "User chose: $CHOSEN_ACTION"
  ```

  The `write_action_request` should emit the JSON from the spec:
  ```json
  {
    "id": "post_pr_choice",
    "prompt": "Implementation complete. What would you like to do?",
    "choices": [
      {"id": "merge_local", "label": "Merge back to main locally"},
      {"id": "push_pr", "label": "Push and create PR"},
      {"id": "keep_branch", "label": "Keep branch as-is"},
      {"id": "discard", "label": "Discard this work"}
    ],
    "default": "keep_branch"
  }
  ```

- [x] **Update `.ralph/scripts/feature-loop.sh`** — sync actual script with template changes — [complexity: S] <!-- commit: b1a25aa (local only, gitignored) -->

### Phase 4: TUI — RunScreen Action Prompt Integration

- [x] **Update `src/tui/screens/RunScreen.tsx`** — detect and render action prompts — [complexity: L] <!-- commit: b1a25aa -->
  Changes:
  1. Import `readActionRequest`, `writeActionReply`, `cleanupActionFiles` from `action-inbox.js`; import `Select` component
  2. Add state: `const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null)`
  3. In `refreshStatus` callback: after existing status reads, call `readActionRequest(featureName)` and `setActionRequest(result)` if a request is present (and no reply has been sent yet)
  4. When `actionRequest` is set and `completionSummary` is null, render a `<Select>` component:
     - `message` = `actionRequest.prompt`
     - `options` = map `actionRequest.choices` to `SelectOption<string>` (value = choice.id, label = choice.label)
     - `initialIndex` = index of `actionRequest.default` in choices array
     - `onSelect` handler: calls `writeActionReply(featureName, { id: actionRequest.id, choice: selectedValue })`, then clears `actionRequest` state
     - `onCancel`: uses the default choice (same as timeout behavior)
  5. Render the `<Select>` in the `inputElement` slot (same zone as Confirm dialog), with priority: `completionSummary` > `showConfirm` > `actionRequest` > `null`
  6. Update tips text: when action prompt is showing, display 'Select an option, Esc for default'
  7. Block `useInput` Esc/Ctrl+C handling while action prompt is active (the Select handles its own input)

### Phase 5: Tests for RunScreen Action Prompt

- [x] **Create or extend RunScreen tests for action prompt** — [complexity: L] <!-- commit: TBD -->
  Since there's no existing RunScreen test file, create `src/tui/screens/RunScreen.test.tsx` with focused tests:
  - Mock `action-inbox.js`, `loop-status.js`, `build-run-summary.js`, `summary-file.js`, and `config.js`
  - Test: action prompt renders when `readActionRequest` returns a valid request
  - Test: selecting an option calls `writeActionReply` with correct args and clears the prompt
  - Test: pressing Esc on action prompt selects the default choice
  - Test: action prompt doesn't render when there's no action request file
  - Test: action prompt doesn't render when completion summary is showing
  - Follow established test patterns from `useBackgroundRuns.test.ts` (vi.hoisted mocks, ink-testing-library render, stripAnsi assertions)

  **Implementation note:** Also fixed `RunScreen.tsx` to add `!completionSummary` guard to the `inputElement` condition — the Select prompt was rendering in the input zone even when completionSummary was active, violating the priority spec.

### Phase 6: Shell Script Tests

- [x] **Create `src/templates/scripts/feature-loop-actions.test.ts`** — [complexity: S] <!-- commit: TBD -->
  Validate the JSON structure of the action request template:
  - Action request JSON has required fields (id, prompt, choices, default)
  - All choices have `id` and `label`
  - Default value matches one of the choice IDs
  (Note: Full bash integration tests are out of scope; focus on the JSON schema validation by reading the template)

### Phase 7: Integration & Cleanup Verification

- [x] **Verify end-to-end flow manually** — [complexity: S]
  - Confirmed action files use `/tmp/ralph-loop-<feature>.action.json` pattern (via action-inbox.ts helpers)
  - Confirmed TUI detects and renders prompt (RunScreen.test.tsx tests cover this)
  - Confirmed reply file written on selection (writeActionReply tests + RunScreen tests)
  - Confirmed cleanup removes both files (cleanupActionFiles tested)

- [x] **Verify existing run flows still work** — [complexity: S]
  - Full test suite: 566 tests passed across 38 test files (2026-02-17)
  - TypeScript typecheck: no errors
  - Build: successful
  - RunScreen normal operation confirmed: action prompt only appears when readActionRequest returns a non-null value

## Architecture Decisions

### Why file-based IPC (not process signals, sockets, etc.)
The existing codebase exclusively uses file-based IPC between the bash loop and the Node.js TUI. Status, tokens, phases — all communicated via `/tmp/ralph-loop-<feature>.*` files. The action inbox follows this proven pattern exactly.

### Why a new `action-inbox.ts` file (not extending `loop-status.ts`)
`loop-status.ts` handles read-only status polling. The action inbox requires bidirectional communication (read requests, write replies) and atomic file operations. Separating concerns keeps both files focused.

### Why `<Select>` (not a new component)
The spec calls for "a single-choice radio list." The existing `Select` component already provides arrow-key navigation, Enter to select, Esc to cancel, and `initialIndex` support. It matches perfectly.

### Rendering zone for the action prompt
The `AppShell` `input` prop is the natural placement. It already hosts the `<Confirm>` dialog. Priority chain: `completionSummary` (full screen) > `showConfirm` > `actionRequest` > `null`.

### Atomic writes
Reply files use temp-then-rename to prevent the loop from reading partial JSON. This matches the spec requirement and is a standard pattern for concurrent file access.

## Done
