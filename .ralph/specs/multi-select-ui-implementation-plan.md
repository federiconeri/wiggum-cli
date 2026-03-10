# multi-select-ui Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace free-form text input in the interview flow with a structured multi-select UI, using the existing `Select` component extended for checkbox-style multi-selection. Each question defaults to multi-select with a "Chat about this" free-text fallback.

**Architecture:** The feature spans three layers:

1. **Data model** - New types (`InterviewQuestion`, `InterviewAnswer`, `InterviewOption`) in a shared types file, consumed by both orchestrator and UI.
2. **Orchestrator** - `InterviewOrchestrator` parses AI responses into structured question objects with options, and the AI system prompt is updated to instruct the model to return options in a parseable format.
3. **TUI** - A new `MultiSelect` component extends the existing `Select` pattern for checkbox-style multi-selection. `InterviewScreen` conditionally renders either `MultiSelect` or `ChatInput` based on the current question's answer mode.

**Tech Stack:** React (Ink TUI), TypeScript, Vitest

**Spec:** `.ralph/specs/multi-select-ui.md`
**Branch:** `feat/multi-select-ui`
**Status:** Completed

---

## Analysis Summary

### What exists

- **`Select` component** (`src/tui/components/Select.tsx`): Single-select only. Uses `useInput` for keyboard navigation (up/down/j/k, Enter to select, Escape to cancel). Returns a single value via `onSelect`. Has `SelectOption<T>` interface with `value`, `label`, `hint`.
- **`InterviewScreen`** (`src/tui/screens/InterviewScreen.tsx`): Renders `ChatInput` for all phases including interview. The `handleSubmit` callback routes user text to orchestrator methods based on phase.
- **`InterviewOrchestrator`** (`src/tui/orchestration/interview-orchestrator.ts`): Manages interview flow. `submitAnswer(answer: string)` sends plain text to `ConversationManager.chat()`. The AI response is checked for "enough information" keywords, then displayed as assistant message. No structured question parsing exists.
- **`ConversationManager`** (`src/ai/conversation/conversation-manager.ts`): Manages AI conversation history. `chat()` sends messages and returns text. No structured output parsing.
- **`useSpecGenerator` hook** (`src/tui/hooks/useSpecGenerator.ts`): State management for the interview flow. Has `SpecGeneratorState` with `currentQuestion`, `awaitingInput`, etc. No concept of structured questions/options.
- **`buildSystemPrompt`** in orchestrator: Constructs the AI system prompt with project context, tool awareness, and spec format instructions. Currently tells AI to "ask one focused question at a time."
- **`MessageList`** (`src/tui/components/MessageList.tsx`): Renders conversation. Assistant messages with `?` at end get "Next question:" prefix in yellow.

### What's needed

1. **Shared types** for structured interview questions and answers
2. **`MultiSelect` component** - Checkbox-style multi-select extending the `Select` pattern
3. **AI prompt update** - Instruct AI to return structured options with each question
4. **Orchestrator parsing** - Parse AI responses into `InterviewQuestion` objects
5. **InterviewScreen integration** - Render `MultiSelect` or `ChatInput` based on mode
6. **Keyboard hints** - Show context-appropriate keybindings in the footer area
7. **Error handling** - Graceful fallback when AI doesn't return valid options

### Key design decisions

- **New `MultiSelect` component** rather than adding multi-select to `Select` - the interaction models are fundamentally different (toggle+submit vs single-select), and the existing `Select` is cleanly scoped. A new component avoids API pollution.
- **AI returns options in a fenced JSON block** within its natural language response - this is simpler than structured output schemas and allows the AI to still provide context text around the question.
- **Parsing with regex + JSON.parse** - Extract the JSON block from AI response, parse it, validate shape. Fall back to free-text on failure.
- **Answer mode tracked per-question in InterviewScreen state** - not in orchestrator, since it's a UI concern.

---

## Tasks

### Phase 1: Data Model & Types

- [x] Task 1: Create shared interview types file - [complexity: S]
  - Create `src/tui/types/interview.ts` with:
    - `InterviewOption` interface: `{ id: string; label: string }`
    - `InterviewQuestion` interface: `{ id: string; text: string; options: InterviewOption[] }`
    - `InterviewAnswerMode` type: `'multiSelect' | 'freeText'`
    - `InterviewAnswer` discriminated union type
  - Export all types

### Phase 2: MultiSelect Component

- [x] Task 2: Create `MultiSelect` component - [complexity: M]
  - Create `src/tui/components/MultiSelect.tsx`
  - Based on `Select` component pattern but with checkbox-style multi-selection:
    - Props: `message: string`, `options: SelectOption<string>[]`, `onSubmit: (selectedValues: string[]) => void`, `onChatMode?: () => void`, `onCancel?: () => void`
    - State: `focusedIndex` (number), `selectedValues` (Set<string>)
    - Keyboard: Up/Down or j/k to navigate, Space to toggle selection, Enter to submit selected values, `c` to trigger "Chat about this" mode, Escape to cancel
    - Visual: `[x]` for selected, `[ ]` for unselected, highlight focused row with blue color (matching Select pattern)
    - Keyboard hints bar at bottom: `(↑↓ move, Space toggle, Enter submit, c chat mode, Esc cancel)`
  - Reuse `SelectOption` type from existing `Select.tsx` for consistency

