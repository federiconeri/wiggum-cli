# add-debug-log Feature Specification

**Status:** Planned  
**Version:** 1.0  
**Last Updated:** 2026-02-09

## Purpose

Introduce robust, non-disruptive debugging capabilities for the Ink-based TUI and surrounding CLI flow by adding file-based debug logging and a minimal in-UI indicator, without interfering with stdout or the primary user experience.

## User Stories

- As a CLI/TUI developer, I want to enable debug logging via a flag so that I can inspect what the app is doing without changing my code or relying on `console.log`.
- As a maintainer, I want debug logs written to a predictable location under `/.ralph/debug/` so that I can reliably collect logs from users or CI runs.
- As a developer, I want logs to capture TUI lifecycle, AI calls, tool invocations, and key state transitions so I can understand how the system operates and diagnose issues.
- As a user running in debug mode, I want a small indicator in the TUI that debug mode is active so I don’t forget I’m generating logs.
- As a performance-conscious maintainer, I want debug logging to be effectively a no-op when disabled so that it doesn’t impact normal CLI performance.

## Requirements

### Functional Requirements

#### FR1: Debug Mode Activation via CLI Flag

- [ ] The CLI must support a `--debug` flag (and equivalent short form if desired, e.g. `-d`) to enable debug logging for that process invocation.
- [ ] When `--debug` is provided to the `wiggum` CLI, debug logging must be enabled for the entire session, from the earliest point possible in `src/index.ts` through TUI teardown.
- [ ] When `--debug` is not provided, the debug logging mechanism must be disabled by default and must not write any logs.

**Acceptance Criteria**

- [ ] Running `wiggum --debug new "my feature"` results in a debug log file being created and populated under the expected path.
- [ ] Running `wiggum new "my feature"` (without `--debug`) does not create or write any debug log files.
- [ ] Debug activation is visible in code via a single “debug enabled” flag or configuration object that can be passed to subsystems (TUI, AI, tools).

#### FR2: Log File Location and Structure

- [ ] When debug mode is enabled, logs must be written to a file under the user’s home directory in a `.ralph/debug/` folder (e.g. `~/.ralph/debug/latest.log` or similar).
- [ ] If the `.ralph/debug/` directory does not exist, it must be created automatically (including parent `.ralph` if needed).
- [ ] If the log file already exists, logs must be appended rather than truncating by default.
- [ ] The log file path must be discoverable from code (e.g. via a small helper returning the resolved path) to allow tests and tooling to assert against it.
- [ ] The feature should support a simple environment variable override for the debug log path (e.g. `RALPH_DEBUG_LOG`) for advanced usage, but this override is secondary to the primary `--debug` flag flow.

**Acceptance Criteria**

- [ ] On macOS/Linux, running `wiggum --debug ...` creates (if needed) and writes logs under `$HOME/.ralph/debug/`.
- [ ] If `$HOME/.ralph` doesn’t exist, it is created without error.
- [ ] A second `wiggum --debug ...` run appends to the same file instead of overwriting it.
- [ ] Setting `RALPH_DEBUG_LOG=/tmp/ralph-debug.log wiggum --debug ...` writes to `/tmp/ralph-debug.log` instead of the default path.
- [ ] No error is thrown if the directory already exists.

#### FR3: Debug Logger API

- [ ] Implement a new debug logger module, e.g. `src/utils/debug-logger.ts`, that encapsulates file-based logging and lazy stream initialization.
- [ ] The logger must expose category-based logging functions, such as:
  - `debugLog(category: string, message: string, data?: unknown)`
  - `debugError(category: string, error: unknown, context?: unknown)`
- [ ] The logger must be a no-op when debug mode is disabled (no file access, no writes).
- [ ] The logger must be safe to call from anywhere in the codebase without requiring callers to handle file I/O details.
- [ ] Log entries must be formatted as single-line entries with ISO timestamps, category, and JSON-serialized data (where provided), e.g.:
  - `[2026-02-09T12:34:56.789Z] [TUI] Screen transition {"from":"Home","to":"Spec"}`
