# update-ai-models Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-16

## Purpose

Update the AI model configuration so that the Wiggum agent and related flows (especially `/init`) use the latest Anthropic, OpenAI, and OpenRouter models. The change must preserve existing UX and alias behavior, and be strictly limited to the updates described in the inline context (changes in `src/ai/providers.ts` and the single comment in `src/templates/scripts/feature-loop.sh.tmpl`).

## User Stories

- As a user running `/init` for Wiggum, I want the model dropdown to show the latest Anthropic, OpenAI, and OpenRouter models so that I can easily select up-to-date, supported models.
- As a user who already has a saved configuration, I want my existing model settings to keep working unchanged so I don't have to reconfigure or migrate when models are updated.
- As a developer, I want all model definitions, defaults, aliases, and reasoning flags to be updated in one place (`src/ai/providers.ts`) so future model refreshes remain simple and consistent.
- As a user of the feature loop scripts, I want the help text examples for `--model` to reference the current, recommended Claude model ID so I don't get confused by outdated examples.

## Requirements

### Functional Requirements

#### 1. Anthropic Models

- [x] **Refresh Anthropic AVAILABLE_MODELS**
  - In `src/ai/providers.ts`, within `AVAILABLE_MODELS.anthropic`, replace the outdated Anthropic model entries with exactly the following:

    ```ts
    AVAILABLE_MODELS.anthropic = [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', hint: 'most capable' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', hint: 'recommended' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', hint: 'fastest' }
      // any other Anthropic models that must remain can stay, but these three must be present
    ];
    ```

- [x] **Update Anthropic default model**
  - In `DEFAULT_MODELS.anthropic`, set the default to the new Sonnet version:

    ```ts
    DEFAULT_MODELS.anthropic = 'claude-sonnet-4-5-20250929';
    ```

- [x] **Update Anthropic aliases**
  - In `ANTHROPIC_MODEL_ALIASES`, update mappings to point to the new Anthropic IDs:

    ```ts
    ANTHROPIC_MODEL_ALIASES = {
      sonnet: 'claude-sonnet-4-5-20250929',
      opus: 'claude-opus-4-6',
      haiku: 'claude-haiku-4-5-20251001',
      // preserve any other existing aliases as-is
    };
    ```

- [x] **Preserve Anthropic UX**
  - The `/init` model dropdown for Anthropic must:
    - Show these three updated models with the exact labels and hints.
    - Still allow selection via friendly aliases (`sonnet`, `opus`, `haiku`) where currently supported in the codebase.
  - No new Anthropic aliases should be introduced; only the target IDs for existing aliases change.

#### 2. OpenAI Models

- [x] **Refresh OpenAI AVAILABLE_MODELS**
  - In `src/ai/providers.ts`, within `AVAILABLE_MODELS.openai`, ensure the following entries exist and are surfaced to the UI (e.g., in `/init`):

    ```ts
    AVAILABLE_MODELS.openai = [
      { value: 'gpt-5.2', label: 'GPT-5.2', hint: 'most capable' },
      { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', hint: 'best for code' },
      { value: 'gpt-5.1', label: 'GPT-5.1', hint: 'previous gen' },
      { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max', hint: 'previous codex' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini', hint: 'fastest' }
      // any other OpenAI models currently present and still valid may remain
    ];
    ```

  - The list order should reflect preference (more capable models first, "fastest"/lighter models later) consistent with current conventions.

- [x] **Update OpenAI default model**
  - In `DEFAULT_MODELS.openai`, set the default to the new flagship model:

    ```ts
    DEFAULT_MODELS.openai = 'gpt-5.2';
    ```

- [x] **Update reasoning-capable models**
  - In the `REASONING_MODELS` (or equivalent reasoning models set/array in `providers.ts`), add the new GPT-5.2 variants:

    ```ts
    REASONING_MODELS = [
      // existing reasoning models ...
      'gpt-5.2',
      'gpt-5.2-codex'
    ];
    ```

  - Any existing reasoning models must remain unless specifically deprecated elsewhere in the project.

