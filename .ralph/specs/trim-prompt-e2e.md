# trim-prompt-e2e Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-03-10

## Purpose
Reduce token overhead in `src/templates/prompts/PROMPT_e2e.md.tmpl` by removing redundant reference material Claude already knows, while preserving all required E2E workflow behavior, constraints, and output/reporting expectations.

## User Stories
- As a maintainer, I want `PROMPT_e2e.md.tmpl` to be shorter so that prompt token usage and execution overhead are reduced.
- As an engineer running E2E flows, I want required behavior and constraints to remain explicit so that automation reliability is not degraded.
- As a contributor, I want the template to keep only essential operational guidance so that prompt content is easier to read and maintain.
- As a team lead, I want removals to be intentional and verifiable so that no critical instructions are accidentally lost.

## Requirements

### Functional Requirements
- [x] **Scope-limited template update**
  - Update only `src/templates/prompts/PROMPT_e2e.md.tmpl` for this feature.
  - Do not change command routing, runtime code paths, or template loading logic.

- [x] **Remove Playwright MCP Tool Reference section**
  - Delete the reference table section describing Playwright MCP tools.
  - Preserve any non-redundant behavioral constraints elsewhere in the template.

- [x] **Remove Assertion Patterns section**
  - Delete the section that lists standard assertion examples/patterns.
  - Ensure no mandatory project-specific assertion requirement is lost.

- [x] **Remove Browser State Management section**
  - Delete section describing obvious browser/session behavior.
  - Keep any required project-specific reset/isolation instruction if present outside that section.

- [x] **Remove Troubleshooting section**
  - Delete troubleshooting/debugging tips that are generic and non-essential.
  - Preserve mandatory failure-reporting/output requirements.

- [x] **Condense TUI Interaction Cheatsheet**
  - Replace verbose TUI interaction content with a concise (3–4 command) cheatsheet covering:
    - Open app/page
    - Read/inspect current screen/state
    - Type/interact with input
    - Close/finish flow
  - Keep it action-oriented and implementation-agnostic.

- [x] **Condense Learning Capture instruction**
  - Replace existing learning-capture verbosity with a concise directive:
    - “If useful E2E patterns found, append to @.ralph/LEARNINGS.md”
  - Keep path and intent explicit.

- [x] **Preserve required behavior and output expectations**
  - Maintain all critical instructions around:
    - E2E task execution expectations
    - Required outputs/reporting format
    - Any required commit/logging/summary behavior already enforced by the template
    - TUI vs non-TUI decision flow where applicable

- [x] **Net size reduction target**
  - Achieve approximately 20% reduction in template length (target ~80 lines removed, tolerance ±15 lines if structure changes).

### Non-Functional Requirements
- [x] **Maintainability**
  - Resulting template must be clearer and less repetitive than current version.
- [x] **Determinism**
  - Remaining instructions must avoid ambiguity that could increase run-to-run behavioral variance.
- [x] **Compatibility**
  - Changes must remain compatible with existing prompt/template build pipeline and asset copying steps.
- [x] **Quality gates**
  - Repository must still pass `npm run build`, `npm run typecheck`, and relevant tests if run by CI.

## Technical Notes
- **Implementation approach**
  - Perform a focused edit to `src/templates/prompts/PROMPT_e2e.md.tmpl`.
  - Remove identified sections by header/blocks rather than line-number hard-coding.
  - Reword condensed sections to preserve imperative language and expected agent behavior.
  - Verify that required branches/instructions (including TUI/non-TUI handling and required report outputs) remain present and coherent after trimming.

- **Key dependencies**
  - No new runtime dependencies.
  - Template is consumed by existing CLI/TUI flows through current template distribution process.

- **Build/package context**
  - Project uses TypeScript, npm scripts, and template asset copying in build pipeline.
  - Prompt template location: `src/templates/prompts/`.

- **Testing/verification approach**
  - Content-level verification (manual or snapshot/text checks) that removed sections are absent and required directives remain.
  - Optional: add/update tests only if a template-content test harness already exists; otherwise validate via deterministic checklist in PR description.

- **Database changes**
  - None.

## Acceptance Criteria
- [x] `src/templates/prompts/PROMPT_e2e.md.tmpl` no longer contains:
  - [x] Playwright MCP Tool Reference table section
  - [x] Assertion Patterns section
  - [x] Browser State Management section
  - [x] Troubleshooting section
- [x] TUI cheatsheet is reduced to 3–4 key command instructions (open/read/type/close semantics).
- [x] Learning capture instruction is condensed to a single concise directive to append useful patterns to `@.ralph/LEARNINGS.md`.
- [x] All critical E2E behavior constraints and output expectations that existed before trimming are still present.
- [x] Template remains structurally valid and included in normal build artifacts.
- [x] Net reduction is approximately 20% of original size (391 lines baseline; expected near ~310 lines, acceptable range ~295–325). Final: 309 lines (21.0% reduction).
- [x] No regressions introduced in build/typecheck/test workflows attributable to this change.

## Out of Scope
- Modifying other prompt templates beyond `PROMPT_e2e.md.tmpl`.
- Refactoring CLI command handlers, TUI runtime logic, scanner behavior, or AI provider integrations.
- Changing E2E framework/tooling choices.
- Introducing new automation features unrelated to prompt-size reduction.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #141
# Trim PROMPT_e2e.md.tmpl — remove reference material Claude already knows

## Problem

`PROMPT_e2e.md.tmpl` is 391 lines. It includes reference material that Claude Code already knows natively:

- Playwright MCP Tool Reference table (lines 286-300, ~15 lines)
- Assertion Patterns section (lines 301-327, ~27 lines)
- Browser State Management section (lines 329-333, ~5 lines)
- Troubleshooting section (lines 362-374, ~13 lines)
- Verbose TUI Interaction Cheatsheet (lines 96-117, ~22 lines)

## Solution

Remove ~80 lines of reference material:
- **Delete** Playwright MCP Tool Reference table — Claude knows its available MCP tools
- **Delete** Assertion Patterns section — standard Playwright patterns
- **Delete** Browser State Management section — obvious browser behavior
- **Delete** Troubleshooting section — standard debugging Claude can figure out
- **Condense** TUI Interaction Cheatsheet to 3-4 key commands (open, read screen, type, close)
- **Condense** Learning Capture to: "If useful E2E patterns found, append to @.ralph/LEARNINGS.md"

## Files

- `src/templates/prompts/PROMPT_e2e.md.tmpl`

## Estimated Reduction

~80 lines removed, ~20% smaller prompt