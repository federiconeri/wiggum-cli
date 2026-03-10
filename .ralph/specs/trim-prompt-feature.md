# trim-prompt-feature Feature Specification

**Status:** Completed
**Version:** 1.0  
**Last Updated:** 2026-03-10

## Purpose
Reduce token overhead in `PROMPT_feature.md.tmpl` by removing verbose example/reference content while preserving essential instructions, constraints, and output contract needed for reliable feature implementation prompts.

## User Stories
- As a maintainer, I want `PROMPT_feature.md.tmpl` to be shorter so that prompt execution uses fewer tokens and is faster/cheaper.
- As an AI-driven workflow user, I want the implementation plan format requirements preserved so that task tracking and automation continue to work.
- As a contributor, I want concise but explicit instructions in the prompt template so that generated plans remain consistent and actionable.
- As a CI/review owner, I want deterministic output expectations (checkbox format, phase structure, E2E format) so that downstream tooling remains stable.

## Requirements

### Functional Requirements
- [x] Update `src/templates/prompts/PROMPT_feature.md.tmpl` to remove the long (~80-line) worked Implementation Plan example.
  - **Acceptance criteria:** The previous example section (historically lines 17–97) is replaced with a concise instruction block (roughly ~10 lines) describing required structure rather than showing full sample content.
- [x] Preserve an explicit “Implementation Plan Format” section in the template.
  - **Acceptance criteria:** Section includes:
    - creation target path (`@.ralph/specs/$FEATURE-implementation-plan.md`)
    - required header fields (feature name, spec path, branch, status)
    - phase-based organization (Setup, Core, Tests, Polish, E2E)
    - complexity tags `[S]`, `[M]`, `[L]`
- [x] Preserve and emphasize checkbox task syntax contract.
  - **Acceptance criteria:** Template contains explicit, unambiguous instruction that each task must use `- [ ] Task description` format and that this is critical for progress tracking.
- [x] Preserve E2E scenario task contract in concise form.
  - **Acceptance criteria:** Template includes required E2E task prefix pattern `- [ ] E2E: Scenario name` and minimal required fields (URL, steps, verify).
- [x] Condense the “CRITICAL CONSTRAINT” content from verbose wording to concise wording without losing behavioral intent.
  - **Acceptance criteria:** Constraint section is reduced substantially (target: ~3 lines equivalent) while still clearly communicating non-negotiable constraints.
- [x] Remove explicit MCP references from this template.
  - **Acceptance criteria:** No hardcoded references that require specific MCP naming/instructions remain; wording allows tool discovery implicitly.
- [x] Keep all other required output contract instructions intact.
  - **Acceptance criteria:** No regression in required output file location, planning phases, task tracking format, or E2E checklist style.

### Non-Functional Requirements
- [x] Token-efficiency improvement is measurable at template level.
  - **Acceptance criteria:** Net reduction is approximately aligned with issue intent (target ~70 lines removed and ~58% smaller, with reasonable variance if wording shifts).
- [x] Maintain prompt clarity/readability.
  - **Acceptance criteria:** Template remains understandable to new contributors with concise imperative bullets and no ambiguous required-format language.
- [x] Backward compatibility with downstream automation.
  - **Acceptance criteria:** Existing logic that counts `- [ ]` tasks and recognizes E2E checklist lines continues to work unchanged.
- [x] No runtime performance or security regression.
  - **Acceptance criteria:** Change is limited to template content; no executable logic, dependency, or permission surface changes introduced.

## Technical Notes
- Scope is content-only, focused on:
  - `src/templates/prompts/PROMPT_feature.md.tmpl`
- Implementation approach:
  - Replace verbose markdown example with compact specification bullets.
  - Keep critical contracts as MUST-style language (checkbox syntax, E2E format, phase structure).
  - Remove tool-specific references (MCP naming) while preserving capability expectations.
- Validation approach:
  - Diff-based review to confirm removed sections and retained contracts.
  - Grep/check for required literal patterns:
    - `- [ ]`
    - `- [ ] E2E:`
    - `@.ralph/specs/$FEATURE-implementation-plan.md`
    - phase names and complexity tags.
- Build/test considerations:
  - Since templates are copied during build, run `npm run build` to ensure packaging still succeeds.
  - Optional smoke validation by generating a feature prompt and checking produced implementation-plan shape.
- Dependencies:
  - No new dependencies.
  - No schema/database changes.

## Acceptance Criteria
- [x] `PROMPT_feature.md.tmpl` no longer contains the long worked Implementation Plan example; it contains concise structural instructions instead.
- [x] The template explicitly requires `- [ ] Task description` checkbox syntax for every task.
- [x] The template explicitly defines E2E task pattern `- [ ] E2E: Scenario name` plus URL/steps/verify fields.
- [x] Required phase organization (Setup, Core, Tests, Polish, E2E) is present.
- [x] Complexity markers `[S]`, `[M]`, `[L]` are required in tasks.
- [x] CRITICAL CONSTRAINT section is significantly condensed while preserving non-negotiable intent.
- [x] Explicit MCP references are removed from this template.
- [x] Approximate size reduction target is achieved (roughly in line with ~70 lines removed / ~58% smaller prompt).
- [x] `npm run build` completes successfully after changes.
- [x] Manual prompt-output smoke check confirms generated implementation plans still follow required checklist contract.

## Out of Scope
- Changes to other prompt templates besides `PROMPT_feature.md.tmpl`.
- Modifying CLI argument parsing, command routing, TUI behavior, or runtime AI provider logic.
- Changing downstream tracker behavior for checkbox parsing.
- Introducing new planning phases, new complexity taxonomy, or different output file naming conventions.
- Broad rewrite of overall product prompting strategy beyond this targeted token-reduction objective.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #142
Trim `PROMPT_feature.md.tmpl` — remove 80-line example format; keep critical checklist/output contract; condense constraints; remove explicit MCP references.