- [x] **Preserve OpenAI alias/selection behavior**
  - Do not change the alias mechanism or how users specify OpenAI models today.
  - Users should see the updated OpenAI models in the `/init` dropdown where the provider is OpenAI, with no additional prompts or configuration changes.

#### 3. OpenRouter Models

- [x] **Extend OpenRouter AVAILABLE_MODELS**
  - In `src/ai/providers.ts`, within `AVAILABLE_MODELS.openrouter`, ensure these models are present with the exact value/label/hint triplets:

    ```ts
    AVAILABLE_MODELS.openrouter = [
      // existing OpenRouter models that should remain ...

      { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', hint: 'Google' },
      { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', hint: 'fast' },
      { value: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5', hint: 'Moonshot' },
      { value: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', hint: 'efficient' },
      { value: 'minimax/minimax-m2.1', label: 'MiniMax M2.1', hint: 'MiniMax' },
      { value: 'z-ai/glm-4.7', label: 'GLM 4.7', hint: 'Z-AI' },
      { value: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast', hint: 'xAI' }
    ];
    ```

  - Maintain the existing provider and selection wiring for OpenRouter; only the model set is updated/extended.

- [x] **Preserve OpenRouter UX**
  - The `/init` dropdown for the OpenRouter provider must display these models with the given labels and hints.
  - No changes to alias resolution, provider naming, or routing for OpenRouter requests.

#### 4. Aliases and Existing Configs

- [x] **Alias behavior must remain stable**
  - For all providers:
    - Existing alias names (e.g., `sonnet`, `opus`, `haiku` for Anthropic) must continue to be accepted wherever they are today.
    - Only the *target model IDs* those aliases map to may change as specified above.
  - No new alias syntax or semantics are introduced.

- [x] **Existing configs remain untouched**
  - No code should attempt to:
    - Rewrite existing configuration files.
    - Automatically migrate old full model IDs to new ones.
  - If an existing config points to an older full model ID, the system should continue to attempt to use that ID as-is (subject to upstream provider support).

#### 5. Loop Script Comment Update

- [x] **Update example model ID in feature loop script**
  - In `src/templates/scripts/feature-loop.sh.tmpl`, locate the help comment line for `--model`, currently similar to:

    ```sh
    # --model MODEL Claude model to use (e.g., opus, sonnet, claude-sonnet-4-5-20250514)
    ```

  - Update only the hardcoded full ID in the example to use the new Sonnet ID:

    ```sh
    # --model MODEL Claude model to use (e.g., opus, sonnet, claude-sonnet-4-5-20250929)
    ```

  - Do not change script logic, flags, or alias resolution; only the example text.

#### 6. Scope Constraints

- [x] **Limit changes to inline-context files**
  - Only modify:
    - `src/ai/providers.ts`
    - `src/templates/scripts/feature-loop.sh.tmpl`
  - Do not:
    - Add or modify CLI flags.
    - Change `/init` TUI control flow or layout.
    - Introduce or remove providers.
    - Change how the Wiggum agent is invoked.

### Non-Functional Requirements

- [x] **Backward compatibility**
  - Existing configurations must continue to load without error.
  - Existing behaviors around alias-based model selection must remain unchanged from the user's perspective, aside from the fact that they now resolve to newer model IDs.

- [x] **Performance**
  - Updating model lists must not introduce any noticeable performance regression in `/init` or general CLI startup.
  - The size of the model lists remains small enough that selection UI remains responsive.

- [x] **Maintainability**
  - All model changes remain centralized in `src/ai/providers.ts`:
    - `AVAILABLE_MODELS`
    - `DEFAULT_MODELS`
    - `ANTHROPIC_MODEL_ALIASES`
    - `REASONING_MODELS`
  - Any inline comments or type annotations in this file must be updated if they become inaccurate due to the model changes.

