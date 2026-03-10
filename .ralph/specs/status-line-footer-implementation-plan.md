# Status Line Footer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the status/provider info from above the input prompt to a persistent footer below it on all interactive TUI screens, using a Claude Code-style layout.

**Architecture:** Create a new `FooterStatusBar` component that wraps the existing `StatusLine` with a horizontal separator above it. Each interactive screen (MainShell, InterviewScreen, InitScreen, RunScreen) gets its layout restructured so the order is: content → input → footer. The `StatusLine` component itself stays unchanged—only its position in the component tree moves.

**Tech Stack:** React 18 + Ink (TUI), Vitest for tests, TypeScript

**Spec:** .ralph/specs/status-line-footer.md
**Branch:** feat/status-line-footer
**Status:** Planning

---

## Tasks

### Task 1: Create FooterStatusBar component with test

**Files:**
- Create: `src/tui/components/FooterStatusBar.tsx`
- Test: `src/tui/components/FooterStatusBar.test.ts`
- Modify: `src/tui/components/index.ts` (add export)

**Step 1: Write the failing test**

Create `src/tui/components/FooterStatusBar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// We test the module exports and basic construction.
// Ink component rendering requires ink-testing-library; we verify
// the module shape and that the component is a function.

describe('FooterStatusBar', () => {
  it('exports FooterStatusBar as a function component', async () => {
    const mod = await import('./FooterStatusBar.js');
    expect(typeof mod.FooterStatusBar).toBe('function');
  });

  it('exports FooterStatusBarProps type (module loads without error)', async () => {
    // Type-only export: just ensure the module loads cleanly
    const mod = await import('./FooterStatusBar.js');
    expect(mod).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tui/components/FooterStatusBar.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/tui/components/FooterStatusBar.tsx`:

```tsx
/**
 * FooterStatusBar - Persistent footer with separator and status line
 *
 * Wraps the existing StatusLine component with a horizontal separator
 * to create a Claude Code-style footer bar at the bottom of TUI screens.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { StatusLine, type StatusLineProps } from './StatusLine.js';
import { colors } from '../theme.js';

/**
 * Props for the FooterStatusBar component.
 * Passes through all StatusLine props directly.
 */
export interface FooterStatusBarProps extends StatusLineProps {}

/**
 * Horizontal separator character (box drawing light horizontal)
 */
const SEPARATOR_CHAR = '\u2500';

/**
 * FooterStatusBar component
 *
 * Renders a full-width horizontal separator line followed by the existing
 * StatusLine component. Designed to be placed at the bottom of each
 * interactive TUI screen, below the input prompt.
 *
 * @example
 * ```tsx
 * <FooterStatusBar
 *   action="New Spec"
 *   phase="Context (1/4)"
 *   path="my-feature"
 * />
 * ```
 */
export function FooterStatusBar(props: FooterStatusBarProps): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%">
      {/* Horizontal separator */}
      <Box width="100%">
        <Text color={colors.separator}>
          {SEPARATOR_CHAR.repeat(80)}
        </Text>
      </Box>

      {/* Status row - delegates to existing StatusLine */}
      <StatusLine {...props} />
    </Box>
  );
}
```

**Step 4: Add export to index.ts**

In `src/tui/components/index.ts`, add after the StatusLine export:

```ts
export { FooterStatusBar } from './FooterStatusBar.js';
export type { FooterStatusBarProps } from './FooterStatusBar.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/tui/components/FooterStatusBar.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/tui/components/FooterStatusBar.tsx src/tui/components/FooterStatusBar.test.ts src/tui/components/index.ts
git commit -m "feat(tui): add FooterStatusBar component with separator + status line"
```

---

### Task 2: Move status to footer in InterviewScreen

**Files:**
- Modify: `src/tui/screens/InterviewScreen.tsx`

