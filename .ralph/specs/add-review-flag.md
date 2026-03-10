# add-review-flag Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-09

---

## Purpose

Add a `--review-mode` flag to the `/run` command (and corresponding config option) to control whether the feature loop stops at PR creation for manual review or proceeds with an AI-driven review and auto-merge, with clear precedence and strict validation.

---

## User Stories

- As a developer, I want `/run` to default to manual review so that PRs are opened but not merged automatically, giving me control over code review and merging.
- As a developer, I want to run `/run --review-mode auto` so that the loop completes the full cycle (including review and auto-merge) without requiring my manual intervention.
- As a team, we want to set `reviewMode` in `ralph.config.cjs` so that our preferred default behavior (manual or auto) is shared and consistent across the project.
- As a user, I want CLI flags to override config values so I can temporarily change the review behavior without editing configuration files.
- As a user, I want invalid `reviewMode` values (from CLI or config) to cause a clear, early error so I don’t waste time running a misconfigured loop.

---

## Requirements

### Functional Requirements

#### FR1: Add `reviewMode` to Loop Configuration

- [x] The loop configuration must support a `reviewMode` field with allowed values `'manual'` or `'auto'`.

  **Details:**
  - `LoopConfig` in `src/utils/config.ts` must be extended:

    ```ts
    export interface LoopConfig {
      maxIterations: number;
      maxE2eAttempts: number;
      defaultModel: string;
      planningModel: string;
      reviewMode: 'manual' | 'auto'; // NEW
    }
    ```

  - `DEFAULT_CONFIG.loop` (or equivalent default config object) must include:

    ```ts
    loop: {
      maxIterations: 10,
      maxE2eAttempts: 5,
      defaultModel: 'sonnet',
      planningModel: 'opus',
      reviewMode: 'manual', // NEW default
    }
    ```

  **Acceptance Criteria:**
  - [x] TypeScript compilation succeeds with `LoopConfig` including `reviewMode: 'manual' | 'auto'`.
  - [x] Programmatic access `config.loop.reviewMode` returns `'manual'` by default when no user config is present.
  - [x] Any existing code paths that construct or use `LoopConfig` continue to compile, with `reviewMode` either set or defaulted.

---

#### FR2: Default Behavior is Manual Mode

- [x] When the `/run` command executes with no `--review-mode` flag and no `reviewMode` in `ralph.config.cjs`, it must run the loop in manual mode.

  **Details:**
  - Default resolution order:
    1. CLI flag (`options.reviewMode`)
    2. Config (`config.loop.reviewMode`)
    3. Hardcoded default `'manual'`
  - This must result in the manual review prompt (no auto-merge) in the script.

  **Acceptance Criteria:**
  - [x] Remove/rename `ralph.config.cjs` so no config is found; run `/run` and confirm:
    - The loop runs successfully.
    - The feature loop uses the manual review prompt (see FR5).
  - [x] With a minimal `ralph.config.cjs` lacking `loop.reviewMode`, run `/run` and confirm behavior is identical to the no-config case (manual mode).

---

#### FR3: Add `--review-mode` to `/run` Command

- [x] The `/run` command must accept a `--review-mode` flag with value `'manual'` or `'auto'`, and pass it through to the loop script.

  **Details:**
  - In `src/commands/run.ts`:
    - Extend `RunOptions`:

      ```ts
      export interface RunOptions {
        worktree?: boolean;
        resume?: boolean;
        model?: string;
        maxIterations?: number;
        maxE2eAttempts?: number;
        reviewMode?: 'manual' | 'auto'; // NEW
      }
      ```

    - Resolve `reviewMode`:

      ```ts
      const reviewModeFromCli = options.reviewMode;
      const reviewModeFromConfig = config.loop.reviewMode;

      const reviewMode = reviewModeFromCli ?? reviewModeFromConfig ?? 'manual';
      ```

    - Validate before use (see FR4).
    - When valid, append to script args:

      ```ts
      args.push('--review-mode', reviewMode);
      ```

  **Acceptance Criteria:**
  - [x] `/run --review-mode manual` executes successfully and passes `--review-mode manual` to `feature-loop.sh`.
  - [x] `/run --review-mode auto` executes successfully and passes `--review-mode auto` to `feature-loop.sh`.
  - [x] Debug/logging (if enabled) or inspecting the spawned process command line confirms the flag is present and correct.

