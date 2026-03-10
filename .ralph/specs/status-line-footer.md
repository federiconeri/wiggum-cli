# status-line-footer Feature Specification

**Status:** Planned  
**Version:** 1.0  
**Last Updated:** 2026-02-05  

## Purpose

Move the existing status/provider information from above the input prompt to a persistent, full-width footer below it on all interactive TUI screens, using a Claude Code-style layout. This creates a cleaner conversation flow, keeps the thread history visually connected, and moves low-priority status information to the periphery.

## User Stories

- As a user, I want the provider/model status to appear in a compact footer below the input so that my focus remains on the conversation content and prompt.
- As a user, I want a consistent footer across all interactive TUI screens so that I can always see which provider/model is active and how to get help.
- As a user, I want the conversation history to flow directly into the input prompt with minimal visual clutter so that the terminal feels more like modern chat/code UIs (e.g., Claude Code).
- As a user, I want the footer to be stable and visible at the bottom of the screen while I scroll so that I always have context and help hints available.

## Requirements

### Functional Requirements

1. **Footer presence on all interactive TUI screens**
   - [ ] The status/provider info must be rendered as a footer on all interactive TUI screens, including at least:
     - `MainShell`
     - `InterviewScreen`
     - `InitScreen`
     - `RunScreen`
     - Any other screen that currently uses `StatusLine` for interactive workflows.
   - [ ] Non-interactive screens (e.g., simple progress-only views) must not be forced to use this footer unless they currently show `StatusLine`.

   **Acceptance Criteria**
   - [ ] Launch the CLI and navigate through MainShell, InterviewScreen, InitScreen, and RunScreen; on each, a footer is visible at the bottom of the terminal.
   - [ ] On any screen that previously used `StatusLine`, that status is no longer displayed above the input prompt.
   - [ ] On screens that never used `StatusLine`, there is no new footer unless explicitly added as part of this feature.

2. **Footer layout and structure**
   - [ ] The vertical layout near the bottom of all interactive screens must be:

     1. Conversation/history or content area (scrollable).
     2. Input prompt line, unchanged (e.g., `› Enter command or type /help...`).
     3. A subtle, full-width horizontal separator line.
     4. A status row showing: `<provider/model> │ <readiness> │ <help hint>`, e.g.,  
        `openai/gpt-5.1 │ Ready │ /help for commands`.

   - [ ] The footer (separator + status row) must span the full terminal width as a global status bar, regardless of whether the screen has multiple panes/columns above.
   - [ ] The input prompt’s text, position relative to content above, and behavior must remain unchanged, aside from the status no longer being displayed above it.

   **Acceptance Criteria**
   - [ ] On each relevant screen, visually confirm the order: content → input prompt → horizontal line → status row.
   - [ ] The status row includes provider/model, readiness, and `/help for commands` separated by `│` characters.
   - [ ] The footer extends to the right edge of the terminal; no part of the screen content is rendered below the footer.
   - [ ] The input prompt placeholder text and behavior match the current implementation (no copy or interaction changes).

3. **Footer behavior and stickiness**
   - [ ] The footer must remain visible and “sticky” at the bottom of the viewport while the content above can scroll.
   - [ ] Scrolling (via existing mechanisms) must only affect the conversation/content area, not the footer.

   **Acceptance Criteria**
   - [ ] When enough content is produced to require scrolling, scrolling up/down does not move or hide the footer; it remains at the bottom of the terminal window.
   - [ ] No part of the conversation history ever renders below the footer.
   - [ ] There are no visual gaps between the input, separator, status line, and bottom edge of the terminal.

4. **StatusLine content and logic reuse**
   - [ ] The existing `StatusLine` component must remain the single source of truth for status content and formatting (provider, model, readiness, and help hint).
   - [ ] The footer may wrap `StatusLine` in a new layout component (e.g., `FooterStatusBar`) but should not duplicate logic for determining provider, readiness, or help text.
   - [ ] Any props or context used by `StatusLine` in its previous position must still be correctly provided in the footer context.

   **Acceptance Criteria**
   - [ ] The values and labels shown in the footer match what `StatusLine` previously showed (same provider/model string, same readiness representation, same help hint).
   - [ ] Changing providers or models via existing mechanisms updates the footer content as expected.
   - [ ] Disabling or misconfiguring providers continues to be reflected correctly in the footer, consistent with current `StatusLine` behavior.

