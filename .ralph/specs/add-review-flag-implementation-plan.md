# add-review-flag Implementation Plan

**Spec:** .ralph/specs/add-review-flag.md
**Branch:** feat/add-review-flag
**Status:** Planning

## Tasks

### Phase 1: Config Layer (`src/utils/config.ts`)

- [x] Add `reviewMode` to `LoopConfig` interface and `DEFAULT_CONFIG` - [complexity: S] - DONE (c48f568)
  - Add `reviewMode: 'manual' | 'auto'` to `LoopConfig` (line 55)
  - Add `reviewMode: 'manual'` to `DEFAULT_CONFIG.loop` (line 107)
  - Update `getLoopSettings()` (line 213) to include `reviewMode`

### Phase 2: CLI Command Layer (`src/commands/run.ts`)

- [x] Add `reviewMode` to `RunOptions` and wire through to script args - [complexity: M] - DONE
  - Add `reviewMode?: 'manual' | 'auto'` to `RunOptions` (line 17)
  - Compute resolved `reviewMode`: CLI flag (`options.reviewMode`) > config (`config.loop.reviewMode`) > `'manual'`
  - Validate: reject values not in `['manual', 'auto']` with `logger.error()` + `process.exit(1)` before spawning script
  - Append `--review-mode <value>` to `args` array (after line 150)
  - Add `Review Mode: ${reviewMode}` to the configuration display block (after line 160)

### Phase 3: TUI Run Screen (`src/tui/screens/RunScreen.tsx`)

- [x] Pass `--review-mode` from config to feature-loop.sh in RunScreen - [complexity: S] - DONE
  - In `startLoop()` (line 230), after building `args` array, resolve `reviewMode` from `config.loop.reviewMode ?? 'manual'`
  - Append `'--review-mode', reviewMode` to the `args` array

### Phase 4: Shell Script (`src/templates/scripts/feature-loop.sh.tmpl`)

- [x] Add `--review-mode` argument parsing to feature-loop.sh.tmpl - [complexity: M] - DONE (6e56336)
  - Add `REVIEW_MODE=""` variable init alongside `USE_WORKTREE`, `RESUME`, `MODEL` (line 49)
  - Add `--review-mode)` case to the while loop (line 53): `REVIEW_MODE="$2"; shift 2`
  - After arg parsing, resolve default from config: `REVIEW_MODE_DEFAULT=$(node -e "..." 2>/dev/null || echo "manual")` and `REVIEW_MODE="${REVIEW_MODE:-$REVIEW_MODE_DEFAULT}"`
  - Add shell-side validation: reject values other than `manual` or `auto` with `exit 1`
  - Add `Review mode: $REVIEW_MODE` to the startup echo block (line 140)

- [x] Make Phase 7 (PR & Review) conditional on `REVIEW_MODE` - [complexity: M] - DONE (6e56336)
  - Replace the single `PROMPT_review.md` invocation (line 251) with an if/else:
    - `manual` → use `PROMPT_review_manual.md`
    - `auto` → use `PROMPT_review_auto.md`

### Phase 5: Prompt Templates

- [x] Create `PROMPT_review_manual.md.tmpl` - manual review prompt - [complexity: M] - DONE
  - Derived from existing `PROMPT_review.md.tmpl` (168 lines)
  - Steps: verify ready state, check git status, create PR, **stop** (no automated review, no auto-merge)
  - Remove Step 4 (Codex review), Step 5 (rebase), Step 6 (merge), Step 7 (post-merge cleanup)
  - Final instruction: "PR created. Review and merge manually."

- [x] Create `PROMPT_review_auto.md.tmpl` - auto review prompt - [complexity: S] - DONE
  - Rename/copy existing `PROMPT_review.md.tmpl` as-is (it already does full review + merge)
  - Keep all 7 steps intact (verify, git status, create PR, Codex review, rebase, merge, cleanup)

- [x] Remove or deprecate `PROMPT_review.md.tmpl` - [complexity: S] - DONE
  - Delete the original `PROMPT_review.md.tmpl` since it's replaced by `_manual` and `_auto` variants
  - Verify no other code references `PROMPT_review.md` (only the shell template does)
  - Updated references in `loop-status.ts`, `monitor.ts`, `ralph-monitor.sh.tmpl`, and `README.md.tmpl`

### Phase 6: Config Template (`src/templates/config/ralph.config.cjs.tmpl`)

- [x] Add `reviewMode` to config template - [complexity: S] - DONE (5db5112)
  - Add `reviewMode: 'manual', // 'manual' = stop at PR, 'auto' = review + auto-merge` to the loop section (after line 36)

### Phase 7: Generator/Writer Updates

- [x] Ensure generator copies new prompt template files - [complexity: S] - DONE (verified)
  - Verified `src/generator/templates.ts` `discoverTemplates()` function automatically scans and discovers all `.tmpl` files recursively
  - Verified `npm run build` copies all templates including new `PROMPT_review_manual.md.tmpl` and `PROMPT_review_auto.md.tmpl` to dist/
  - Confirmed old `PROMPT_review.md.tmpl` was removed in Phase 5

### Phase 8: Tests

- [x] Write tests for config `reviewMode` validation (`src/utils/config.test.ts`) - [complexity: M] - DONE (c48f568)
  - Test `LoopConfig` includes `reviewMode` field ✓
  - Test `DEFAULT_CONFIG.loop.reviewMode` equals `'manual'` ✓
  - Test `loadConfigWithDefaults()` merges user-provided `reviewMode: 'auto'` correctly ✓
  - Test `loadConfigWithDefaults()` falls back to `'manual'` when `reviewMode` is absent from user config ✓
  - Test `getLoopSettings()` returns correct `reviewMode` ✓

