# Route Wiggum Monitor Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-22

## Purpose
Route `wiggum monitor <feature>` to the Ink TUI RunScreen in interactive terminals to provide a richer, more readable monitoring experience, while preserving headless streaming for non-TTY/CI contexts and explicit overrides.

## User Stories
- As a CLI user, I want `wiggum monitor` to open the Ink TUI when I’m in an interactive terminal so I can view the ActivityFeed, progress panels, and filtered logs.
- As a CI or piped-output user, I want `wiggum monitor` to stream headless output so logs remain machine-readable and stable.
- As a power user, I want a `--stream` flag to force headless output even when TTY is available.
- As a user who relies on the bash script flow, I want `--bash` to always route to the existing bash script behavior.

## Requirements

### Functional Requirements
- [x] **TTY Routing:** When `process.stdout.isTTY` is true **and** not in CI, `wiggum monitor <feature>` must start the Ink TUI RunScreen in **monitor-only (read-only)** mode.
  - **Acceptance criteria:** With a TTY and no CI env, the Ink UI renders and no console.clear loop occurs.
- [x] **Non-TTY/CI Fallback:** When stdout is not a TTY or when running in CI, the command must use the existing headless console streaming monitor.
  - **Acceptance criteria:** In CI or when output is piped, the command prints streaming logs without Ink UI.
- [x] **Explicit Headless Override:** Add a `--stream` flag to force headless output even when TTY is available.
  - **Acceptance criteria:** `wiggum monitor foo --stream` uses the headless streaming monitor in a TTY.
- [x] **Bash Precedence:** `--bash` must always take precedence and invoke the existing bash script flow regardless of TTY/CI.
  - **Acceptance criteria:** `wiggum monitor foo --bash` runs the bash script even in a TTY.
- [x] **TUI Mode Isolation:** The TUI RunScreen launched via CLI must be **monitor-only** and must not spawn or trigger any run loop.
  - **Acceptance criteria:** No extra loop processes or duplicate executions are triggered when invoked via CLI.
- [x] **TUI Shell Compatibility:** Existing `/monitor` route inside the Ink TUI shell must continue to behave as before.
  - **Acceptance criteria:** The `/monitor` route remains unchanged and functional.

### Non-Functional Requirements
- [x] **Performance:** TUI startup should not add >500ms overhead compared to current monitor startup in a TTY environment.
- [x] **Reliability:** If Ink initialization fails, the CLI should log an error and fall back to headless streaming.
- [x] **Stability:** Headless output format remains unchanged for CI/piped use cases.

## Technical Notes
- **Entry Routing:**
  - Update the CLI command routing in `src/index.ts` (monitor case).
  - Routing logic order:
    1. If `--bash`, use existing bash script path.
    2. Else if `--stream`, use headless monitor command.
    3. Else if `process.stdout.isTTY && !isCI`, call `startInkTui('run', { feature, mode: 'monitor' })`.
    4. Else use headless monitor command.
- **Monitor Command:**
  - Keep `src/commands/monitor.ts` for headless streaming.
  - Ensure it is only used for non-TTY/CI or explicit `--stream`.
- **RunScreen Update:**
  - Add a prop or mode flag to `src/tui/screens/RunScreen.tsx` (e.g., `mode: 'run' | 'monitor'`).
  - In monitor mode, disable any loop/spawn logic and run in read-only state.
- **Flag Parsing:**
  - Add `--stream` to CLI flag parsing for `monitor`.
  - Ensure `--bash` remains unchanged.
- **CI Detection:**
  - Use existing CI detection utility if present; otherwise use `process.env.CI` consistent with current patterns.
- **Tests (Recommended):**
  - Add unit tests for routing logic (TTY/CI/flags).
  - Add e2e tests to confirm Ink screen appears in TTY and headless output in CI.

## Acceptance Criteria
- [x] `wiggum monitor foo` in a TTY (no CI) opens Ink RunScreen in monitor-only mode.
- [x] `wiggum monitor foo --stream` forces headless streaming in a TTY.
- [x] `wiggum monitor foo` in CI or piped output uses headless streaming.
- [x] `wiggum monitor foo --bash` always runs the bash script flow.
- [x] The TUI `/monitor` route continues to work as before.
- [x] No duplicate monitor/run loops are spawned in TUI mode.

## Out of Scope
- Changes to RunScreen layout or ActivityFeed filtering logic.
- Any redesign of headless streaming output format.
- New CLI commands beyond `--stream`.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm  

## Reference Documents
- https://github.com/federiconeri/wiggum-cli/issues/104