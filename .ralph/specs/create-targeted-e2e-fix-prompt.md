# Create Targeted E2E Fix Prompt Feature Specification

**Status:** Completed
**Version:** 1.0  
**Last Updated:** 2026-03-10

## Purpose
Introduce a focused E2E remediation prompt flow that avoids using the full implementation `PROMPT.md` when only E2E tests fail, reducing token usage and runtime while preserving existing loop behavior and compatibility with current phases.

## User Stories
- As a developer running feature loops, I want E2E fix iterations to use a targeted prompt so that remediation is faster and cheaper.
- As a maintainer, I want the E2E fix flow to preserve current success/failure behavior so that CI and local automation remain stable.
- As an engineer debugging failed scenarios, I want the prompt to reference exact E2E failures from the implementation plan so that fixes are precise and verifiable.
- As a project owner, I want minimal changes to existing loop orchestration so that rollout risk is low.

## Requirements

### Functional Requirements
- [ ] Add a new template file at `src/templates/prompts/PROMPT_e2e_fix.md.tmpl`.
  - **Acceptance criteria:** File exists, is included in template copy/build output, and can be resolved by existing prompt rendering logic.
- [ ] The new prompt must focus only on E2E remediation context.
  - **Acceptance criteria:** Prompt instructs agent to:
    1) read `.ralph/specs/$FEATURE-implementation-plan.md` for E2E failures,  
    2) read `.ralph/specs/$FEATURE.md` for behavioral constraints (lightweight guardrail),  
    3) fix scenarios marked `- [ ] E2E: ... - FAILED`,  
    4) run relevant E2E validation command.
- [ ] Update `src/templates/scripts/feature-loop.sh.tmpl` (current fallback region around the existing E2E-fix loop path) to use `PROMPT_e2e_fix.md` instead of `PROMPT.md` when entering E2E remediation iterations.
  - **Acceptance criteria:** In E2E-fix phase, generated agent prompt path resolves to `PROMPT_e2e_fix.md`; `PROMPT.md` is no longer used for this branch.
- [ ] Keep all non-E2E loop branches unchanged.
  - **Acceptance criteria:** Normal implementation, planning, and non-E2E repair phases still reference their existing prompts and commands.
- [ ] Preserve current retry/loop semantics for E2E fixes.
  - **Acceptance criteria:** Attempt counters, loop limits, logging messages, and exit behavior remain functionally equivalent except for prompt file used.
- [ ] Ensure E2E validation command remains the existing configured command (`{{testCommand}}`) scoped to app dir (`cd {{appDir}}`).
  - **Acceptance criteria:** New prompt validation block runs `cd {{appDir}} && {{testCommand}}` (or existing equivalent in templating style).

### Non-Functional Requirements
- [ ] Reduce unnecessary prompt context to decrease token usage and runtime.
  - **Acceptance criteria:** New prompt does not instruct reading broad guide files (e.g., PERFORMANCE/SECURITY/FRONTEND guides) unless already required by E2E-specific behavior.
- [ ] Maintain backward compatibility with existing generated script structure.
  - **Acceptance criteria:** No breaking change to expected environment variables, file paths, or phase transitions.
- [ ] Keep implementation minimal and auditable.
  - **Acceptance criteria:** Changes are limited to the new prompt template and targeted script reference updates (plus any required tests/fixtures).

## Technical Notes
- **Implementation approach**
  - Create `PROMPT_e2e_fix.md.tmpl` under `src/templates/prompts/`.
  - Model prompt content after existing prompt templating conventions (`$FEATURE`, `{{appDir}}`, `{{testCommand}}` placeholders).
  - Modify E2E fix fallback callsite in `src/templates/scripts/feature-loop.sh.tmpl` (not global prompt selection) so only E2E remediation branch changes.
  - Ensure template copy step includes the new file (project already copies `src/templates` assets to `dist` during build).
- **Key dependencies/patterns**
  - CLI orchestration is template-driven shell flow; minimal TS code changes expected.
  - Existing dual-mode behavior (interactive/headless) should be unaffected because change is in feature-loop script template content.
- **Testing notes**
  - Add/adjust unit or integration tests that assert generated script references `PROMPT_e2e_fix.md` in E2E failure branch.
  - If e2e fixture snapshots exist for templates, update snapshots accordingly.
- **No database changes** required.

## Acceptance Criteria
- [ ] `src/templates/prompts/PROMPT_e2e_fix.md.tmpl` is added with targeted E2E remediation instructions.
- [ ] `feature-loop.sh.tmpl` E2E failure remediation branch uses `PROMPT_e2e_fix.md` instead of `PROMPT.md`.
- [ ] Generated loop script still executes the same E2E retry counts and branch transitions as before.
- [ ] Prompt content explicitly references:
  - `.ralph/specs/$FEATURE-implementation-plan.md` (failure details)
  - `.ralph/specs/$FEATURE.md` (behavioral guardrails)
- [ ] Prompt validation step runs only E2E-relevant command: `cd {{appDir}} && {{testCommand}}`.
- [ ] No references in the new E2E fix prompt to broad implementation guide-reading requirements unless E2E-specific.
- [ ] Build succeeds (`npm run build`) with new template included in `dist`.
- [ ] Tests/type checks pass for touched areas (`npm run typecheck`, `npm run test`).

## Out of Scope
- Rewriting full prompt architecture or introducing a new prompt engine.
- Changing initial implementation prompt behavior (`PROMPT.md`) outside E2E-fix branch.
- Altering model/provider selection or loop concurrency behavior.
- Adding new lint/type/build validation requirements specifically for E2E fix iterations.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #140
Create targeted E2E fix prompt instead of using full PROMPT.md

### Relevant Files
- `src/templates/scripts/feature-loop.sh.tmpl`
- `src/templates/prompts/` (existing prompt templates)
- `src/templates/prompts/PROMPT_e2e_fix.md.tmpl` (new)