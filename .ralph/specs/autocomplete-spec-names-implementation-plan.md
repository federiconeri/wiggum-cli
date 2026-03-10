# autocomplete-spec-names Implementation Plan

**Spec:** .ralph/specs/autocomplete-spec-names.md
**Branch:** feat/autocomplete-spec-names
**Status:** Completed

## Architecture Overview

The feature adds spec-name autocomplete to the `/run` command. When the user types `/run ` (with trailing space), the `CommandDropdown` switches from showing slash commands to showing spec filenames from the configured specs directory. The flow:

1. **Spec discovery** — a new `listSpecNames()` utility reads `config.paths.specs`, filters `.md` files, strips extensions.
2. **Session cache** — spec names are loaded once at startup (and after `/init` or `/sync`) and stored in `SessionState`.
3. **ChatInput state machine** — detect `/run ` prefix → switch to "argument autocomplete" mode, passing spec names + typed-argument filter to `CommandDropdown`.
4. **CommandDropdown reuse** — the existing dropdown renders spec suggestions the same way it renders commands, using the same arrow-key navigation and Enter-to-select.
5. **Fuzzy matching** — a small `fuzzyMatch()` helper replaces the current `includes()` filter for both commands and spec suggestions.

## Tasks

### Phase 1: Spec Discovery Utility
- [x] Create `src/utils/spec-names.ts` with `listSpecNames(specsDir: string): Promise<string[]>` — reads top-level `.md` files, strips extensions, returns sorted names. Uses `fs/promises.readdir` with `withFileTypes: true` to exclude directories. - [complexity: S] (e65a77b)

### Phase 2: Fuzzy Matching Utility
- [x] Create `src/utils/fuzzy-match.ts` with `fuzzyMatch(query: string, target: string): boolean` — returns true if all query characters appear in order in target (case-insensitive). Simple sequential char scan, no scoring. - [complexity: S] (e65a77b)

### Phase 3: Session State Cache
- [x] Add `specNames?: string[]` field to `SessionState` interface in `src/repl/session-state.ts` - [complexity: S] (e65a77b)
- [x] Load spec names during app startup in `src/index.ts` (after config load) and pass into `createSessionState()` - [complexity: S] (e65a77b)
- [x] Refresh `specNames` after `/init` completes (in `handleInitComplete` in `app.tsx`) - [complexity: S] (e65a77b)

### Phase 4: ChatInput + CommandDropdown Integration
- [x] Update `CommandDropdown` to switch filtering from `includes()` to `fuzzyMatch()`. - [complexity: M] (e65a77b)
- [x] Update `ChatInput` to detect `/run ` (command + space) state. When in this state: extract the text after `/run ` as the argument filter, compute spec suggestions from a new `specSuggestions?: Command[]` prop, show `CommandDropdown` with spec items instead of command items. On selection, insert the spec name into the input (producing `/run spec-name`). - [complexity: M] (e65a77b)
- [x] Thread `specNames` from `SessionState` through `MainShell` → `ChatInput` as `specSuggestions` prop. Convert `string[]` → `Command[]` (name=specName, description=''). - [complexity: S] (e65a77b)

### Phase 5: Tests

#### Unit Tests
- [x] Write tests for `listSpecNames()` — happy path (mixed files/dirs), empty dir, non-existent dir, filters non-.md files - [complexity: S] (e65a77b)
- [x] Write tests for `fuzzyMatch()` — exact match, partial match, case-insensitive, no match, empty query, special chars - [complexity: S] (e65a77b)
- [x] Write tests for `CommandDropdown` with fuzzy matching — verify fuzzy filter works for both commands and spec items - [complexity: S] (e65a77b)
- [x] Write tests for `ChatInput` spec autocomplete — typing `/run ` shows spec dropdown, typing filter narrows results, no dropdown for `/run` without space, no dropdown for other commands with space - [complexity: M] (e65a77b)

#### Integration Tests
- [x] Write integration test in `MainShell` context — verify spec names flow from session state through to visible dropdown when typing `/run ` - [complexity: M] (3afe96d)

### Phase 6: Polish
- [x] Verify that empty specs directory shows no suggestions and no errors - covered by `specSuggestions.length === 0` guard and `listSpecNames` returning `[]` (e65a77b)
- [x] Verify keyboard navigation (arrow keys + Enter) works correctly in spec dropdown — added tests to `CommandDropdown.test.tsx` exercising down/up arrows and Enter to select, Escape to cancel - [complexity: S] (3afe96d)
- [x] Ensure dropdown disappears when user backspaces past the space in `/run ` — `updateValue` re-evaluates `isRunArgModeNext` on every keystroke (e65a77b)

## Key Design Decisions

1. **Reuse `CommandDropdown`** rather than creating a new component. Spec suggestions use the same `Command` shape (name=specName, description=empty string) and the same rendering/navigation logic.

2. **Fuzzy match replaces `includes`** for both command filtering and spec filtering, keeping behavior consistent.

3. **ChatInput owns the state machine** for detecting `/run ` vs other states. The dropdown component is stateless regarding *what* it's showing.

4. **Cache in SessionState** (not in a React context or global) — consistent with existing patterns. Refreshed on init/sync only, not on every keystroke.

5. **`specSuggestions` prop on ChatInput** rather than making ChatInput aware of SessionState — keeps the component pure and testable.

## Files Modified

| File | Change |
|------|--------|
| `src/utils/spec-names.ts` | **New** — `listSpecNames()` |
| `src/utils/fuzzy-match.ts` | **New** — `fuzzyMatch()` |
| `src/repl/session-state.ts` | Add `specNames` field |
| `src/index.ts` | Load spec names at startup |
| `src/tui/app.tsx` | Refresh spec names after init/sync |
| `src/tui/components/CommandDropdown.tsx` | Switch to fuzzy filtering |
| `src/tui/components/ChatInput.tsx` | Detect `/run ` state, show spec dropdown |
| `src/tui/screens/MainShell.tsx` | Pass `specSuggestions` to ChatInput |
| `src/utils/spec-names.test.ts` | **New** — tests |
| `src/utils/fuzzy-match.test.ts` | **New** — tests |
| `src/tui/components/CommandDropdown.test.tsx` | **New** — fuzzy filter tests |
| `src/tui/components/ChatInput.test.tsx` | Add spec autocomplete tests |

## Done