---

#### FR4: Precedence and Strict Validation

- [x] CLI flag must override config, and only `'manual'` and `'auto'` must be accepted as valid values. All other values must be rejected with a clear error before the loop starts.

  **Details:**
  - Precedence:
    - If `options.reviewMode` is defined, it must be used regardless of `config.loop.reviewMode`.
    - If `options.reviewMode` is undefined and `config.loop.reviewMode` is defined, use the config value.
    - Otherwise, use `'manual'`.
  - Validation (in `src/commands/run.ts`, after computing `reviewMode`):
    - Allowed values: `'manual'`, `'auto'` (case-sensitive).
    - Any other value (from CLI or config) causes an immediate error and non-zero exit.

    Example implementation sketch:

    ```ts
    const allowedReviewModes = ['manual', 'auto'] as const;

    if (!allowedReviewModes.includes(reviewMode as any)) {
      logger.error(
        `Invalid reviewMode '${reviewMode}'. Allowed values are 'manual' or 'auto'.`
      );
      process.exitCode = 1;
      return;
    }
    ```

  **Acceptance Criteria:**
  - [x] With `ralph.config.cjs` specifying `loop.reviewMode = 'manual'`, run `/run --review-mode auto` and confirm:
    - The script receives `--review-mode auto`.
    - The behavior corresponds to auto mode (see FR5).
  - [x] With `ralph.config.cjs` specifying `loop.reviewMode = 'auto'`, run `/run` (no flag) and confirm:
    - The script receives `--review-mode auto`.
  - [x] With `ralph.config.cjs` specifying `loop.reviewMode = 'foo'`, run `/run` and confirm:
    - The process exits non-zero.
    - The output includes a clear message like:
      `Invalid reviewMode 'foo'. Allowed values are 'manual' or 'auto'.`
    - The feature loop does not start.
  - [x] With `/run --review-mode foo` (and a valid or absent config), confirm:
    - The process exits non-zero.
    - The same clear invalid-value message appears.
  - [x] Values such as `AUTO`, `Manual`, `pr-only` are all rejected.

---

#### FR5: Condition the Review Phase on `REVIEW_MODE` in Script

- [x] The `feature-loop.sh` script must select between manual and auto review prompts based solely on `REVIEW_MODE`.

  **Details:**
  - File: `src/templates/scripts/feature-loop.sh.tmpl`
  - Add argument parsing for `--review-mode`:

    ```sh
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --review-mode)
          REVIEW_MODE="$2"
          shift 2
          ;;
        # ...existing options...
        *)
          # existing default behavior
          shift 1
          ;;
      esac
    done
    ```

  - Resolve default from config with fallback to `manual`:

    ```sh
    REVIEW_MODE_DEFAULT=$(node -e "console.log(require('$CONFIG_PATH').loop?.reviewMode || 'manual')" 2>/dev/null || echo "manual")
    REVIEW_MODE="${REVIEW_MODE:-$REVIEW_MODE_DEFAULT}"
    ```

  - (Optional but recommended) Shell-side validation:

    ```sh
    if [ "$REVIEW_MODE" != "manual" ] && [ "$REVIEW_MODE" != "auto" ]; then
      echo "Invalid review mode: '$REVIEW_MODE'. Allowed values are 'manual' or 'auto'." >&2
      exit 1
    fi
    ```

  - Make the review phase (Phase 7) conditional:

    ```sh
    if [ "$REVIEW_MODE" = "manual" ]; then
      cat "$PROMPTS_DIR/PROMPT_review_manual.md" | envsubst | $CLAUDE_CMD_OPUS
    else
      # REVIEW_MODE = auto
      cat "$PROMPTS_DIR/PROMPT_review_auto.md" | envsubst | $CLAUDE_CMD_OPUS
    fi
    ```

  - No other behavior changes (logging, safety checks, confirmations) are introduced.

  **Acceptance Criteria:**
  - [x] When `feature-loop.sh` is invoked with `--review-mode manual`, the script uses `PROMPT_review_manual.md` for the review phase.
  - [x] When `feature-loop.sh` is invoked with `--review-mode auto`, the script uses `PROMPT_review_auto.md`.
  - [x] When `feature-loop.sh` is invoked without `--review-mode` and config has `reviewMode: 'manual'`, it uses `PROMPT_review_manual.md`.
  - [x] When `feature-loop.sh` is invoked without `--review-mode` and config has `reviewMode: 'auto'`, it uses `PROMPT_review_auto.md`.
  - [x] When `feature-loop.sh` is invoked without `--review-mode` and config has no `reviewMode`, it defaults to `manual` and uses `PROMPT_review_manual.md`.
  - [x] (If shell validation is added) Invoking `feature-loop.sh --review-mode foo` exits non-zero with a clear error and does not reach the review phase.

