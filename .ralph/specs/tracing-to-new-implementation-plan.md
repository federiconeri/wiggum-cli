# Tracing-to-New Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Braintrust tracing for the `/new` interview flow so all AI calls and tool invocations are visible in traces, matching the existing `/init` pattern.

**Architecture:** Add tracing lifecycle management (`initTracing`/`flushTracing`) to `InterviewScreen.tsx` via a `useEffect` hook, matching the pattern used in `InitScreen.tsx`. The AI calls in the `/new` flow already use `getTracedAI()` via `ConversationManager`, so they will automatically produce spans once `initTracing()` has been called. No changes are needed to the orchestrator or conversation manager.

**Tech Stack:** React (Ink TUI), TypeScript, Vitest, Braintrust SDK

**Spec:** `.ralph/specs/tracing-to-new.md`
**Branch:** `feat/tracing-to-new`
**Status:** Completed

---

## Analysis Summary

### What already works
- `ConversationManager.chat()` and `chatStream()` call `getTracedAI()` which internally calls `initTracing()` and wraps AI SDK with Braintrust (see `src/ai/conversation/conversation-manager.ts:259,281`)
- Tavily and Context7 tools are wired into `InterviewOrchestrator` and will produce spans automatically when tracing is active
- `initTracing()` is idempotent (guarded by `loggerInitialized` flag at `src/utils/tracing.ts:19`)

### What's missing
- `InterviewScreen.tsx` has no `initTracing()` call on mount — tracing initialization depends on `getTracedAI()` being called lazily, with no guarantee it runs before the first AI call
- `InterviewScreen.tsx` has no `flushTracing()` call on unmount — spans may be lost when user exits the interview
- No explicit lifecycle management means the trace isn't cleanly bounded to the interview session

### Pattern to follow
`InitScreen.tsx:180,200-208,240` shows the exact pattern:
```ts
// Line 180: initTracing() called before AI work
initTracing();
// Lines 200-208: AI calls wrapped in traced()
const result = await traced(async () => { ... }, { name: 'ai-analysis', type: 'task' });
// Line 240: flushTracing() in finally block
await flushTracing();
```

For InterviewScreen, we use a simpler variant (useEffect lifecycle) since the AI calls are spread across multiple user interactions rather than a single analysis run.

---

## Tasks

### Task 1: Write the failing test for tracing lifecycle in InterviewScreen

**Files:**
- Create: `src/tui/screens/InterviewScreen.test.tsx`

**Step 1: Write the test file**

This test verifies that `initTracing()` is called when the InterviewScreen mounts and `flushTracing()` is called on unmount. We mock the tracing module since we don't want actual Braintrust calls in tests.

```tsx
/**
 * Unit tests for InterviewScreen tracing lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tracing module before importing InterviewScreen
vi.mock('../../utils/tracing.js', () => ({
  initTracing: vi.fn(),
  flushTracing: vi.fn(),
}));

// Mock the useSpecGenerator hook to avoid complex setup
vi.mock('../hooks/useSpecGenerator.js', () => ({
  useSpecGenerator: () => ({
    state: {
      phase: 'context',
      messages: [],
      isWorking: false,
      awaitingInput: true,
      workingStatus: '',
      error: null,
    },
    initialize: vi.fn(),
    addMessage: vi.fn(),
    addStreamingMessage: vi.fn(),
    updateStreamingMessage: vi.fn(),
    completeStreamingMessage: vi.fn(),
    startToolCall: vi.fn(),
    completeToolCall: vi.fn(),
    setPhase: vi.fn(),
    setGeneratedSpec: vi.fn(),
    setError: vi.fn(),
    setWorking: vi.fn(),
    setReady: vi.fn(),
  }),
  PHASE_CONFIGS: {
    context: { name: 'Context', number: 1 },
    goals: { name: 'Goals', number: 2 },
    interview: { name: 'Interview', number: 3 },
    generation: { name: 'Generation', number: 4 },
    complete: { name: 'Complete', number: 5 },
  },
  TOTAL_DISPLAY_PHASES: 4,
}));

// Mock the InterviewOrchestrator
vi.mock('../orchestration/interview-orchestrator.js', () => ({
  InterviewOrchestrator: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    getPhase: vi.fn().mockReturnValue('context'),
  })),
}));

// Mock context loading
vi.mock('../../context/index.js', () => ({
  loadContext: vi.fn().mockResolvedValue(null),
  toScanResultFromPersisted: vi.fn(),
  getContextAge: vi.fn(),
}));

import React from 'react';
import { render } from 'ink-testing-library';
import { initTracing, flushTracing } from '../../utils/tracing.js';
import { InterviewScreen } from './InterviewScreen.js';

describe('InterviewScreen tracing lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls initTracing on mount', () => {
    const { unmount } = render(
      React.createElement(InterviewScreen, {
        featureName: 'test-feature',
        projectRoot: '/tmp/test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      })
    );

    expect(initTracing).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('calls flushTracing on unmount', () => {
    const { unmount } = render(
      React.createElement(InterviewScreen, {
        featureName: 'test-feature',
        projectRoot: '/tmp/test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      })
    );

    expect(flushTracing).not.toHaveBeenCalled();

    unmount();

    expect(flushTracing).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tui/screens/InterviewScreen.test.tsx`