- [x] Write tests for run command `reviewMode` resolution (`src/commands/run.test.ts`) - [complexity: M] - DONE (493961c)
  - Test: no flag + no config → resolves to `'manual'` ✓
  - Test: config `'auto'` + no flag → resolves to `'auto'` ✓
  - Test: flag `'auto'` + config `'manual'` → resolves to `'auto'` (flag wins) ✓
  - Test: flag `'manual'` + config `'auto'` → resolves to `'manual'` (flag wins) ✓
  - Test: invalid flag `'foo'` → error + exit before script spawn ✓
  - Test: invalid config `'foo'` + no flag → error + exit before script spawn ✓
  - Test: `--review-mode` arg is included in spawned script args ✓
  - Test: case-sensitive validation (rejects 'AUTO', 'Manual') ✓

## Notes

- The TUI's `/run` command (via `MainShell.tsx`) doesn't currently pass options like `--review-mode` through `screenProps`. For Phase 3, we only need to pass the config-derived value since TUI users don't have a CLI flag mechanism. Future work could add a TUI prompt for review mode selection.
- The existing `PROMPT_review.md.tmpl` performs the full auto workflow (create PR → Codex review → merge). The new `manual` prompt should be a subset that stops after PR creation.
- Template file discovery should be checked — if it's glob-based, no changes needed; if it's an explicit list, update it.

## Done

### Phase 1: Config Layer - c48f568
- Added `reviewMode: 'manual' | 'auto'` to `LoopConfig` interface
- Set `reviewMode: 'manual'` as default in `DEFAULT_CONFIG.loop`
- Updated `getLoopSettings()` to include reviewMode
- Created comprehensive test suite in `src/utils/config.test.ts` (12 tests)
- All tests passing, TypeScript compilation successful

### Phase 2: CLI Command Layer - 493961c
- Added `reviewMode?: 'manual' | 'auto'` to `RunOptions` interface
- Implemented precedence logic: CLI flag > config > 'manual' default
- Added strict validation rejecting invalid values (case-sensitive)
- Appended `--review-mode <value>` to script args array
- Added "Review Mode" to configuration display output
- Created comprehensive test suite in `src/commands/run.test.ts` (6 tests)
  - Tests validation of invalid values from CLI and config
  - Tests case-sensitivity (AUTO, Manual rejected)
  - Tests precedence (CLI flag overrides config)
  - Tests default fallback to 'manual'
- All 299 tests passing, TypeScript compilation successful, build successful

### Phase 3: TUI Run Screen - e266107
- Resolved reviewMode from config.loop.reviewMode with 'manual' fallback
- Appended '--review-mode' flag to script args array
- All 299 tests passing, TypeScript compilation successful, build successful

### Phase 4: Shell Script - 6e56336
- Added `REVIEW_MODE=""` variable initialization
- Added `--review-mode` argument parsing to while loop
- Implemented config-based default resolution with fallback to 'manual'
- Added shell-side validation rejecting values other than 'manual' or 'auto'
- Added "Review mode: $REVIEW_MODE" to startup echo block
- Updated usage comment to document `--review-mode MODE` option
- Made Phase 7 conditional: manual → PROMPT_review_manual.md, auto → PROMPT_review_auto.md
- All 299 tests passing, TypeScript compilation successful, build successful

### Phase 5: Prompt Templates - d707afa
- Created `PROMPT_review_manual.md.tmpl` with 3 steps (verify, git status, create PR)
- Created `PROMPT_review_auto.md.tmpl` with all 7 steps (full auto workflow)
- Deleted original `PROMPT_review.md.tmpl`
- Updated phase detection in `src/tui/utils/loop-status.ts` to check for both manual/auto prompts
- Updated phase detection in `src/commands/monitor.ts` to check for both manual/auto prompts
- Updated phase detection in `src/templates/scripts/ralph-monitor.sh.tmpl` to check for both manual/auto prompts
- Updated documentation in `src/templates/root/README.md.tmpl` to reference new prompt names
- All 299 tests passing, TypeScript compilation successful, build successful

### Phase 6: Config Template - 5db5112
- Added `reviewMode: 'manual'` to `ralph.config.cjs.tmpl` loop section
- Added explanatory comment: `// 'manual' = stop at PR, 'auto' = review + auto-merge`
- All 299 tests passing, TypeScript compilation successful, build successful

### Phase 7: Generator/Writer Updates - verified
- Verified template discovery is automatic via `discoverTemplates()` function in `src/generator/templates.ts`
- Confirmed new prompt templates are copied to dist/ during build
- No code changes required

### Phase 8: Tests - completed in Phases 1 & 2
- Config validation tests created in Phase 1 (c48f568) - 12 tests total
- Run command tests created in Phase 2 (493961c) - 6 tests total
- All 299 tests passing, TypeScript compilation successful, build successful

## Implementation Complete

All phases (1-8) completed successfully:
- ✅ Phase 1: Config Layer (c48f568)
- ✅ Phase 2: CLI Command Layer (493961c)
- ✅ Phase 3: TUI Run Screen (e266107)
- ✅ Phase 4: Shell Script (6e56336)
- ✅ Phase 5: Prompt Templates (d707afa)
- ✅ Phase 6: Config Template (5db5112)
- ✅ Phase 7: Generator/Writer Updates (verified)
- ✅ Phase 8: Tests (completed in Phases 1 & 2)

Total commits: 6
All validations passing: TypeScript compilation, tests (299/299), build
