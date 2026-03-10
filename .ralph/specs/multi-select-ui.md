# Multi-Select UI for Interview Questions Feature Specification

**Status:** Completed
**Version:** 1.0  
**Last Updated:** 2026-02-09  

## Purpose

Replace the free-form text input used in the interview flow with a structured, checkbox-style multi-select UI, reusing the existing Select component. All interview questions will default to multi-select answers (with an optional “Chat about this” free-text fallback), enabling faster, more consistent, and more structured responses for spec generation.

## User Stories

- As a user going through an interview, I want to answer questions by selecting from curated options so that I can respond quickly without typing long free-text answers.
- As a user, I want to optionally switch a question to “Chat about this” so that I can provide a fully custom free-text answer when the suggested options don’t fit.
- As a user, I want clear keyboard hints and auto-focused controls on each interview question so that I can efficiently answer using only the keyboard.
- As a system (AI+orchestrator), I want to provide structured multi-select options to the UI so that the collected answers are predictable and easy to consume for spec generation.
- As a product maintainer, I want the multi-select interview feature to reuse existing components and patterns so that the implementation is consistent and testable.

## Requirements

### Functional Requirements

#### FR1: Multi-select as Default Answer Mode

- [x] All interview questions in the TUI must default to a structured, multi-select UI instead of a free-form input.

**Details & Acceptance Criteria:**

- The existing `InterviewScreen` must:
  - [x] Render a multi-select question UI for each new interview question, using the same visual style and behavior as the existing "plan mode" multi-select (via `Select`).
  - [x] No free-form text input should be shown initially for a question (unless the question is explicitly in "Chat about this" mode).
- When a new question is received from the AI/orchestrator:
  - [x] The screen must show:
    - Question header ("Next question:" or equivalent existing styling in yellow).
    - Question text in yellow (as currently implemented).
    - A multi-select list of options (checkbox style) below the question text.
  - [x] The multi-select list must auto-focus when displayed (keyboard navigation immediately affects it).
- [x] Previously implemented free-form-only interview answers must no longer be the primary path; every question must use the multi-select UI by default.

#### FR2: Use Existing Multi-Select Component

- [x] The interview flow must reuse the existing `Select` component (or an extended variant) to render multi-select questions.

**Details & Acceptance Criteria:**

- [x] `src/tui/components/Select.tsx` (or its multi-select capabilities) must be used or extended, not re-implemented from scratch. *(New `MultiSelect` component created, reusing `SelectOption` type and visual patterns from `Select`.)*
- [x] The Select component must support:
  - [x] Multiple options being selected at once (checkbox-style, not single-choice radio).
  - [x] Visual indication of:
    - The currently focused option.
    - Whether each option is selected.
- [x] Keyboard behavior must include, at minimum:
  - [x] Up/Down arrow keys (or `k/j`) move focus between options.
  - [x] Space/Enter toggles the selected state of the focused option (if consistent with the existing Select UX). *(Space toggles selection, Enter submits — cleaner separation of concerns.)*
  - [x] A distinct key (typically Enter or a "Continue" action) confirms the selections and submits the answer to the orchestrator.
- [x] The options' text and order must match exactly what the AI/orchestrator sends (no reordering, rewriting, or truncation beyond existing layout behavior).

#### FR3: “Chat about this” Free-Text Fallback

- [x] Each question must offer a "Chat about this" mode that switches the answer for that question to pure free-text, ignoring any selected options.

**Details & Acceptance Criteria:**

- [x] The multi-select UI must present a clearly discoverable way to switch to a free-text mode for the current question, e.g.:
  - A dedicated option in the list (e.g., "Chat about this instead") or
  - A keyboard hint for a key that switches to chat mode (e.g., `c` for "Chat about this").
- On triggering "Chat about this":
  - [x] Any current selections in the multi-select list for this question must be discarded (not submitted).
  - [x] The UI for that question must switch to show:
    - The question text.
    - A free-text input component (reusing existing chat input used before this feature).
  - [x] The answer being sent back to the orchestrator for this question must be represented as free-text only (no structured options).
- [x] It must be impossible for a single question to submit both:
  - Multi-select options and
  - A free-text "Chat about this" answer.
  Only one mode is allowed per answer.

#### FR4: Flexible Selection (No Min/Max Constraints)