- [ ] The logger must handle non-Error values passed into `debugError` gracefully.

**Acceptance Criteria**

- [ ] Calling `debugLog('TUI', 'Screen transition', { from: 'A', to: 'B' })` writes a single line with timestamp, `[TUI]`, and JSON data when debug is enabled.
- [ ] Calling `debugLog(...)` when debug is disabled does not create or touch any files.
- [ ] Calling `debugError('AI', new Error('boom'))` logs the error message and stack trace fields in JSON form.
- [ ] Passing a non-Error (e.g. string or unknown object) to `debugError` still results in a meaningful log line (no uncaught exceptions from the logger itself).

#### FR4: Logging Coverage (What Gets Logged)

- [ ] At minimum, the following categories and events must be instrumented:

  **TUI / Lifecycle (`[TUI]`)**
  - [ ] CLI startup and TUI initialization (including basic environment: command, args).
  - [ ] Screen transitions (e.g. from main menu to spec generation).
  - [ ] Important phase changes in the TUI flow (e.g. “init context”, “scan project”, “generate spec”, “sync done”).
  - [ ] Unhandled errors in TUI components/hooks.

  **AI (`[AI]`)**
  - [ ] AI calls, including model name, tool list used, and high-level prompt type (not full prompt content by default).
  - [ ] AI responses at a summary level (e.g. “received response of length X tokens”), with a way to include more detail later if desired.
  - [ ] Failures from AI provider (network errors, API errors) with error codes and messages.

  **Tools / Generators (`[TOOL]`)**
  - [ ] Tool invocations with tool name and top-level parameters (non-sensitive).
  - [ ] Success/failure of tool runs, including duration when easily available.
  - [ ] Generator runs (spec/config generation), with template names and output targets (paths).

  **Scanning / Context (`[SCAN]`, `[CONFIG]`)**
  - [ ] Detected frameworks/technologies and major scan milestones.
  - [ ] Config file loads, including which file was used (e.g. `.ralph/config` vs default).
  - [ ] Warnings or fallbacks (e.g. “no config found, using defaults”).

  **Errors (`[ERROR]`)**
  - [ ] Any unhandled exceptions or top-level catch blocks should log using `debugError`, including context (current command, screen, and relevant identifiers).

- [ ] Logging must avoid dumping entire file contents or large payloads by default; it should focus on structured metadata that is “useful to understand how the software operates”.

**Acceptance Criteria**

- [ ] A complete debug run shows entries for: startup, project scan, AI calls, spec generation steps, and shutdown.
- [ ] When an AI API error is simulated (e.g. by mocking the AI provider), a `[AI]` log line is written with error information.
- [ ] When a tool fails (e.g. scanner or generator throws), a `[TOOL]` and/or `[ERROR]` log entry is created with the failure details.
- [ ] Logs do not include raw file contents of user projects or API keys.

#### FR5: TUI Debug Indicator

- [ ] When debug mode is active, the Ink-based TUI must display a minimal indicator that debug is enabled, ideally in a footer/footer-like area.
- [ ] The indicator should be visually subtle but clearly readable, e.g. `[DEBUG]` with dimColor or a low-contrast style.
- [ ] The indicator must not materially change layout or break existing TUI flows (e.g. it should fit in existing layout or a small footer row).
- [ ] When debug mode is not active, the indicator must not be rendered at all.

**Acceptance Criteria**

- [ ] When running `wiggum --debug ...`, the main TUI view displays a small `[DEBUG]` marker in the footer or equivalent area.
- [ ] When running without `--debug`, the UI is visually unchanged compared to current behavior.
- [ ] The presence/absence of the indicator matches a single debug-enabled flag propagated from CLI to the TUI root (`src/tui/app.tsx` or equivalent).

#### FR6: Integration with Existing Logging

- [ ] Existing `logger` utilities (e.g. `src/utils/logger.ts`) must remain unchanged for user-facing logging, but can optionally delegate to `debugLog` for additional detail when debug is enabled.
- [ ] There must be a clear separation between user-facing messages (stdout) and debug logs (file), ensuring debug logs never interfere with the Ink UI’s ownership of stdout.
- [ ] The debug logger must not print to stdout or stderr in normal operation.