**Context:** Currently the InterviewScreen layout is (lines 339-390):
```
<Box flexDirection="column" padding={1}>
  <StatusLine ... />          ← REMOVE from here
  {error}
  <MessageList ... />
  {working indicator}
  {completion message}
  {ChatInput ...}             ← INPUT stays here
</Box>
```

The target layout is:
```
<Box flexDirection="column" padding={1}>
  {error}
  <MessageList ... />
  {working indicator}
  {completion message}
  {ChatInput ...}
  <FooterStatusBar ... />     ← ADD here (after input)
</Box>
```

**Step 1: Update imports**

In `InterviewScreen.tsx`, change:
```ts
import { StatusLine } from '../components/StatusLine.js';
```
to:
```ts
import { FooterStatusBar } from '../components/FooterStatusBar.js';
```

**Step 2: Move the status line to footer position**

Remove the `<StatusLine>` block at line 342-346 and add `<FooterStatusBar>` after the ChatInput/completion section (before the closing `</Box>`):

Replace the JSX return (lines 339-390) with:

```tsx
return (
  <Box flexDirection="column" padding={1}>
    {/* Error display */}
    {state.error && (
      <Box marginY={1}>
        <Text color={theme.colors.error}>Error: {state.error}</Text>
      </Box>
    )}

    {/* Conversation history - inline, conversational flow */}
    <Box marginY={1}>
      <MessageList messages={state.messages} toolCallsExpanded={toolCallsExpanded} />
    </Box>

    {/* Working indicator when AI is processing - always yellow */}
    {state.isWorking && (
      <Box marginY={1}>
        <WorkingIndicator
          state={workingState}
          variant="active"
        />
      </Box>
    )}

    {/* Completion message - full summary added to thread by App */}
    {state.phase === 'complete' && (
      <Box flexDirection="row">
        <Text color={theme.colors.success}>{theme.chars.bullet} </Text>
        <Text>Specification complete.</Text>
      </Box>
    )}

    {/* User input area */}
    {state.phase !== 'complete' && (
      <Box marginTop={1}>
        <ChatInput
          onSubmit={handleSubmit}
          disabled={inputDisabled}
          allowEmpty={state.phase === 'context'}
          placeholder={getPlaceholder()}
        />
      </Box>
    )}

    {/* Footer status bar */}
    <FooterStatusBar
      action="New Spec"
      phase={phaseString}
      path={featureName}
    />
  </Box>
);
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/tui/screens/InterviewScreen.tsx
git commit -m "feat(tui): move status to footer in InterviewScreen"
```

---

### Task 3: Move status to footer in InitScreen

**Files:**
- Modify: `src/tui/screens/InitScreen.tsx`

**Context:** Currently the InitScreen layout is (lines 578-595):
```
<Box flexDirection="column" padding={1}>
  <StatusLine ... />          ← REMOVE from here
  <Box marginTop={1}>        ← scan summary
  <Box marginTop={1}>        ← phase content
</Box>
```

The target layout is:
```
<Box flexDirection="column" padding={1}>
  <Box marginTop={1}>        ← scan summary
  <Box marginTop={1}>        ← phase content
  <FooterStatusBar ... />     ← ADD here
</Box>
```

**Step 1: Update imports**

Change:
```ts
import { StatusLine } from '../components/StatusLine.js';
```
to:
```ts
import { FooterStatusBar } from '../components/FooterStatusBar.js';
```

**Step 2: Restructure the JSX**

Replace the return block (lines 578-595) with:

```tsx
return (
  <Box flexDirection="column" padding={1}>
    {/* Scan summary */}
    <Box marginTop={1}>
      {renderScanSummary()}
    </Box>

    {/* Phase-specific content */}
    <Box marginTop={1}>{renderPhaseContent()}</Box>

    {/* Footer status bar */}
    <FooterStatusBar
      action="Initialize Project"
      phase={phaseString}
      path={projectRoot}
    />
  </Box>
);
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/tui/screens/InitScreen.tsx
git commit -m "feat(tui): move status to footer in InitScreen"
```