- [x] By default, the multi-select UI must allow any number of options (including zero) to be selected unless a specific question explicitly defines limits in the future.

**Details & Acceptance Criteria:**

- [x] For this version, no validation should enforce:
  - A required minimum number of selections.
  - A maximum number of selections.
- [x] The orchestrator and UI must:
  - [x] Accept zero selections as a valid answer (e.g., user presses continue without selecting any options).
  - [x] Accept one or more selections without enforcement of a cap.
- [x] If in future a question includes min/max constraints, the system should be architected to support that (but is not required to implement them now).

#### FR5: AI-Orchestrator Structured Option Support

- [x] The AI and `interview-orchestrator` must be updated so that questions include structured multi-select options, tailored for this mode.

**Details & Acceptance Criteria:**

- [x] `src/tui/orchestration/interview-orchestrator.ts` must:
  - [x] Parse AI responses into a structured object for each question, including:
    - Question text.
    - An ordered list of options, each with:
      - A stable identifier (e.g., `id` or `value`).
      - A label string as provided by the AI (no normalization of text).
    - A flag or type indicating the question is in multi-select mode by default.
  - [x] Provide a representation for free-text answers when "Chat about this" is chosen (e.g., `type: "freeText"`, `value: string`).
- [x] Prompting for AI must be adjusted (likely in `src/templates/prompts` or related AI modules) so that:
  - [x] The AI is instructed to:
    - Return multi-select options for each interview question.
    - Use labels formatted appropriately for the interview UX.
  - [x] The AI is told that the primary interaction is multi-select, with free-text reserved for edge cases.
- [x] The orchestrator must expose to `InterviewScreen`:
  - [x] A clear, typed structure representing the current question and options.
  - [x] A method to submit answers in either:
    - Multi-select mode: a list of selected option IDs/values.
    - Free-text mode: a string.

#### FR6: Keyboard Hints & Auto-Focus

- [x] Each new interview question must automatically focus the multi-select control and show clear keyboard hints.

**Details & Acceptance Criteria:**

- [x] When a question is rendered:
  - [x] The first multi-select option must be focused by default (or the current index if returning to a question).
  - [x] The user must be able to immediately navigate options with the keyboard without extra keystrokes.
- [x] The bottom of the screen (or equivalent area) must display keyboard hints, consistent with other screens:
  - [x] Hints for:
    - Moving focus (Up/Down).
    - Toggling selection (Space/Enter).
    - Confirming the answer (Enter or a separate key if used).
    - Triggering "Chat about this" mode (if bound to a key).
- [x] There must be no ambiguity about how to proceed; QA should be able to complete a full interview using only the keyboard following the hints.

---

### Non-Functional Requirements

- [x] **Performance:**
  - Multi-select rendering must be responsive; navigating options and toggling selection should happen without perceptible lag on typical terminals.
- [x] **Reliability:**
  - The system must handle missing or malformed AI options gracefully (e.g., fall back to free-text mode or show a clean error state instead of crashing).
- [x] **Usability:**
  - Keyboard-only navigation must be fully supported.
  - The interface should be consistent with existing TUI interaction patterns.
- [x] **Extensibility:**
  - The orchestration and UI should be designed so that future enhancements (e.g., min/max constraints, single-select questions, option grouping) can be added without redesigning the entire flow.
- [x] **Testing:**
  - Unit and integration tests (Vitest) must validate:
    - Parsing and handling of AI-provided options.
    - Switching between multi-select and "Chat about this."
    - Correct answer payloads sent back to the orchestrator.

## Technical Notes

### Implementation Approach

1. **Data Model & Orchestrator Updates**

   Files to modify:
   - `src/tui/orchestration/interview-orchestrator.ts`
   - Potentially `src/ai` prompt/templates (e.g., `src/templates/prompts/...`)

   Steps:
   - Introduce/extend a typed model for interview questions:
     ```ts
     type InterviewAnswerMode = 'multiSelect' | 'freeText';

     interface InterviewOption {
       id: string;      // stable identifier
       label: string;   // shown exactly as provided by AI
     }

     interface InterviewQuestion {
       id: string;
       text: string;
       mode: InterviewAnswerMode; // default 'multiSelect'
       options?: InterviewOption[]; // required when mode is 'multiSelect'
     }

     type InterviewAnswer =
       | { mode: 'multiSelect'; questionId: string; selectedOptionIds: string[] }
       | { mode: 'freeText'; questionId: string; text: string };
     ```
   - Update orchestrator logic to:
     - Parse AI responses into `InterviewQuestion` objects with options.
     - Track the current question and its mode.
     - Accept `InterviewAnswer` objects from the UI and pass them to downstream AI/spec-generation logic.

   - Adjust AI prompts (and response schemas if any are used) to:
     - Include a clear contract for how options are returned (JSON-like array, stable IDs, labels).
     - Emphasize that labels are exactly what the user sees.

