# route-wiggum-monitor Implementation Plan

**Spec:** .ralph/specs/route-wiggum-monitor.md
**Branch:** feat/route-wiggum-monitor
**Status:** In Progress

## Codebase Analysis

### What Exists
- `src/index.ts:324-337` — `monitor` case calls `monitorCommand()` directly (always headless)
- `src/commands/monitor.ts` — headless streaming dashboard (`displayDashboard`) + bash script path
- `src/tui/screens/RunScreen.tsx:172-186` — already supports `monitorOnly` boolean prop (no spawn, poll-only)
- `src/tui/screens/MainShell.tsx:213-247` — `/monitor` TUI shell command navigates to RunScreen with `monitorOnly: true` (must remain unchanged)
- `src/tui/app.tsx:305-327` — `App` component renders `RunScreen` with `monitorOnly` from `screenProps`
- `src/tui/app.tsx:84-86` — `screenProps` initialized only from `interviewProps`; no `runProps` equivalent
- `src/index.ts:132-208` — `startInkTui(initialScreen, interviewFeature?)` — no support for passing run/monitor props
- `src/index.ts:52-59` — `valueFlagSet` for arg parsing (no `--stream`)
- No CI detection utility exists anywhere in the codebase

### Key Gaps
1. **No `runProps` in `RenderAppOptions`/`AppProps`** — can't pass `{ featureName, monitorOnly: true }` to `App` when starting on `'run'` screen
2. **`startInkTui` signature too narrow** — only accepts `interviewFeature`, no way to pass run/monitor params
3. **No `--stream` flag** — not in `parseCliArgs` or `MonitorOptions`
4. **No CI detection** — `process.env.CI` not checked anywhere
5. **No TTY routing logic** in the `monitor` case — always calls `monitorCommand()`
6. **No Ink error fallback** — if Ink fails to start, no graceful degradation to headless

## Tasks

### Phase 1: Plumbing — Pass run/monitor props through to App

- [x] **1.1 Add `runProps` to `AppProps` and `RenderAppOptions`** — [complexity: S]
  - File: `src/tui/app.tsx`
  - Add `RunAppProps` interface: `{ featureName: string; monitorOnly?: boolean; reviewMode?: string }`
  - Add `runProps?: RunAppProps` to `AppProps` and `RenderAppOptions`
  - Initialize `screenProps` from `runProps` when `screen === 'run'` (like `interviewProps` for `'interview'`)
  - Wire through `renderApp()` → `<App>`

- [x] **1.2 Extend `startInkTui` to accept run/monitor params** — [complexity: S]
  - File: `src/index.ts`
  - Change signature: `startInkTui(initialScreen, options?: { interviewFeature?: string; runFeature?: string; monitorOnly?: boolean })`
  - Build `runProps` from options and pass to `renderApp()`
  - Keep backward-compat: existing call sites (`startInkTui('shell')`, `startInkTui('init')`, `startInkTui('interview', name)`) still work

### Phase 2: CLI Routing Logic

- [x] **2.1 Add `--stream` flag to CLI arg parsing** — [complexity: S]
  - File: `src/index.ts`
  - `--stream` is a boolean flag (not in `valueFlagSet`), just needs to be read as `parsed.flags.stream`
  - No changes to `parseCliArgs` needed — boolean flags work already (like `--bash`)

- [x] **2.2 Add `isCI()` utility** — [complexity: S]
  - File: `src/utils/ci.ts` (new file)
  - Simple: `export function isCI(): boolean { return !!process.env.CI || !!process.env.CONTINUOUS_INTEGRATION; }`
  - Keep minimal — match spec's `process.env.CI` pattern

- [x] **2.3 Update monitor routing in `src/index.ts`** — [complexity: M]
  - File: `src/index.ts` (monitor case, lines 324-337)
  - Routing logic order per spec:
    1. If `--bash` → `monitorCommand(feature, { bash: true, interval })`
    2. Else if `--stream` → `monitorCommand(feature, { interval })`
    3. Else if `process.stdout.isTTY && !isCI()` → `startInkTui('run', { runFeature: feature, monitorOnly: true })`
    4. Else → `monitorCommand(feature, { interval })`
  - Update usage string: `'Usage: wiggum monitor <feature> [--interval <seconds>] [--bash] [--stream]'`