---

#### FR6: Update Config Template

- [x] The default Ralph config template must expose `loop.reviewMode` with correct default and documentation.

  **Details:**
  - File: `src/templates/config/ralph.config.cjs.tmpl`
  - Update `loop` section:

    ```js
    loop: {
      maxIterations: 10,
      maxE2eAttempts: 5,
      defaultModel: 'sonnet',
      planningModel: 'opus',
      reviewMode: 'manual', // 'manual' = stop at PR, 'auto' = review + auto-merge
    },
    ```

  **Acceptance Criteria:**
  - [x] Newly generated `ralph.config.cjs` files (via the existing init/generator flow) contain the `reviewMode: 'manual'` line under `loop`.
  - [x] Comments clearly explain what `manual` and `auto` mean.
  - [x] Omitting or changing `reviewMode` in this file behaves as described in FR2–FR4.

---

### Non-Functional Requirements

- [x] Backward compatibility:
  - Projects without `reviewMode` in their config must continue to run without changes, defaulting to manual mode.
  - Existing users of `/run` who do not use the new flag should not observe any behavior change (assuming previous behavior was effectively "auto"; the new contract is explicit, but code must be aligned with this spec for new behavior).
- [x] Error messages must be:
  - clear about the invalid value,
  - explicit about allowed values,
  - and shown before the loop begins execution.
- [x] Changes must integrate with existing logging utilities and process-exit patterns used in `src/commands/run.ts`.
- [x] Add/update automated tests (Vitest) where patterns exist:
  - Config validation around `reviewMode`.
  - `/run` command argument resolution and validation.

---

## Technical Notes

### Implementation Approach

1. **Config Layer (`src/utils/config.ts`):**
   - Extend `LoopConfig` and `DEFAULT_CONFIG.loop` as described in FR1.
   - If there is a Zod or similar schema for config validation, update it to:
     - Define `reviewMode` as `z.enum(['manual', 'auto']).optional()` within `loop`.
     - Ensure invalid values are rejected at config load time with readable error messages.

2. **CLI Layer (`src/commands/run.ts`):**
   - Extend `RunOptions` with `reviewMode?: 'manual' | 'auto'`.
   - Ensure the CLI parsing (likely Commander or a custom parser) binds `--review-mode` into `RunOptions.reviewMode`.
   - Implement precedence and validation:
     - Compute `reviewMode` from CLI/config/default.
     - Validate strictly; on error, log and exit early.
   - Append `--review-mode` to `feature-loop.sh` arguments within the command execution logic.

3. **Script Template (`src/templates/scripts/feature-loop.sh.tmpl`):**
   - Add `--review-mode` parsing to the command-line processing block.
   - Compute `REVIEW_MODE` using CLI > config > `'manual'`.
   - Optionally validate in shell for robustness.
   - Switch between `PROMPT_review_manual.md` and `PROMPT_review_auto.md` in the review phase.
   - Ensure `$PROMPTS_DIR` and `$CLAUDE_CMD_OPUS` are already part of the script environment and used consistently.