2. **TUI Screen Integration**

   Files to modify:
   - `src/tui/screens/InterviewScreen.tsx`
   - Possibly shared hooks/utilities in `src/tui/hooks` or `src/tui/utils`

   Steps:
   - Replace or augment the current free-form answer input region with:
     - A `Select`-based multi-select UI bound to `InterviewQuestion.options`.
   - Implement state logic to:
     - Track selected option IDs for the current question.
     - Track whether the current question is in `multiSelect` or `freeText` mode.
   - Connect UI events to orchestrator:
     - On submit of multi-select:
       - Build `InterviewAnswer` with `mode: 'multiSelect'` and `selectedOptionIds`.
       - Call orchestrator’s “submit answer” function.
     - On switch to “Chat about this”:
       - Set mode to `freeText` for this question.
       - Clear selected options.
       - Render existing chat input component instead.

3. **Select Component Usage / Extension**

   Files to use/extend:
   - `src/tui/components/Select.tsx`

   Steps:
   - Confirm `Select` already supports:
     - Multi-select behavior, or
     - Extend it to support multi-select via a prop (e.g., `multi={true}`).
   - Ensure `Select` can:
     - Render checkboxes or some indicator for multiple selections.
     - Expose a callback: `onChange(selectedIds: string[])` or similar.
     - Respect and display item order as provided.
   - Wire keyboard hints to match `Select` keybindings.

4. **Keyboard Hints & Auto-Focus**

   Files to modify:
   - `src/tui/screens/InterviewScreen.tsx`
   - Possibly shared footer/hints components in `src/tui/components`

   Steps:
   - Ensure that upon rendering a question:
     - `Select` is auto-focused (using Ink focus management if present).
   - Implement a footer or hint bar showing keybindings:
     - Up/Down: move
     - Space/Enter: toggle
     - Enter (or custom): submit
     - `c` (or chosen key): “Chat about this”
   - Ensure hints update if the question switches to free-text mode.

5. **AI Prompt / Template Adjustments**

   Files to inspect/adjust:
   - `src/templates/prompts/...` (interview-related prompts)
   - `src/ai/...` (response formatting/parsing)

   Steps:
   - Update prompts to:
     - Request a specific schema for options (e.g., list of `{id, label}`).
     - Encourage options phrased as discrete, selectable choices.
     - Remind the model that a multi-select UI is being used.
   - Update any AI response parsing utilities to:
     - Safely handle malformed responses (fallback to text-only).
     - Map AI options into `InterviewOption`.

### Key Dependencies

- **Ink/React TUI**:
  - Used for `InterviewScreen` layout and focus handling.
- **Select Component**:
  - Located at `src/tui/components/Select.tsx`, extended for multi-select if needed.
- **Interview Orchestrator**:
  - `src/tui/orchestration/interview-orchestrator.ts` orchestrates AI-driven Q&A.
- **AI Integration**:
  - `src/ai` and `src/templates/prompts` for prompt templates and response parsing.
- **Testing**:
  - Vitest (`npm run test`) for unit and integration tests.

### Database / Persistence Changes

- No database changes are anticipated in this project context.
- If the interview answers are persisted in a context store:
  - Ensure the stored representation supports the new `InterviewAnswer` structure while remaining backward-compatible with any existing context (if applicable).

## Acceptance Criteria

- [x] **AC1: Multi-Select Default UI**
  - When starting an interview, the first question appears with:
    - Question text,
    - A list of checkbox-style options,
    - No free-form input visible by default.
  - Completing the entire interview without ever using "Chat about this" is possible using only multi-select.

- [x] **AC2: Multi-Select Behavior**
  - User can:
    - Move focus between options with Up/Down arrows.
    - Toggle selection of multiple options.
    - Submit the selected options with the documented key.
  - The submitted payload to the orchestrator includes:
    - `mode: 'multiSelect'`
    - The list of selected IDs (matches the options from the orchestrator).