**Acceptance Criteria**

- [ ] User-facing output (progress, prompts) remains unchanged when debug is enabled.
- [ ] Inspecting the code shows no `console.log` additions in the TUI path for debug purposes; all such behavior is routed through `debugLog`.
- [ ] Enabling debug does not cause double-printing of messages to stdout.

### Non-Functional Requirements

#### NFR1: Performance

- [ ] When debug mode is disabled, the overhead of the debug logger must be negligible (ideally just a boolean branch).
- [ ] When debug mode is enabled, performance should be acceptable for development use (logging is allowed to incur some overhead but not to the point of making the app unusable).
- [ ] JSON serialization must be limited to the data explicitly provided; the logger should not walk arbitrary large object graphs by default.

**Acceptance Criteria**

- [ ] A micro-benchmark or simple timing comparison shows no measurable slowdown in a typical `wiggum` command when debug is disabled.
- [ ] In debug mode, spec generation still completes within a reasonable bound (e.g. less than 2x the non-debug time in test conditions).

#### NFR2: Reliability and Safety

- [ ] The logger must handle file system errors gracefully (e.g. permission issues, full disk) without crashing the CLI; it should either silently disable logging or emit a single user-facing warning via the standard logger.
- [ ] Calls to `debugLog` or `debugError` must never throw exceptions to callers.
- [ ] Log records must avoid including sensitive information (e.g., API keys, full file contents, access tokens); where potentially sensitive payloads exist, log identifiers or hashes instead.

**Acceptance Criteria**

- [ ] Simulating a write error (e.g. invalid path or read-only directory) does not crash the CLI; debug logging either stops or reports a single warning, but the TUI still runs.
- [ ] No unit test can induce the logger to throw when called with arbitrary `unknown` values in `data` or `error`.
- [ ] Search in logs for known API key patterns during tests yields no matches.

#### NFR3: Maintainability and Extensibility

- [ ] The debug logger API must be simple and centralized (`src/utils/debug-logger.ts`), with no duplicated file-handling logic elsewhere.
- [ ] Adding new log categories in the future should require only enum/constant additions and local instrumentation changes, not refactoring core logger behavior.
- [ ] The design should support future expansions (e.g. optional Sentry or other backends) by adding additional transports behind the same public API.

**Acceptance Criteria**

- [ ] The logger implementation is contained in a single module, referenced by other modules via imports only.
- [ ] A developer can add a new category (e.g. `[SYNC]`) by updating a category constants list and adding `debugLog('SYNC', ...)` calls without any structural changes to the logger.
- [ ] Inline comments or a short docstring explain how to extend logging behavior and categories.

## Technical Notes

### Implementation Approach

1. **Debug Mode Flag Handling (CLI / Entry Point)**
   - Update the CLI argument parsing in `src/index.ts` (and corresponding `bin/ralph.js` if needed) to detect a `--debug` (and optional `-d`) flag.
   - Set a global or config-level flag (e.g. `const isDebugEnabled = true`) early in startup.
   - Pass this flag into:
     - The debug logger initialization function (to open the file stream).
     - The TUI root component (e.g. `<App debugEnabled={isDebugEnabled} />`).

2. **Debug Logger Module (`src/utils/debug-logger.ts`)**
   - Implement a module-scoped `WriteStream | null` and a function like `initDebugLogger(enabled: boolean, overridePath?: string)`:
     - When `enabled === true`, resolve the directory `$HOME/.ralph/debug/` using `os.homedir()` + `path.join`, ensure it exists, and open a write stream in append mode.
     - Respect an override via `process.env.RALPH_DEBUG_LOG` when present.
   - Implement:
     - `export function debugLog(category: string, message: string, data?: unknown): void`
     - `export function debugError(category: string, error: unknown, context?: unknown): void`
   - Ensure these functions:
     - Check an internal `isDebugEnabled` boolean before doing any work.
     - Wrap JSON serialization in `try/catch` and fall back to safe stringification.
     - Write a single line with `[timestamp] [CATEGORY] message dataJson\n`.