5. **Responsive behavior on narrow terminals**
   - [ ] If the terminal width is too small to fit the entire footer status text on one line, it is acceptable for the content to wrap onto a second line.
   - [ ] Wrapping must not cause exceptions, layout breaks, or misalignment of other components.
   - [ ] The horizontal separator must remain a single visible row; the status text may occupy one or more rows below it.

   **Acceptance Criteria**
   - [ ] Manually resize the terminal to a narrow width such that `openai/gpt-5.1 │ Ready │ /help for commands` cannot fit on one line; verify that:
     - [ ] The text wraps to multiple lines.
     - [ ] No rendering errors occur.
     - [ ] Input prompt and content area remain properly aligned and usable.
   - [ ] In a wide terminal, the footer content renders on a single line (given typical provider/model string lengths).

### Non-Functional Requirements

- [ ] **Performance:** The new footer layout must not introduce noticeable lag or flicker in TUI updates. Rendering should adhere to existing Ink best practices (no heavy computation in render).
- [ ] **Consistency:** The footer must use existing TUI typography and color styles as much as possible (e.g., same text color and emphasis convention as the current `StatusLine`).
- [ ] **Maintainability:** The footer layout must be encapsulated in a reusable component or clearly structured pattern to avoid copy-pasted layouts across screens.
- [ ] **Backward Compatibility:** Non-TUI command flows and non-interactive screens should not be visually or behaviorally affected by this change.

## Technical Notes

### Relevant Project Files

- Entry & TUI:
  - `src/index.ts` – CLI entry / TUI bootstrap.
  - `src/tui/app.tsx` – Main Ink app composition.
- Status component:
  - `src/tui/components/StatusLine.tsx` – Existing status/provider display component.
- Screens likely needing layout updates:
  - `src/tui/screens/MainShell.tsx`
  - `src/tui/screens/InterviewScreen.tsx`
  - `src/tui/screens/InitScreen.tsx`
  - `src/tui/screens/RunScreen.tsx`
  - (Any other screen that imports and renders `StatusLine`.)

### Proposed Implementation Approach

1. **Introduce a footer layout component**
   - Create a new component, e.g., `src/tui/components/FooterStatusBar.tsx`:
     - Responsibilities:
       - Render a full-width horizontal separator line.
       - Render the existing `<StatusLine />` directly underneath.
     - Example structure (pseudocode):

       ```tsx
       import React from 'react';
       import { Box, Text } from 'ink';
       import { StatusLine } from './StatusLine';

       export const FooterStatusBar: React.FC = () => {
         return (
           <Box flexDirection="column" width="100%">
             {/* Separator */}
             <Box width="100%">
               <Text>
                 {/* Could be smarter: repeat "─" to approximate width, or just a long string */}
                 {'─'.repeat(80)}
               </Text>
             </Box>

             {/* Status row */}
             <StatusLine />
           </Box>
         );
       };
       ```

     - Consider using a simple fixed-length separator (e.g., 80–120 `─` characters). Ink does not directly expose terminal width without additional logic; for MVP the line just needs to be visually clear and roughly full width. If there is already a layout helper for full-width lines, reuse it instead of custom logic.

2. **Standardize screen-level layout to support a sticky footer**
   - For each interactive screen (MainShell, InterviewScreen, InitScreen, RunScreen, etc.):
     - Ensure the top-level component uses something like:

       ```tsx
       <Box flexDirection="column" height="100%">
         <Box flexGrow={1} flexDirection="column">
           {/* conversation / history / screen content */}
         </Box>

         {/* Input prompt area (unchanged) */}
         <Box>
           {/* existing input component */}
         </Box>

         {/* New footer */}
         <FooterStatusBar />
       </Box>
       ```

     - Key points:
       - `height="100%"` on the root box allows us to model a sticky footer within the vertical flex layout.
       - The content area uses `flexGrow={1}` so it takes all remaining space above input and footer.
       - The input area remains in its current styling and composition, just placed before the footer in the JSX tree.
       - The footer has `width="100%"` and does not grow.