Expected: FAIL — `initTracing` is never called (0 times, expected 1)

**Step 3: Commit the failing test**

```bash
git add src/tui/screens/InterviewScreen.test.tsx
git commit -m "test: add failing test for InterviewScreen tracing lifecycle"
```

---

### Task 2: Add tracing lifecycle to InterviewScreen

**Files:**
- Modify: `src/tui/screens/InterviewScreen.tsx` (add import + useEffect)

**Step 1: Add the tracing import**

At `src/tui/screens/InterviewScreen.tsx`, add the import after the existing imports (around line 32):

```ts
import { initTracing, flushTracing } from '../../utils/tracing.js';
```

**Step 2: Add the tracing useEffect**

Inside the `InterviewScreen` component, add a new `useEffect` right before the existing orchestrator `useEffect` (before line 114). This should be a separate effect with an empty dependency array so it runs exactly once on mount and cleanup on unmount:

```ts
  // Initialize Braintrust tracing for this interview session.
  // flushTracing is fire-and-forget (void) to avoid blocking TUI shutdown.
  useEffect(() => {
    initTracing();

    return () => {
      void flushTracing();
    };
  }, []);
```

**Step 3: Run the test to verify it passes**

Run: `npx vitest run src/tui/screens/InterviewScreen.test.tsx`
Expected: PASS — both `initTracing` (on mount) and `flushTracing` (on unmount) are called

**Step 4: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass, no regressions

**Step 5: Commit**

```bash
git add src/tui/screens/InterviewScreen.tsx
git commit -m "feat: add Braintrust tracing lifecycle to InterviewScreen"
```

---

### Task 3: Verify no duplicate tracing in orchestrator

**Files:**
- Read only: `src/tui/orchestration/interview-orchestrator.ts`
- Read only: `src/ai/conversation/conversation-manager.ts`

**Step 1: Verify no conflicting initTracing calls**

Confirm that:
1. `interview-orchestrator.ts` does NOT import or call `initTracing()` — verified in analysis (no tracing imports)
2. `conversation-manager.ts` uses `getTracedAI()` which calls `initTracing()` internally — this is fine because `initTracing()` is idempotent (guarded by `loggerInitialized` flag)
3. No other file in the `/new` flow calls `initTracing()` independently

This is a read-only verification step. No code changes needed.

**Step 2: Commit (no-op, just verification)**

No commit needed — this is a verification step.

---

### Task 4: Update spec README with implementation plan link

**Files:**
- Modify: `.ralph/specs/README.md`

**Step 1: Add implementation plan entry**

In the Active Specs table in `.ralph/specs/README.md`, add a row for `tracing-to-new`:

```markdown
| [tracing-to-new](tracing-to-new.md) | In Progress | 2026-02-05 | [tracing-to-new-implementation-plan](tracing-to-new-implementation-plan.md) |
```

Also update the spec status from "Planned" to "In Progress" in `tracing-to-new.md`.

**Step 2: Commit**

```bash
git add .ralph/specs/README.md .ralph/specs/tracing-to-new.md
git commit -m "docs: link tracing-to-new implementation plan and update status"
```

---

## Done

- [x] Task 1: Write failing test for tracing lifecycle (commit: 279cca7)
- [x] Task 2: Add tracing lifecycle to InterviewScreen (commit: bd4b6e4)
- [x] Task 3: Verify no duplicate tracing (read-only) - Verified ✓
- [x] Task 4: Update spec README (.ralph directory - local only)

## Manual Verification (Post-Implementation)

After all tasks are complete, verify manually:

1. Set `BRAINTRUST_API_KEY` and `TAVILY_API_KEY` environment variables
2. Run the CLI: `npm run dev` or built CLI
3. Start a `/new test-feature` session
4. Answer questions mentioning a library (e.g., "using React Query") to trigger Tavily
5. Check Braintrust dashboard for:
   - A new trace identifiable as a `/new` session
   - `generateText` spans from conversation.chat() calls
   - `tavily_search` tool call spans (if AI decided to use Tavily)
6. Run `/init` separately and verify its traces are unchanged