- [x] **2.4 Add Ink fallback on TUI startup error** — [complexity: S]
  - File: `src/index.ts` (monitor case)
  - Wrap `startInkTui()` call in try/catch
  - On error: `logger.error(...)` + fall back to `monitorCommand(feature, { interval })`

### Phase 3: Tests

- [x] **3.1 Test `runProps` plumbing in App** — [complexity: M]
  - File: `src/tui/app.test.tsx` (new file)
  - Test: `App` with `screen='run'` and `runProps={ featureName: 'foo', monitorOnly: true }` renders RunScreen with correct props
  - Test: `App` with `runProps={ featureName: 'foo' }` renders with `monitorOnly=false`
  - Test: `App` with `screen='shell'` without runProps renders MainShell

- [x] **3.2 Test `isCI()` utility** — [complexity: S]
  - File: `src/utils/ci.test.ts` (new file)
  - Test: returns `true` when `process.env.CI` is set
  - Test: returns `true` when `process.env.CONTINUOUS_INTEGRATION` is set
  - Test: returns `false` when neither is set

- [x] **3.3 Test monitor CLI routing logic** — [complexity: M]
  - File: `src/index.test.ts` (extend existing monitor tests)
  - Test: `monitor foo` in TTY (no CI) → calls `renderApp` with `screen: 'run'` and `runProps.monitorOnly: true` (mock `process.stdout.isTTY = true`)
  - Test: `monitor foo --stream` in TTY → calls `monitorCommand` (headless)
  - Test: `monitor foo --bash` → calls `monitorCommand` with `bash: true`
  - Test: `monitor foo` in non-TTY → calls `monitorCommand` (headless)
  - Test: `monitor foo` in CI → calls `monitorCommand` (headless)
  - Test: `monitor foo` with TUI error → falls back to `monitorCommand`

- [x] **3.4 Test `--stream` flag parsing** — [complexity: S]
  - File: `src/index.test.ts`
  - Test: `parseCliArgs(['monitor', 'foo', '--stream'])` → `flags.stream === true`

### Phase 4: Polish

- [x] **4.1 Update help text** — [complexity: S]
  - File: `src/index.ts` (help text section)
  - Add `--stream` to the monitor command help: `monitor <feature> [--interval <seconds>] [--bash] [--stream]`
  - Add brief description: `--stream  Force headless streaming output (skip TUI)`

### Phase 5: E2E Testing

TUI E2E tests executed via xterm.js bridge + agent-browser.
Fixture projects in `e2e/fixtures/`. Bridge at `http://localhost:3999`.

- [x] E2E: Monitor in TTY opens TUI RunScreen - PASSED
  - **Command:** `monitor test-feature`
  - **CWD:** e2e/fixtures/initialized-project
  - **Steps:**
    1. Open bridge URL with PTY (isTTY=true, CI not set)
    2. Run `wiggum monitor test-feature` in TTY terminal
    3. Verified Ink TUI renders (RunScreen chrome: feature panel, Phases/Changes/PR sections, bottom status bar)
  - **Verify:** RunScreen UI elements visible (`test-feature` panel, `Run Loop │ Idle │ test-feature` statusbar); no headless ASCII dashboard
  - **Screenshot:** e2e/e2e-monitor-tui.png

- [x] E2E: Monitor --stream forces headless output - PASSED
  - **Command:** `monitor test-feature --stream`
  - **CWD:** e2e/fixtures/initialized-project
  - **Steps:**
    1. Open bridge URL with PTY (isTTY=true, CI not set)
    2. Run `wiggum monitor test-feature --stream` in TTY terminal
    3. Verified headless ASCII dashboard rendered (not Ink UI)
  - **Verify:** Plain text dashboard visible (`RALPH MONITOR: test-feature`, progress bars, `Refreshing every 5s`); no React/Ink rendering
  - **Screenshot:** e2e/e2e-monitor-stream.png

## Done
- Phases 1-4 complete
- Phase 5 (E2E) complete — all scenarios PASSED (2026-02-22)