3. **TUI Integration (`src/tui/app.tsx` and Components)**
   - Extend the root TUI app component to accept a `debugEnabled` prop.
   - Use this prop to:
     - Pass down to hooks that might conditionally log more detail.
     - Render a footer-like indicator, e.g.:

       ```tsx
       {debugEnabled && (
         <Box justifyContent="flex-end">
           <Text dimColor>[DEBUG]</Text>
         </Box>
       )}
       ```

   - Ensure the layout doesn’t break existing designs; add tests or snapshots if present in TUI tests.

4. **Instrumentation of Key Areas**

   - **TUI Hooks**
     - `src/tui/hooks/useInit.ts`: log app initialization, context building, and any errors.
     - `src/tui/hooks/useSpecGenerator.ts`: log spec generation requests, inputs (high-level), and completion/failure.

   - **AI Layer**
     - `src/ai/enhancer.ts`: log AI calls with model name, tool list, and summary of prompt type; log response summaries and errors.
     - `src/ai/conversation/manager.ts`: log tool call dispatches, tool names, and outcomes.

   - **Scanner and Config**
     - `src/scanner/...`: log detected frameworks and major scan steps under `[SCAN]`.
     - `src/context` / config loaders: log which config files are loaded or when defaults are used under `[CONFIG]`.

   - **Global Error Handlers**
     - In `src/index.ts`, wrap the main async entry in a top-level `try/catch` and in `process.on('unhandledRejection')`/`process.on('uncaughtException')` handlers, calling `debugError('[ERROR]', error, { phase: 'startup/shutdown' })` where appropriate.

### Key Dependencies

- Node.js built-ins:
  - `fs` for file streams.
  - `path` and `os` for cross-platform path resolution and home directory detection.
- Existing project modules:
  - `src/index.ts` – entry point for CLI, integrate debug flag and logger init.
  - `src/tui/app.tsx` and components – for UI indicator and debug-aware behavior.
  - `src/utils/logger.ts` – may optionally integrate with debug logger, but should not be tightly coupled.

### Database Changes

- None. This feature is logging-only and does not require database or persistent model changes beyond writing to the file system.

## Acceptance Criteria

- [ ] `wiggum --debug ...` reliably creates/uses a log file under `$HOME/.ralph/debug/` (or `RALPH_DEBUG_LOG` override) and writes structured log entries.
- [ ] Running without `--debug` produces no debug log file and zero file I/O from the debug logger.
- [ ] Log entries include timestamp, category, message, and optional JSON data, and are one line per event.
- [ ] Key operations are logged: CLI startup, screen transitions, project scanning, AI calls, tool executions, spec generation, and shutdown.
- [ ] Simulated errors in AI calls, tools, or TUI hooks produce `[AI]`, `[TOOL]`, or `[ERROR]` log entries with context.
- [ ] A visible `[DEBUG]` indicator appears in the TUI when debug is enabled, and is absent otherwise.
- [ ] Debug logger never throws, even under file system errors or with malformed `data`/`error` objects.
- [ ] When debug is disabled, benchmark or measurement shows no meaningful performance degradation compared to current behavior.

## Out of Scope

- Real-time log viewer rendered in the TUI.
- Log rotation or archival (users may rely on external tools like `logrotate`).
- Metrics, analytics, or external error tracking services (e.g. Sentry, Datadog).
- Advanced log formats (e.g. NDJSON schemas) or multi-file log partitioning.

## Project Tech Stack

- **Framework (TUI):** Ink (React v^18.3.1)
- **Language:** TypeScript (Node.js CLI)
- **Unit Testing:** Vitest
- **Package Manager:** npm

## Reference Documents

- Existing project structure and patterns in:
  - `bin/ralph.js`
  - `src/index.ts`
  - `src/tui/app.tsx` and `src/tui/hooks/*`
  - `src/ai/*`
  - `src/scanner/*`
  - `src/utils/logger.ts`
- Inline context description of desired debug behavior and scope constraints as provided by the user.