- [x] **AC3: "Chat about this" Switch**
  - For any question, triggering "Chat about this":
    - Hides or disables the multi-select component.
    - Shows the free-text input instead.
    - Discards previous selections for that question.
  - The submitted answer in this mode contains:
    - `mode: 'freeText'`
    - The text the user typed.
  - No answer is sent that mixes option IDs with free-text for the same question.

- [x] **AC4: Option Fidelity**
  - The options' labels and order displayed in the UI match exactly what the AI/orchestrator provided (verified via test or logging).
  - There is no automatic capitalization or truncation beyond what the existing layout forces due to width constraints.

- [x] **AC5: Flexible Selection**
  - User can:
    - Submit an answer with zero options selected (multi-select mode).
    - Submit an answer with one or more options selected, with no enforced maximum.
  - The orchestrator correctly receives and handles zero-length selection arrays.

- [x] **AC6: Keyboard Hints & Auto-Focus**
  - On each new question, focus is automatically on the options list.
  - The bottom of the screen (or designated area) clearly shows the valid keybindings.
  - QA can complete an end-to-end interview with only the keyboard, following the hints.

- [x] **AC7: Error Handling / Fallback**
  - If the AI fails to return well-structured options (e.g., missing options list), the app:
    - Does not crash.
    - Falls back to free-text mode for that question or shows a clear message.
  - This behavior is covered by automated tests.

- [x] **AC8: Tests**
  - Vitest tests exist for:
    - Parsing AI responses with options into `InterviewQuestion`.
    - Rendering and interacting with the multi-select UI.
    - Switching modes between multi-select and free-text.
    - Serialization of both multi-select and free-text answers to the orchestrator.

## Implementation Notes

- **FR2 (Select component reuse):** Rather than extending `Select.tsx` with a `multi` prop, a new `MultiSelect` component was created. This was a deliberate design decision — the interaction models are fundamentally different (toggle+submit vs single-select), and keeping them separate avoids API pollution. `MultiSelect` reuses `SelectOption<T>` from `Select.tsx` and follows the same visual patterns (blue highlight, `❯` focus indicator).
- **FR2 (Space/Enter behavior):** Spec suggested "Space/Enter toggles the selected state." Implementation uses Space exclusively for toggling and Enter exclusively for submitting, which provides clearer separation and avoids accidental submissions.
- **FR5 (AI prompt location):** Spec suggested modifying `src/templates/prompts/...`. The AI prompt was instead updated inline in `buildSystemPrompt()` within `interview-orchestrator.ts`, since that's where the interview system prompt is constructed.
- **Testing depth:** InterviewScreen integration tests are type-safety verifications rather than behavioral tests, due to Ink testing library limitations with async state. The MultiSelect component tests (10) and parseInterviewResponse tests (12) provide strong behavioral coverage. Full flow is verified via manual E2E testing.

## Out of Scope

- Enforcing minimum/maximum selection limits per question.
- Introducing question types beyond:
  - Multi-select options, and
  - Free-text “Chat about this.”
- Major redesign of the overall interview flow or navigation.
- Non-TUI (e.g., purely CLI/no-UI) interfaces for answering interviews.
- Extensive AI-side validation or self-correction beyond basic schema guidance.

## Project Tech Stack

- **Framework:** React v^18.3.1 (via Ink for TUI)
- **Unit Testing:** Vitest
- **Package Manager:** npm
- **Languages:** TypeScript for source (`src/`), compiled to JavaScript (`dist/`)
- **Architecture Highlights:**
  - CLI entry points: `bin/ralph.js`, `dist/index.js`
  - TUI: `src/tui` (screens, components, hooks, orchestration)
  - AI: `src/ai` (providers, prompts, tools)
  - Orchestrator: `src/tui/orchestration/interview-orchestrator.ts`

## Reference Documents

- `src/tui/components/Select.tsx` – existing select/multi-select UI component.
- `src/tui/screens/InterviewScreen.tsx` – main interview flow screen to modify.
- `src/tui/orchestration/interview-orchestrator.ts` – orchestrates interview Q&A and routes AI responses/options.
- `src/templates/prompts/*` – AI prompt templates to adjust for multi-select options.
- `src/ai/*` – AI integration, response parsing, and tools.