- [x] **Developer clarity**
  - The ordering and hints (`most capable`, `recommended`, `fastest`, etc.) should clearly communicate recommended choices to developers and users.
  - No "dead" entries (models that no longer exist upstream) should remain unless they are intentionally preserved for backward compatibility and documented as such in comments.

## Technical Notes

- **Project structure relevant to this feature**
  - `src/ai/providers.ts`:
    - Defines the `AVAILABLE_MODELS` per provider (Anthropic, OpenAI, OpenRouter).
    - Holds `DEFAULT_MODELS` per provider.
    - Contains alias maps such as `ANTHROPIC_MODEL_ALIASES`.
    - Contains `REASONING_MODELS` or equivalent data structure marking models as reasoning-capable.
    - Is used by the TUI/CLI flows (e.g., `/init`) and Wiggum agent to populate dropdowns and drive model selection.
  - `src/templates/scripts/feature-loop.sh.tmpl`:
    - Template for feature loop helper script.
    - Its comments provide user-facing help text that currently references an outdated Claude model ID.
    - Script logic relies on Anthropic aliases (`sonnet`, `opus`), which are resolved at runtime via `ANTHROPIC_MODEL_ALIASES`.

- **Implementation approach**
  1. **Update `src/ai/providers.ts`:**
     - Locate `AVAILABLE_MODELS` and ensure there are keys for `anthropic`, `openai`, and `openrouter`.
     - Replace Anthropic entries with the new three models and hints; verify they are used in the UI (e.g., via search for `AVAILABLE_MODELS.anthropic` usage).
     - Update `DEFAULT_MODELS.anthropic` and `ANTHROPIC_MODEL_ALIASES` as specified.
     - Update `AVAILABLE_MODELS.openai` to include the new GPT-5.x lineup, retaining any additional models that must remain available.
     - Update `DEFAULT_MODELS.openai` and add `gpt-5.2` and `gpt-5.2-codex` to `REASONING_MODELS`.
     - Extend `AVAILABLE_MODELS.openrouter` with the specified models; confirm that any existing OpenRouter configuration/selection code needs no further changes.
  2. **Update `feature-loop.sh.tmpl`:**
     - Edit only the comment line containing `claude-sonnet-4-5-20250514` and swap it to `claude-sonnet-4-5-20250929`.
  3. **Run tests and type checks:**
     - `npm run test`
     - `npm run typecheck`
  4. **Adjust tests if necessary:**
     - If any test fixtures explicitly assert on the old model IDs (e.g., snapshot tests, config tests), update them to the new IDs while ensuring the test intent (correct wiring to current models) remains the same.

- **Tech stack implications**
  - TypeScript:
    - Ensure types for model entries (`value`, `label`, `hint`) remain consistent with any existing interfaces in `providers.ts`.
  - React/Ink TUI:
    - The `/init` dropdown components should automatically pick up updated models from `AVAILABLE_MODELS` if they follow the existing pattern; no component-level changes should be required.
  - Vitest:
    - Unit tests may need minor expectation updates if they intentionally reference specific model IDs.

## Acceptance Criteria

- **Anthropic**
  - [x] `AVAILABLE_MODELS.anthropic` includes:
    - `claude-opus-4-6` with label `Claude Opus 4.6` and hint `most capable`.
    - `claude-sonnet-4-5-20250929` with label `Claude Sonnet 4.5` and hint `recommended`.
    - `claude-haiku-4-5-20251001` with label `Claude Haiku 4.5` and hint `fastest`.
  - [x] `DEFAULT_MODELS.anthropic` equals `'claude-sonnet-4-5-20250929'`.
  - [x] `ANTHROPIC_MODEL_ALIASES` maps:
    - `sonnet` → `claude-sonnet-4-5-20250929`
    - `opus` → `claude-opus-4-6`
    - `haiku` → `claude-haiku-4-5-20251001`
  - [x] In the `/init` flow, choosing Anthropic shows the above three models with the correct labels and hints, and selection persists correctly into config.

