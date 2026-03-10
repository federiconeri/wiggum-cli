# update-ai-models Implementation Plan

**Spec:** .ralph/specs/update-ai-models.md
**Branch:** feat/update-ai-models
**Status:** Planning

## Tasks

### Phase 1: Core Implementation

- [x] Update Anthropic models in `src/ai/providers.ts` - [complexity: S] - Done: 5a9e9af
  - Replace `AVAILABLE_MODELS.anthropic` entries:
    - `claude-opus-4-5-20250514` → `claude-opus-4-6` (label: `Claude Opus 4.6`, hint: `most capable`)
    - `claude-sonnet-4-5-20250514` → `claude-sonnet-4-5-20250929` (label: `Claude Sonnet 4.5`, hint: `recommended`)
    - `claude-haiku-4-5-20250514` → `claude-haiku-4-5-20251001` (label: `Claude Haiku 4.5`, hint: `fastest`)
  - Update `DEFAULT_MODELS.anthropic` → `'claude-sonnet-4-5-20250929'`
  - Update `ANTHROPIC_MODEL_ALIASES` targets:
    - `sonnet` → `'claude-sonnet-4-5-20250929'`
    - `opus` → `'claude-opus-4-6'`
    - `haiku` → `'claude-haiku-4-5-20251001'`

- [x] Update OpenAI models in `src/ai/providers.ts` - [complexity: S] - Done: 5a9e9af
  - Replace `AVAILABLE_MODELS.openai` with:
    - `gpt-5.2` / `GPT-5.2` / `most capable`
    - `gpt-5.2-codex` / `GPT-5.2 Codex` / `best for code`
    - `gpt-5.1` / `GPT-5.1` / `previous gen`
    - `gpt-5.1-codex-max` / `GPT-5.1 Codex Max` / `previous codex`
    - `gpt-5-mini` / `GPT-5 Mini` / `fastest`
  - Update `DEFAULT_MODELS.openai` → `'gpt-5.2'`
  - Add `'gpt-5.2'` and `'gpt-5.2-codex'` to `REASONING_MODELS`

- [x] Update OpenRouter models in `src/ai/providers.ts` - [complexity: S] - Done: 5a9e9af
  - Replace `AVAILABLE_MODELS.openrouter` with:
    - `google/gemini-3-pro-preview` / `Gemini 3 Pro Preview` / `Google`
    - `google/gemini-3-flash-preview` / `Gemini 3 Flash Preview` / `fast`
    - `moonshotai/kimi-k2.5` / `Kimi K2.5` / `Moonshot`
    - `deepseek/deepseek-v3.2` / `DeepSeek V3.2` / `efficient`
    - `minimax/minimax-m2.1` / `MiniMax M2.1` / `MiniMax`
    - `z-ai/glm-4.7` / `GLM 4.7` / `Z-AI`
    - `x-ai/grok-4.1-fast` / `Grok 4.1 Fast` / `xAI`

- [x] Update feature-loop script comment in `src/templates/scripts/feature-loop.sh.tmpl` - [complexity: S] - Done: 5a9e9af
  - Line 9: change `claude-sonnet-4-5-20250514` → `claude-sonnet-4-5-20250929`

### Phase 2: Tests

- [x] Run typecheck and existing tests to verify no regressions - [complexity: S] - Done: 5a9e9af
  - `npm run typecheck` ✓ passed
  - `npm run test` ✓ 527 tests passed
  - `npm run build` ✓ passed
  - Note: `InterviewScreen.test.ts` already uses `claude-sonnet-4-5-20250929` — no update needed there
  - Note: `mock-ai.ts` uses generic mock model IDs (`sonnet`, `gpt-4o`, `auto`) — no update needed
  - Note: `config.test.ts` doesn't reference specific model IDs — no update needed
  - No test failures - all existing tests continue to pass

### Phase 3: Verification