---

### Task 4: Move status to footer in RunScreen

**Files:**
- Modify: `src/tui/screens/RunScreen.tsx`

**Context:** Currently the RunScreen layout is (lines 319-403):
```
<Box flexDirection="column" padding={1}>
  <StatusLine ... />          ← REMOVE from here
  {error}
  {progress content}
  {confirm dialog}
</Box>
```

The target layout is:
```
<Box flexDirection="column" padding={1}>
  {error}
  {progress content}
  {confirm dialog}
  <FooterStatusBar ... />     ← ADD here
</Box>
```

**Step 1: Update imports**

Change:
```ts
import { StatusLine } from '../components/StatusLine.js';
```
to:
```ts
import { FooterStatusBar } from '../components/FooterStatusBar.js';
```

**Step 2: Restructure the JSX**

Replace the return block (lines 319-403) with:

```tsx
return (
  <Box flexDirection="column" padding={1}>
    {error && (
      <Box marginTop={1}>
        <Text color={theme.colors.error}>Error: {error}</Text>
      </Box>
    )}

    {!error && (
      <>
        <Box marginTop={1} flexDirection="row">
          <Text>Phase: </Text>
          <Text color={colors.yellow}>{phaseLine}</Text>
          <Text dimColor>{theme.statusLine.separator}</Text>
          <Text>Iter: </Text>
          <Text color={colors.green}>{status.iteration}</Text>
          <Text dimColor>/{status.maxIterations || maxIterationsRef.current || '-'}</Text>
          <Text dimColor>{theme.statusLine.separator}</Text>
          <Text>Branch: </Text>
          <Text color={colors.blue}>{branch}</Text>
        </Box>

        <Box marginTop={1} flexDirection="row">
          <Text>Tokens: </Text>
          <Text color={colors.pink}>{formatNumber(totalTokens)}</Text>
          <Text dimColor> (in:{formatNumber(status.tokensInput)} out:{formatNumber(status.tokensOutput)})</Text>
          <Text dimColor>{theme.statusLine.separator}</Text>
          <Text dimColor>Elapsed: {formatDuration(startTimeRef.current)}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text bold>Implementation:</Text>
            <ProgressBar percent={percentTasks} />
            <Text>{percentTasks}%</Text>
            <Text color={colors.green}>✓ {tasks.tasksDone}</Text>
            <Text color={colors.yellow}>○ {tasks.tasksPending}</Text>
          </Box>

          {totalE2e > 0 && (
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Text bold>E2E Tests:</Text>
              <ProgressBar percent={percentE2e} />
              <Text>{percentE2e}%</Text>
              <Text color={colors.green}>✓ {tasks.e2eDone}</Text>
              <Text color={colors.yellow}>○ {tasks.e2ePending}</Text>
            </Box>
          )}

          <Box flexDirection="row" alignItems="center" gap={1} marginTop={1}>
            <Text bold>Overall:</Text>
            <ProgressBar percent={percentAll} />
            <Text>{percentAll}%</Text>
            <Text color={colors.green}>✓ {doneAll}</Text>
            <Text color={colors.yellow}>○ {totalAll - doneAll}</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Tip: /monitor {featureName} in another terminal for details</Text>
        </Box>
        <Box>
          <Text dimColor>Press Ctrl+C to stop the loop</Text>
        </Box>
      </>
    )}

    {showConfirm && (
      <Box marginTop={1}>
        <Confirm
          message={stopRequestedRef.current ? 'Stopping loop...' : 'Stop the feature loop?'}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          initialValue={false}
        />
      </Box>
    )}

    {/* Footer status bar */}
    <FooterStatusBar
      action="Run Loop"
      phase={phaseLine}
      path={featureName}
    />
  </Box>
);
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/tui/screens/RunScreen.tsx
git commit -m "feat(tui): move status to footer in RunScreen"
```

---