4. **Config Template (`src/templates/config/ralph.config.cjs.tmpl`):**
   - Add `reviewMode` with comment as described.
   - Confirm any generator using this template doesn’t need further updates to accommodate the new field.

5. **Prompts:**
   - Confirm that:
     - `src/templates/prompts/PROMPT_review_manual.md`
     - `src/templates/prompts/PROMPT_review_auto.md`
     exist and clearly reflect the intended behaviors.
   - If either is missing, create it following existing prompt style and structure.

6. **Testing (Vitest):**
   - Add or modify tests for:
     - Config parsing/validation of `reviewMode`.
     - `/run` command:
       - No flag, no config → `manual`.
       - Config only → uses config value.
       - Flag only → uses flag value.
       - Flag + config (conflicting) → uses flag.
       - Invalid values from CLI/config → error and non-zero exit.
   - If there are tests or harnesses around script argument construction, extend them to assert `--review-mode` is included as expected.

### Key Dependencies

- Node-based CLI entry in `bin/ralph.js` → `dist/index.js` → `src/index.ts`.
- Command wiring in `src/commands/run.ts`.
- Config utilities and types in `src/utils/config.ts`.
- Script templates in `src/templates/scripts/feature-loop.sh.tmpl`.
- Config templates in `src/templates/config/ralph.config.cjs.tmpl`.
- Prompt templates in `src/templates/prompts/`.
- Testing framework: Vitest.

### Database Changes

- None. This feature is configuration- and script-level only.

---

## Acceptance Criteria (Consolidated, Testable)

- [x] `LoopConfig` and `DEFAULT_CONFIG.loop` define `reviewMode: 'manual' | 'auto'` with default `'manual'`.
- [x] Running `/run` with:
  - no `ralph.config.cjs`, and
  - no `--review-mode`
  results in manual mode (manual prompt, no auto-merge behavior).
- [x] With `ralph.config.cjs` containing:

  ```js
  module.exports = {
    loop: {
      reviewMode: 'auto',
      // other loop settings…
    },
  };
  ```

  running `/run` (no flag) results in:
  - `feature-loop.sh` being invoked with `--review-mode auto`, and
  - the auto review + merge prompt being used.

- [x] With `ralph.config.cjs` containing `loop.reviewMode = 'manual'`, running `/run --review-mode auto` results in:
  - `feature-loop.sh` invoked with `--review-mode auto`,
  - the auto prompt `PROMPT_review_auto.md` being used for review.

- [x] With `ralph.config.cjs` containing `loop.reviewMode = 'foo'`:
  - `/run` exits non-zero.
  - Standard error includes a message like:
    - `Invalid reviewMode 'foo'. Allowed values are 'manual' or 'auto'.`
  - The loop script is not started.

- [x] `/run --review-mode foo` (with valid or no config) exits non-zero with the same invalid-value message, and does not start the loop.

- [x] `feature-loop.sh` when invoked directly:
  - `./feature-loop.sh --review-mode manual` uses `PROMPT_review_manual.md`.
  - `./feature-loop.sh --review-mode auto` uses `PROMPT_review_auto.md`.
  - `./feature-loop.sh` (no flag) with config `reviewMode: 'auto'` uses `PROMPT_review_auto.md`.
  - `./feature-loop.sh` (no flag) with no `reviewMode` in config uses `PROMPT_review_manual.md`.

- [x] Newly generated `ralph.config.cjs` includes `reviewMode: 'manual'` with a comment explaining:
  - `'manual' = stop at PR; user reviews and merges manually`
  - `'auto' = review + auto-merge`.

- [x] All existing tests pass, and new tests covering the scenarios above pass with Vitest.

---

## Out of Scope

- Adding new review modes or aliases (e.g., `on/off`, `pr-only`, `merge`).
- Introducing additional safety checks or branch protection-awareness for auto-merge.
- Modifying how PRs are created, what branches are used, or the merge strategy itself.
- Changing logging formats or adding new summary steps beyond what is required to select the appropriate prompt.