- [x] Verify spec acceptance criteria - [complexity: S] - Done: 5a9e9af
  - ✓ `AVAILABLE_MODELS.anthropic` matches spec (opus 4.6, sonnet 4.5 20250929, haiku 4.5 20251001)
  - ✓ `AVAILABLE_MODELS.openai` matches spec (gpt-5.2, gpt-5.2-codex, gpt-5.1, gpt-5.1-codex-max, gpt-5-mini)
  - ✓ `AVAILABLE_MODELS.openrouter` matches spec (all 7 models with correct labels including "Preview" and "V3.2")
  - ✓ `DEFAULT_MODELS.anthropic` = `'claude-sonnet-4-5-20250929'`
  - ✓ `DEFAULT_MODELS.openai` = `'gpt-5.2'`
  - ✓ `ANTHROPIC_MODEL_ALIASES` all point to new IDs
  - ✓ `REASONING_MODELS` includes `'gpt-5.2'` and `'gpt-5.2-codex'`
  - ✓ Only 2 files modified: `src/ai/providers.ts` and `src/templates/scripts/feature-loop.sh.tmpl`
  - ✓ No new providers, aliases (count unchanged), flags, or breaking changes introduced

## Scope Constraints (from spec)

Only two files should be modified:
1. `src/ai/providers.ts` — model lists, defaults, aliases, reasoning models
2. `src/templates/scripts/feature-loop.sh.tmpl` — one comment line

No changes to:
- CLI flags, `/init` TUI flow, provider wiring, or agent behavior
- No migration logic for existing configs
- No new aliases or providers

## Analysis Notes

### Current state of `src/ai/providers.ts`:
- **Anthropic models**: 3 entries using `*-20250514` date suffix (lines 67-71)
- **OpenAI models**: 3 entries — `gpt-5.1`, `gpt-5.1-codex-max`, `gpt-5-mini` (lines 72-76)
- **OpenRouter models**: 5 entries — missing `kimi-k2.5`, `grok-4.1-fast` (lines 77-83)
- **Anthropic aliases**: `sonnet`/`opus`/`haiku` → `*-20250514` (lines 99-103)
- **Default models**: `claude-sonnet-4-5-20250514`, `gpt-5.1` (lines 90-94)
- **Reasoning models**: includes `gpt-5`, `gpt-5.1`, `gpt-5-mini`, `gpt-5.1-codex`, `gpt-5.1-codex-max` (lines 221-227)

### Existing tests referencing model IDs:
- `InterviewScreen.test.ts` — already uses `claude-sonnet-4-5-20250929` (no change needed)
- `mock-ai.ts` — uses generic mock values like `'sonnet'`, `'gpt-4o'`, `'auto'` (no change needed)
- `config.test.ts` — no model ID assertions (no change needed)
- No snapshot tests reference specific model IDs

### OpenRouter label corrections needed:
- Current: `Gemini 3 Pro` → Spec: `Gemini 3 Pro Preview`
- Current: `DeepSeek v3.2` → Spec: `DeepSeek V3.2` (capital V)

## Implementation Summary

**Status:** ✅ Complete (commit: 5a9e9af)

### Changes Made

1. **Anthropic Models** (src/ai/providers.ts:67-71)
   - Updated all 3 models to new versions with date suffix updates
   - Labels remain consistent, hints unchanged
   - All aliases (sonnet/opus/haiku) now resolve to new IDs

2. **OpenAI Models** (src/ai/providers.ts:72-78)
   - Added gpt-5.2 and gpt-5.2-codex at top of list
   - Retained gpt-5.1 models as "previous gen"
   - Updated default from gpt-5.1 → gpt-5.2
   - Added new models to REASONING_MODELS array

3. **OpenRouter Models** (src/ai/providers.ts:79-87)
   - Added moonshotai/kimi-k2.5 and x-ai/grok-4.1-fast
   - Fixed label capitalization (Gemini 3 Pro Preview, DeepSeek V3.2)
   - Order maintained as specified in spec

4. **Feature Loop Template** (src/templates/scripts/feature-loop.sh.tmpl:9)
   - Updated example model ID in comment from 20250514 → 20250929

### Validation Results

- ✅ TypeScript compilation (tsc --noEmit): passed
- ✅ All tests (vitest run): 527 tests passed
- ✅ Build (tsc && copy-templates): successful
- ✅ No breaking changes to existing configs or alias behavior
- ✅ Backward compatibility maintained (old full IDs still work if provider supports them)

### Spec Compliance

All acceptance criteria met:
- ✓ Anthropic: 3 models with correct IDs, labels, hints
- ✓ OpenAI: 5 models including new GPT-5.2 variants
- ✓ OpenRouter: 7 models with correct labels
- ✓ Aliases updated to point to new IDs
- ✓ Default models updated
- ✓ Reasoning models list includes GPT-5.2 variants
- ✓ Template comment updated
- ✓ Only 2 files modified as specified
- ✓ No new providers, breaking changes, or config migrations

## Done