### Task 5: Add footer to MainShell

**Files:**
- Modify: `src/tui/screens/MainShell.tsx`

**Context:** MainShell doesn't use `StatusLine` directly. It has its own inline status bar at lines 292-298:
```tsx
<Box marginBottom={1}>
  <Text dimColor>
    {sessionState.provider ? `${sessionState.provider}/${sessionState.model}` : 'No provider configured'}
  </Text>
  <Text dimColor> │ Type /help for commands</Text>
</Box>
```

Per spec, this provider/model display should move to the footer. The header line ("Wiggum Interactive Mode │ Ready") should remain at the top.

**Step 1: Add import**

Add to imports in `MainShell.tsx`:
```ts
import { FooterStatusBar } from '../components/FooterStatusBar.js';
```

**Step 2: Remove old inline status bar and add footer**

Remove the status bar `<Box marginBottom={1}>` block at lines 292-298.

Add `<FooterStatusBar>` after the ChatInput block (before the closing `</Box>`):

Replace the return block (lines 279-369) with:

```tsx
return (
  <Box flexDirection="column" padding={1}>
    {/* Header */}
    <Box marginBottom={1}>
      <Text color={colors.yellow} bold>Wiggum Interactive Mode</Text>
      <Text dimColor> │ </Text>
      {sessionState.initialized ? (
        <Text color={colors.green}>Ready</Text>
      ) : (
        <Text color={colors.orange}>Not initialized - run /init</Text>
      )}
    </Box>

    {/* Message history */}
    {messages.length > 0 && (
      <Box marginY={1} flexDirection="column">
        <MessageList messages={messages} />
      </Box>
    )}

    {/* Sync UI */}
    {syncStatus !== 'idle' && (
      <Box marginY={1} flexDirection="column" gap={1}>
        {syncStatus === 'running' && (
          <WorkingIndicator
            state={{
              isWorking: true,
              status: 'Syncing project context…',
            }}
          />
        )}

        <ActionOutput
          actionName="Sync"
          description="Project context"
          status={
            syncStatus === 'running'
              ? 'running'
              : syncStatus === 'success'
                ? 'success'
                : 'error'
          }
          output={
            syncStatus === 'running'
              ? 'Scanning + AI analysis…'
              : syncStatus === 'success'
                ? 'Updated .ralph/.context.json'
                : undefined
          }
          error={syncStatus === 'error' ? (syncError?.message || 'Unknown error') : undefined}
          previewLines={2}
        />

        {syncStatus === 'success' && (
          <Box marginTop={1} flexDirection="column">
            <Box flexDirection="row">
              <Text color={colors.green}>{theme.chars.bullet} </Text>
              <Text>Done. Project context updated.</Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text bold>What's next:</Text>
              <Box flexDirection="row" gap={1}>
                <Text color={colors.green}>›</Text>
                <Text color={colors.blue}>/new {'<feature>'}</Text>
                <Text dimColor>Create a feature specification</Text>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    )}

    {/* Input */}
    <Box marginTop={1}>
      <ChatInput
        onSubmit={handleSubmit}
        disabled={false}
        placeholder="Enter command or type /help..."
        onCommand={(cmd) => handleSubmit(`/${cmd}`)}
      />
    </Box>

    {/* Footer status bar */}
    <FooterStatusBar
      action={sessionState.provider ? `${sessionState.provider}/${sessionState.model}` : 'No provider'}
      phase={sessionState.initialized ? 'Ready' : 'Not initialized'}
      path="/help for commands"
    />
  </Box>
);
```

**Note on MainShell footer content:** The spec requires the footer format `openai/gpt-5.1 │ Ready │ /help for commands`. Since `StatusLine` renders `action │ phase │ path`, we map:
- `action` → provider/model string
- `phase` → readiness state
- `path` → help hint

