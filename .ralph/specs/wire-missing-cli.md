# Wire Missing CLI Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-19

## Purpose
Enable all documented CLI commands to work from the entry point and parse the documented flags using minimal custom logic, while completing the help text for both CLI and TUI commands.

## User Stories
- As a CLI user, I want `wiggum run/monitor/config` to work as documented so I can execute workflows without the TUI.
- As a CLI user, I want documented flags to be parsed so I can control behavior from the command line.
- As a user, I want `--help` to list all available CLI and TUI commands so I can discover functionality.

## Requirements

### Functional Requirements
- [x] **CLI command routing**
  - **Behavior:** Update `src/index.ts` routing to handle `run`, `monitor`, and `config` commands.
  - **Acceptance:**
    - `wiggum run <feature>` invokes `runCommand()` from `src/commands/run.ts`.
    - `wiggum monitor <feature>` invokes `monitorCommand()` from `src/commands/monitor.ts`.
    - `wiggum config [args...]` invokes `handleConfigCommand()` from `src/commands/config.ts`.

- [x] **Custom argument parsing (no external libs)**
  - **Behavior:** Parse documented flags in `src/index.ts` and pass them into command handlers via their existing option interfaces.
  - **Flags to parse:**
    - **run:** `--worktree`, `--resume`, `--model <model>`, `--max-iterations <n>`, `--max-e2e-attempts <n>`
    - **monitor:** `--interval <seconds>`, `--bash`
    - **init:** `--provider <name>`, `-i/--interactive`, `-y/--yes`
    - **new:** `--provider <name>`, `--model <model>`, `-e/--edit`, `-f/--force`
  - **Acceptance:**
    - Flags with values (`--model`, `--max-iterations`, `--interval`, etc.) are correctly associated with the next argument.
    - Boolean flags (`--resume`, `--bash`, `-e`, `-f`, `-i`, `-y`) are set to `true` when present.
    - Parsed values are passed into the correct command handler options.

- [x] **Missing required args handling**
  - **Behavior:** If a command requires a positional argument (e.g., `run <feature>` or `monitor <feature>`) and it is missing, show error + usage and exit non-zero.
  - **Acceptance:**
    - `wiggum run` outputs a clear error, shows usage for `run`, and exits with non-zero code.
    - `wiggum monitor` behaves similarly.

- [x] **Help text completeness**
  - **Behavior:** Update `--help` output in `src/index.ts` to list all CLI commands and all TUI slash commands.
  - **Acceptance:**
    - CLI section includes: `init`, `new`, `run`, `monitor`, `config`.
    - TUI section includes: `/init`, `/new`, `/run`, `/monitor`, `/sync`, `/config`, `/help`, `/exit`.  

### Non-Functional Requirements
- [x] Parsing logic must be deterministic and avoid external dependencies.
- [x] Error messages for invalid or missing args must be user-friendly and avoid stack traces.

## Technical Notes
- Implement a small, predictable parser in `src/index.ts`:
  - Split `process.argv` into command, positional args, and flags.
  - Support `--flag value` and `--flag=value` if existing patterns allow (optional).
  - Validate presence of required positional args for `run`/`monitor`.
  - Normalize short flags: `-i`, `-y`, `-e`, `-f`.
- Map parsed results into the existing options interfaces expected by:
  - `runCommand(featureName, options)`
  - `monitorCommand(featureName, options)`
  - `initCommand(options)`
  - `newCommand(featureName, options)`
  - `handleConfigCommand(args, options?)` (if applicable)
- Update help output in `src/index.ts` (likely near the existing `--help` switch case).
- No TUI changes in this iteration.

## Acceptance Criteria
- [x] `wiggum run <feature>` invokes `runCommand()` with parsed flags.
- [x] `wiggum monitor <feature>` invokes `monitorCommand()` with parsed flags.
- [x] `wiggum config [args...]` invokes `handleConfigCommand()`.
- [x] Missing `<feature>` for `run`/`monitor` shows error + usage and exits non-zero.
- [x] `wiggum --help` lists all CLI commands and all TUI slash commands.
- [x] Documented flags for `run`, `monitor`, `init`, and `new` are parsed and passed to handlers.

## Out of Scope
- Wiring `/config` in TUI.
- Implementing `--python` for monitor.
- Replacing parsing with a third-party CLI library.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents
- README (CLI commands and flags)
- `src/index.ts` (CLI entry point and help text)
- `src/commands/run.ts`, `monitor.ts`, `config.ts`, `init.ts`, `new.ts`