3. **Relocate StatusLine from above input to footer**
   - In each screen that currently renders `StatusLine`:
     - Remove the existing `StatusLine` where it appears above the input (or in any previous location).
     - Add `<FooterStatusBar />` at the bottom of the main layout (after the input prompt component).
   - Example pattern for `MainShell` (simplified):

     ```tsx
     // Before: StatusLine above input
     <Box flexDirection="column">
       <StatusLine />
       <History />
       <Input />
     </Box>

     // After: footer below input
     <Box flexDirection="column" height="100%">
       <Box flexGrow={1} flexDirection="column">
         <History />
       </Box>
       <Input />
       <FooterStatusBar />
     </Box>
     ```

4. **Preserve StatusLine behavior**
   - Do not change the core logic of `StatusLine`:
     - It should still derive provider/model, readiness, and help hint as before.
     - If `StatusLine` currently uses hooks or context from parent components (e.g., provider state, session state), confirm that these are still accessible from the footer position. If necessary, lift providers/context to wrap the entire screen to ensure `FooterStatusBar` has access.
   - If formatting changes are required to match the exact desired pattern (e.g., ensure `provider/model │ Ready │ /help for commands`), implement them in `StatusLine` itself so all usages remain consistent.

5. **Handle wrapping gracefully**
   - Rely on Ink’s default wrapping behavior:
     - Avoid manual string truncation unless a helper already exists to do this consistently.
     - Ensure `StatusLine` is rendered inside a `<Box width="100%">` to let Ink wrap text naturally within the available width.
   - Confirm visually on small terminal sizes that wrapping does not overlap or push other components in unexpected ways.

6. **Testing & regression checks**
   - Unit tests:
     - If there are existing tests for `StatusLine`, ensure they remain valid (may need to update snapshots if layout context changed).
     - Add simple tests for `FooterStatusBar` (if used) to verify it renders a separator and an instance of `StatusLine`.
   - Manual checks:
     - Run through each interactive screen and verify layout and behavior against acceptance criteria.
   - Vitest:
     - Ensure `npm run test` passes after changes; add/update tests as needed.

### Key Dependencies & Considerations

- **React & Ink**
  - Components: `Box`, `Text`, and existing TUI primitives.
  - Ensure flex layouts (`flexDirection`, `flexGrow`, `height`) are used consistently so screens behave well across different terminal sizes.
- **Session and Provider State**
  - `StatusLine` likely depends on provider/session state from the AI layer (e.g., `src/ai/providers`, `src/ai/conversation`, `src/repl/SessionState`).
  - Confirm that moving it into the footer does not break this state wiring. If `StatusLine` relied on being in a specific subtree, adjust the placement of providers or move the footer inside that subtree.

## Acceptance Criteria

- [ ] On MainShell, the status/provider info no longer appears above the input; instead, the bottom of the screen shows:
  - [ ] Conversation/history area.
  - [ ] Input prompt line (unchanged).
  - [ ] A horizontal separator.
  - [ ] `openai/<model> │ Ready │ /help for commands` rendered as a footer.
- [ ] On InterviewScreen, InitScreen, and RunScreen, the same footer structure appears at the bottom of the terminal with accurate provider/model and readiness state.
- [ ] The footer spans the full width of the terminal; there is no additional UI below it.
- [ ] The input prompt text and behavior are unchanged; user interaction with the prompt works exactly as before.
- [ ] When the terminal is resized narrower:
  - [ ] The separator remains a clear horizontal line.
  - [ ] Footer content may wrap to multiple lines without visual corruption or runtime errors.
  - [ ] The footer remains pinned to the bottom and does not scroll.
- [ ] Status changes (e.g., switching providers/models, readiness state changes) are reflected in the footer exactly as they were in the old `StatusLine` location.
- [ ] All existing tests pass (`npm run test`), and any new tests for `FooterStatusBar`/layout pass.
- [ ] No regressions are observed in non-interactive CLI flows or screens that do not use `StatusLine`.

## Out of Scope

- Adding new fields or dynamic behaviors to `StatusLine` (e.g., latency indicators, token usage).
- Introducing new keyboard shortcuts or commands beyond the existing `/help for commands` hint.
- Major visual restyling or theming changes outside the minimal layout/separator adjustments required for the footer.
- Modifying non-TUI terminal output or logging behavior.

## Project Tech Stack

- **Framework:** React v^18.3.1 (with Ink for TUI)
- **Unit Testing:** Vitest
- **Package Manager:** npm