This reuses `StatusLine` without any changes to its logic.

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/tui/screens/MainShell.tsx
git commit -m "feat(tui): add footer status bar to MainShell, remove old inline status"
```

---

### Task 6: Verify thread history StatusLine usages are unaffected

**Files:**
- Review: `src/tui/app.tsx` (lines 315-321 and 513-519)

**Context:** `app.tsx` uses `StatusLine` in thread history summaries (spec-complete and run-complete). These are **not** interactive screens — they're static thread items rendered in `<Static>`. The spec says "Non-interactive screens (e.g., simple progress-only views) must not be forced to use this footer." These usages should stay as-is.

**Step 1: Verify no changes needed**

Read `src/tui/app.tsx` and confirm:
- Line 25: `import { StatusLine } from './components/StatusLine.js';` — keep this import
- Lines 317-321: `<StatusLine action="New Spec" .../>` inside spec-complete summary — keep as-is
- Lines 515-519: `<StatusLine action="Run Loop" .../>` inside run-complete summary — keep as-is

No code changes needed. This is a verification step.

**Step 2: Run all tests to confirm nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit (no-op or skip)**

No commit needed — this is a verification step.

---

### Task 7: Run full test suite and verify build

**Files:**
- None (verification only)

**Step 1: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run TypeScript type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit (if any fixes were needed)**

If fixes were needed, commit them:
```bash
git add -A
git commit -m "fix(tui): address type/test issues from footer migration"
```

---

### Task 8: Manual visual verification checklist

This is a manual testing task. Run the CLI and verify each screen:

**Step 1: Start the TUI**

Run: `npx tsx src/index.ts --tui` (or however the CLI starts)

**Step 2: Verify MainShell footer**

- [ ] Footer visible at bottom: separator line + `provider/model │ Ready │ /help for commands`
- [ ] No status bar appears above the input prompt
- [ ] Input prompt still works (type `/help`, press Enter)
- [ ] The old inline status bar (provider/model line) is gone from above input

**Step 3: Verify InitScreen footer**

- [ ] Run `/init` — InitScreen shows footer at bottom
- [ ] Footer: `Initialize Project │ Scanning (1/N) │ /path/to/project`
- [ ] StatusLine no longer appears above scan summary
- [ ] Phase transitions update footer content

**Step 4: Verify InterviewScreen footer**

- [ ] Run `/new test-feature` — InterviewScreen shows footer
- [ ] Footer: `New Spec │ Context (1/4) │ test-feature`
- [ ] StatusLine no longer appears above conversation
- [ ] Conversation flows directly into input prompt

**Step 5: Verify RunScreen footer**

- [ ] Run `/run test-feature` (with existing spec) — RunScreen shows footer
- [ ] Footer: `Run Loop │ Starting... │ test-feature`
- [ ] StatusLine no longer appears above progress bars

**Step 6: Verify thread history (completions)**

- [ ] After completing a spec: thread summary still shows `StatusLine` inline (not as footer)
- [ ] After completing a run: thread summary still shows `StatusLine` inline

**Step 7: Narrow terminal test**

- [ ] Resize terminal to ~40 columns wide
- [ ] Footer text wraps to multiple lines without crashes
- [ ] Separator line remains visible
- [ ] Input and content above remain usable

---

## Done
- [x] Codebase analysis and plan creation
- [x] Task 1: Create FooterStatusBar component with test (commit: 5e0e4c8)
- [x] Task 2: Move status to footer in InterviewScreen (commit: 66c5819)
- [x] Task 3: Move status to footer in InitScreen (commit: 4735475)
- [x] Task 4: Move status to footer in RunScreen (commit: eecaea6)
- [x] Task 5: Add footer to MainShell (commit: dc11d8f)
- [x] Task 6: Verify thread history StatusLine usages are unaffected (verified 2026-02-05)
- [x] Task 7: Run full test suite and verify build (all tests pass, build successful, 2026-02-05)
- [ ] Task 8: Manual visual verification checklist (requires manual testing)
</content>
</invoke>