- **OpenAI**
  - [x] `AVAILABLE_MODELS.openai` includes at least:
    - `gpt-5.2` / `GPT-5.2` / `most capable`
    - `gpt-5.2-codex` / `GPT-5.2 Codex` / `best for code`
    - `gpt-5.1` / `GPT-5.1` / `previous gen`
    - `gpt-5.1-codex-max` / `GPT-5.1 Codex Max` / `previous codex`
    - `gpt-5-mini` / `GPT-5 Mini` / `fastest`
  - [x] `DEFAULT_MODELS.openai` equals `'gpt-5.2'`.
  - [x] `REASONING_MODELS` (or equivalent) contains both `'gpt-5.2'` and `'gpt-5.2-codex'`.
  - [x] In the `/init` flow, when provider is OpenAI, these models appear in the dropdown and can be selected and saved.

- **OpenRouter**
  - [x] `AVAILABLE_MODELS.openrouter` includes:
    - `google/gemini-3-pro-preview` / `Gemini 3 Pro Preview` / `Google`
    - `google/gemini-3-flash-preview` / `Gemini 3 Flash Preview` / `fast`
    - `moonshotai/kimi-k2.5` / `Kimi K2.5` / `Moonshot`
    - `deepseek/deepseek-v3.2` / `DeepSeek V3.2` / `efficient`
    - `minimax/minimax-m2.1` / `MiniMax M2.1` / `MiniMax`
    - `z-ai/glm-4.7` / `GLM 4.7` / `Z-AI`
    - `x-ai/grok-4.1-fast` / `Grok 4.1 Fast` / `xAI`
  - [x] In `/init`, selecting the OpenRouter provider shows these models with correct labels and hints.

- **Loop script**
  - [x] In `src/templates/scripts/feature-loop.sh.tmpl`, the comment for `--model` reads (or is equivalent to):
    - `# --model MODEL Claude model to use (e.g., opus, sonnet, claude-sonnet-4-5-20250929)`
  - [x] The script continues to accept `opus` and `sonnet` as aliases and resolves them via `ANTHROPIC_MODEL_ALIASES`.

- **Backward compatibility**
  - [x] Existing configuration files that reference old full model IDs load without any runtime errors.
  - [x] Alias-based usage (e.g., `--model sonnet` in scripts or configs that rely on aliases) continues to work, now using the new Anthropic IDs via the updated alias mapping.
  - [x] No new prompts, flags, or breaking changes are introduced in `/init` or CLI behavior.

- **Quality**
  - [x] `npm run test` passes.
  - [x] `npm run typecheck` passes.
  - [x] No linting or build-time errors are introduced by the changes.

## Out of Scope

- Adding or removing providers (Anthropic, OpenAI, OpenRouter remain as-is).
- Introducing new CLI flags, configuration options, or TUI screens/flows.
- Implementing any migration or mapping logic to transform existing configs from old model IDs to new ones.
- Updating external documentation beyond:
  - The inline hints and labels in `providers.ts`.
  - The single comment in `feature-loop.sh.tmpl`.
- Changing the core Wiggum agent behavior or how the `/init` process is orchestrated.

## Project Tech Stack

- Framework: React v^18.3.1 (Ink-based TUI)
- Unit Testing: Vitest
- Package Manager: npm

## Reference Documents

- Inline context specifying:
  - New Anthropic models and IDs.
  - New OpenAI GPT-5.x models and reasoning requirements.
  - New OpenRouter models.
  - Required `feature-loop.sh.tmpl` comment update.
- `src/ai/providers.ts` – central model configuration (models, defaults, aliases, reasoning flags).
- `src/templates/scripts/feature-loop.sh.tmpl` – feature loop script template with model help comment.
