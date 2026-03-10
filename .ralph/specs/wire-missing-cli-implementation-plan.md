# wire-missing-cli Implementation Plan

**Spec:** .ralph/specs/wire-missing-cli.md
**Branch:** feat/wire-missing-cli
**Status:** Complete

## Analysis

### What Exists
- `src/index.ts` — CLI entry with `main()`. Routes: no args → shell TUI, `init` → init TUI, `new <feature>` → interview TUI, `--help`, `--version`. **No flag parsing. No `run`/`monitor`/`config` routing.**
- `src/commands/run.ts` — `runCommand(feature, RunOptions)` fully implemented. Accepts: `worktree`, `resume`, `model`, `maxIterations`, `maxE2eAttempts`, `reviewMode`.
- `src/commands/monitor.ts` — `monitorCommand(feature, MonitorOptions)` fully implemented. Accepts: `bash`, `python`, `interval`.
- `src/commands/config.ts` — `handleConfigCommand(args, SessionState)` fully implemented. Needs `SessionState` (uses `provider`, `model`, `projectRoot`).
- `src/commands/init.ts` — Type-only (TUI handles init). Exports `InitOptions { provider }`.
- `src/commands/new.ts` — Type-only + utils (TUI handles new). Exports `NewOptions { edit, editor, force, provider, model, scanResult }`.
- `src/tui/app.tsx` — `AppScreen = 'shell' | 'interview' | 'init' | 'run'`. `renderApp` accepts `screen`, `interviewProps`, etc.
- `src/index.test.ts` — Tests for current routing (no args, init, new, --help, --version).

### What's Needed
1. **Arg parser** — Custom parser in `src/index.ts` to split argv into command + positional args + flags.
2. **Route `run`/`monitor`/`config`** — Add switch cases calling existing command handlers.
3. **Parse flags** — For all commands: run, monitor, init, new.
4. **Missing arg errors** — `run`/`monitor` without `<feature>` → error + usage + exit(1).
5. **Config CLI adaptation** — Create minimal `SessionState` for CLI `config` usage (needs `projectRoot`, `provider`, `model`).
6. **Help text** — Complete with all CLI commands + all TUI slash commands.
7. **Tests** — For parser, routing, flag parsing, error cases.

### Design Decisions
- **Parser location**: Inline in `src/index.ts` as spec requests. Small helper function, not a separate module (avoids over-engineering for ~40 lines).
- **Config SessionState**: Create a minimal state using `getAvailableProvider()` + default model. Same pattern already used in `startInkTui`.
- **Init/New flags**: Parse them and pass to TUI where the existing interface allows (e.g., `init` has no flag passthrough today; `new` already passes `featureName`). Parsed but not fully effective until TUI changes (out of scope per spec). The parsing infrastructure will be ready.
- **`--review-mode`** for run: Include it in parsing since `RunOptions` accepts it and README documents it, even though the spec's explicit flag list omits it.

## Tasks

### Phase 1: Argument Parsing
- [x] Add `parseCliArgs()` helper in `src/index.ts` - fbab0ab
  - Input: `string[]` (process.argv.slice(2))
  - Output: `{ command: string | undefined, positionalArgs: string[], flags: Record<string, string | boolean> }`
  - Handles: `--flag value`, `--flag=value`, boolean flags, short flags (`-i`, `-y`, `-e`, `-f`)
  - Normalizes: `--max-iterations` → `maxIterations`, `-i` → `interactive`, etc.

### Phase 2: Core Implementation
- [x] Wire `run` command - parse flags and call `runCommand()` - fbab0ab
- [x] Wire `monitor` command - parse flags and call `monitorCommand()` - fbab0ab
- [x] Wire `config` command - create minimal SessionState and call `handleConfigCommand()` - fbab0ab
- [x] Parse flags for `init` command - fbab0ab
- [x] Parse flags for `new` command - fbab0ab
- [x] Update help text to list all CLI and TUI commands - fbab0ab

### Phase 3: Tests
- [x] Write tests for `parseCliArgs()` helper - fbab0ab (13 unit tests)
- [x] Write tests for `run` command routing - fbab0ab
- [x] Write tests for `monitor` command routing - fbab0ab
- [x] Write tests for `config` command routing - fbab0ab
- [x] Write tests for `init`/`new` flag parsing - fbab0ab
- [x] Write tests for updated help text - fbab0ab

### Phase 4: Polish
- [x] Verify all acceptance criteria from spec - fbab0ab (39 tests pass, 727 total)
- [x] Run full validation: `npm run typecheck && npm run test && npm run build` - fbab0ab

## Done

- All phases complete in commit fbab0ab
- 39 tests in src/index.test.ts (parseCliArgs unit tests + full routing coverage)
- All 727 project tests pass