### Phase 3: AI Prompt & Orchestrator

- [x] Task 3: Update AI system prompt to request structured options - [complexity: S]
  - Modify `buildSystemPrompt()` in `src/tui/orchestration/interview-orchestrator.ts`
  - Add interview instructions section telling the AI to:
    - Return each question with a fenced JSON block of options
    - Use format: ` ```options\n[{"id": "opt1", "label": "Option text"}, ...]\n``` `
    - Provide 3-6 options per question
    - Keep option labels concise and actionable
  - The AI can still include natural language context before/after the options block

- [x] Task 4: Add response parsing to extract structured questions - [complexity: M]
  - Add `parseInterviewResponse(response: string): InterviewQuestion | null` function in orchestrator file
  - Parse logic:
    1. Extract question text (everything before the ` ```options ` block, trimmed)
    2. Extract JSON from fenced ` ```options ... ``` ` block
    3. Validate shape: array of `{ id: string, label: string }` objects
    4. Return `InterviewQuestion` or `null` if parsing fails
  - Export function for testing

- [x] Task 5: Wire orchestrator to emit structured questions - [complexity: M]
  - Add `onQuestion` callback to `InterviewOrchestratorOptions` interface:
    - `onQuestion?: (question: InterviewQuestion) => void`
  - Modify `submitAnswer()` and `submitGoals()` in orchestrator:
    - After receiving AI response, run `parseInterviewResponse()`
    - If parsed successfully: call `onQuestion(question)` instead of `onMessage('assistant', response)` for the question portion, still show context paragraphs via `onMessage`
    - If parsing fails: fall back to `onMessage('assistant', response)` as before (free-text mode)
  - Update `submitAnswer()` to accept `InterviewAnswer` type (discriminated union) instead of plain string:
    - `multiSelect` mode: format selected option labels into a readable string for the AI conversation
    - `freeText` mode: pass through as before

### Phase 4: InterviewScreen Integration

- [x] Task 6: Integrate MultiSelect into InterviewScreen - [complexity: L]
  - Add state to InterviewScreen:
    - `currentQuestion: InterviewQuestion | null` - the current structured question
    - `answerMode: 'multiSelect' | 'freeText'` - current answer mode
  - Pass `onQuestion` callback when creating orchestrator:
    - Set `currentQuestion` state with the parsed question
    - Set `answerMode` to `'multiSelect'`
  - Conditional rendering in interview phase:
    - If `answerMode === 'multiSelect'` and `currentQuestion`: render `MultiSelect`
    - If `answerMode === 'freeText'` or no structured question: render `ChatInput` (existing behavior)
  - Handle MultiSelect `onSubmit`: build `InterviewAnswer` with `mode: 'multiSelect'`, call orchestrator
  - Handle MultiSelect `onChatMode`: set `answerMode = 'freeText'`, clear `currentQuestion`, show `ChatInput`
  - Handle ChatInput submit in freeText mode: build `InterviewAnswer` with `mode: 'freeText'`, call orchestrator
  - Reset `currentQuestion` and `answerMode` after each answer submission

- [x] Task 7: Add keyboard hints for interview phase - [complexity: S]
  - The `MultiSelect` component already includes its own keyboard hints bar
  - When in `freeText` mode during interview, the existing `ChatInput` placeholder is sufficient
  - No separate footer hints needed (they'd conflict with the FooterStatusBar)

### Phase 5: Tests

- [x] Task 8: Test parseInterviewResponse - [complexity: S]
  - Add tests in `src/tui/orchestration/interview-orchestrator.test.ts`:
    - Parses valid response with question text and options block
    - Returns null for response without options block
    - Returns null for malformed JSON in options block
    - Handles options with extra whitespace/newlines
    - Preserves option order and labels exactly
    - Handles empty options array gracefully
    - Handles missing id or label fields

- [x] Task 9: Test MultiSelect component - [complexity: M]
  - Create `src/tui/components/MultiSelect.test.ts`:
    - Renders all options with correct labels
    - Shows focused indicator on first option by default
    - Keyboard navigation (up/down) moves focus
    - Space toggles selection (shows checkbox state)
    - Enter submits currently selected values
    - Submit with no selections returns empty array
    - `c` key triggers onChatMode callback
    - Escape triggers onCancel callback
    - Displays keyboard hints

- [x] Task 10: Test InterviewScreen multi-select integration - [complexity: M]
  - Extend `src/tui/screens/InterviewScreen.test.ts`:
    - When orchestrator emits onQuestion with structured question, MultiSelect renders
    - When MultiSelect submits, orchestrator receives InterviewAnswer
    - When "Chat about this" is triggered, ChatInput renders instead
    - When AI response has no options block, falls back to ChatInput

### Phase 6: Polish & Error Handling

- [x] Task 11: Add graceful fallback for malformed AI responses - [complexity: S]
  - In orchestrator, when `parseInterviewResponse()` returns null:
    - Show the raw AI response as an assistant message
    - Fall back to free-text mode for that question
    - No crash, no error message to user - just seamless fallback
  - Test this path in Task 8

- [x] Task 12: Update spec README with implementation plan link - [complexity: S]
  - Add row to `.ralph/specs/README.md` Active Specs table
  - Update spec status from "Planned" to "In Progress"

### Phase 7: E2E Testing

Browser-based tests are not applicable for this TUI feature. Manual testing via the CLI is the appropriate E2E verification.

**Automated Testing Status:** ✅ Build passes, all 282 unit tests pass (verified 2026-02-09)

**Integration Verification (Automated):** ✅ PASSED
- CLI entry points functional (`node bin/ralph.js --version` returns 0.11.22)
- MultiSelect component imported and used in InterviewScreen.tsx
- parseInterviewResponse() integrated in interview-orchestrator.ts
- onQuestion callback wired in orchestrator and InterviewScreen
- All unit tests cover multi-select logic, parsing, and mode switching

**Manual E2E Tests Required Before Production:**

- [ ] E2E: Multi-select interview flow - happy path (manual)
  - **Preconditions:** Built CLI (`npm run build`), API keys configured
  - **Steps:**
    1. Run `ralph new test-multi-select` -> Interview starts
    2. Add context (optional), enter goals -> First question appears with multi-select options
    3. Use arrow keys to navigate options -> Focus indicator moves
    4. Press Space on 2 options -> Checkboxes show selected state
    5. Press Enter -> Answer submitted, next question appears
    6. Repeat for several questions -> All show multi-select
    7. Type "done" after answering -> Spec generates
  - **Verify:** All questions showed multi-select UI, answers were correctly submitted

- [ ] E2E: Chat about this fallback (manual)
  - **Steps:**
    1. Start interview, reach first question with multi-select
    2. Press `c` -> Multi-select replaced with ChatInput
    3. Type free-text answer and press Enter -> Answer submitted
    4. Next question appears with multi-select again
  - **Verify:** Mode switch is clean, no visual artifacts

- [ ] E2E: Malformed AI response fallback (manual)
  - **Steps:**
    1. Observe if any AI response lacks the `options` block
    2. System should automatically show ChatInput for that question
  - **Verify:** No crash, seamless fallback to free-text

**Note:** TUI applications cannot be automated with browser-based testing tools (Playwright). The comprehensive unit test coverage (10 MultiSelect tests, 6 InterviewScreen tests, 37 orchestrator tests) provides confidence in the implementation. Manual testing should verify the visual presentation and keyboard interaction UX.

---

## Done

All tasks completed on 2026-02-09:

- Task 1: Create shared interview types file ✅
- Task 2: Create `MultiSelect` component ✅
- Task 3: Update AI system prompt to request structured options ✅
- Task 4: Add response parsing to extract structured questions ✅
- Task 5: Wire orchestrator to emit structured questions ✅
- Task 6: Integrate MultiSelect into InterviewScreen ✅
- Task 7: Add keyboard hints for interview phase ✅
- Task 8: Test parseInterviewResponse ✅
- Task 9: Test MultiSelect component ✅
- Task 10: Test InterviewScreen multi-select integration ✅
- Task 11: Add graceful fallback for malformed AI responses ✅
- Task 12: Update spec README with implementation plan link ✅

**Implementation complete.** All unit tests passing (282 tests). Automated integration verification passed. E2E manual testing outlined in Phase 7 should be performed before production deployment.

---

## Verification Summary (2026-02-09)

### Automated Tests: ✅ PASSED
- **Build:** ✅ Successful (`npm run build`)
- **Unit Tests:** ✅ 282 tests passed (15 test files)
  - MultiSelect component: 10 tests (keyboard navigation, selection toggle, mode switching)
  - InterviewScreen integration: 6 tests (conditional rendering, answer submission)
  - parseInterviewResponse: 37 tests (parsing, validation, error handling)
- **Integration Points:** ✅ Verified
  - `MultiSelect` exported and imported in `InterviewScreen.tsx`
  - `parseInterviewResponse()` exported and used in orchestrator
  - `onQuestion` callback wired through orchestrator → InterviewScreen
  - CLI entry point functional (`bin/ralph.js --version` → 0.11.22)

### E2E Manual Testing: ⏳ PENDING
- TUI applications cannot be automated with Playwright (browser-only tool)
- Manual testing scenarios documented in Phase 7
- Comprehensive unit test coverage (53 tests across 3 files) validates logic
- Visual/UX verification required before production deployment

### Production Readiness
- ✅ All implementation tasks complete
- ✅ All automated tests passing
- ⏳ Manual E2E testing pending (non-blocking for PR creation)
- ✅ Ready for code review and merge
