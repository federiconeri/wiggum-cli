# Autocomplete Spec Names Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-17

## Purpose
Enable `/run` command autocomplete to list existing spec files from the configured specs directory after the user types a space, reducing manual typing and errors.

## User Stories
- As a user, I want `/run ` to suggest existing spec filenames so that I can quickly select a spec to run.
- As a user, I want the suggestions to filter as I type so that I can find the right spec quickly.

## Requirements

### Functional Requirements
- [x] When the user types `/run ` (command followed by a space), show a dropdown list of available specs from `config.paths.specs` (default `.ralph/specs`).
- [x] Suggestions must include **only top-level** spec files in the specs directory (no nested subfolders).
- [x] Each suggestion must display the filename **without** the `.md` extension.
- [x] Typing after `/run ` must filter suggestions using **fuzzy matching**.
- [x] Users must be able to navigate the suggestion list with arrow keys and select a spec with Enter.
- [x] If no spec files exist, show an empty list (no errors) and allow manual input.
- [x] Suggestions must update dynamically as the user types additional characters after `/run `.

### Non-Functional Requirements
- [x] Autocomplete remains responsive with up to 500 spec files.
- [x] File system reads must not block UI rendering; cache results per session where feasible.
- [x] Works consistently on macOS, Linux, and Windows.

## Technical Notes
- **UI integration:** Update `src/tui/components/ChatInput.tsx` and `src/tui/components/CommandDropdown.tsx` to:
  - Detect `/run ` input state (command + space).
  - Switch dropdown content from command suggestions to spec suggestions.
- **Spec discovery:** Read from `config.paths.specs` (see `src/utils/config.ts`, default `.ralph/specs`).
  - Use `fs/promises.readdir` (or existing FS utilities) and filter files with `.md` extension.
  - Exclude directories and nested paths (top-level only).
  - Strip `.md` extension for display and insertion.
- **Filtering:** Implement fuzzy matching for suggestions.
  - Reuse an existing fuzzy matcher if present, otherwise introduce a small helper in `src/utils`.
- **State/caching:** Cache the spec list in session state (e.g., `src/repl/session-state`) to avoid repeated disk reads during a session.
  - No live watching required in v1; list refreshes on app start.

## Acceptance Criteria
- [x] Typing `/run ` shows a dropdown with all top-level spec names from `config.paths.specs`.
- [x] Suggestions display filenames without the `.md` extension.
- [x] Typing after `/run ` filters results via fuzzy match (e.g., `authsys` matches `auth-system`).
- [x] Arrow keys navigate suggestions; Enter inserts the highlighted spec name.
- [x] No suggestions appear before the space or for non-`/run` commands.
- [x] Empty specs directory results in no suggestions and no errors.

## Out of Scope
- Nested folder support for specs.
- Descriptions or metadata extraction from spec files.
- Live filesystem watching or refresh during runtime.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents
- Inline context: `/run` autocomplete enhancement with spec list from `.ralph/specs` (related to PR #19).