# add-activity-feed Implementation Plan

**Spec:** .ralph/specs/add-activity-feed.md
**Branch:** feat/add-activity-feed
**Status:** Completed

## Tasks

### Phase 1: Setup & Parsing Utilities

- [x] Add `formatRelativeTime(timestamp: number): string` helper to `src/tui/utils/loop-status.ts` - [complexity: S]
  - Pure function: given epoch ms, return relative string ("30s ago", "2m ago", "1h ago")
  - No external dependency (no `date-fns`) — simple arithmetic is sufficient for this use case

- [x] Add `ActivityEvent` type and `parseLoopLog(logPath: string, since?: number): ActivityEvent[]` to `src/tui/utils/loop-status.ts` - [complexity: M]
  - `ActivityEvent`: `{ timestamp: number; message: string; status: 'success' | 'error' | 'in-progress' }`
  - Read the loop log file (`/tmp/ralph-loop-<feature>.log`)
  - Parse each line: extract timestamp from log prefixes (e.g., `======` phase banners, `Iteration N`, `echo` lines); use file mtime as fallback
  - Infer status via keyword matching:
    - success: `completed`, `passed`, `success`, `approved`, `All implementation tasks completed`
    - error: `ERROR`, `failed`, `FAILED`, `failure`
    - in-progress: everything else (default)
  - Return structured events sorted by timestamp ascending

- [x] Add `parsePhaseChanges(feature: string, lastKnownPhases?: PhaseInfo[]): ActivityEvent[]` to `src/tui/utils/loop-status.ts` - [complexity: M]
  - Read `/tmp/ralph-loop-<feature>.phases` (already parsed by `build-run-summary.ts`)
  - Compare current phases to `lastKnownPhases` and emit events for newly completed/started phases
  - E.g., "Planning phase completed", "Implementation phase started"

### Phase 2: Core Component

- [x] Create `src/tui/components/ActivityFeed.tsx` — presentational component - [complexity: M]
  - Props: `{ events: ActivityEvent[]; maxEvents?: number }`
  - Default `maxEvents` = 10 (per spec)
  - Render a vertical list: each row shows `<relative-time>  <status-icon> <message>`
  - Color-code by status: green (success), red/pink (error), yellow (in-progress) — using `colors` from `theme.ts`
  - Status icons: `✓` (success), `✗` (error), `◐` (in-progress) — from `phase` constants in `theme.ts`
  - Auto-scroll: slice from `events.slice(-maxEvents)` so newest events are always at the bottom
  - Empty state: show `<Text dimColor>No activity yet</Text>` when events array is empty
  - No interactive behavior (pure display)

### Phase 3: Integration into RunScreen

- [x] Add `useActivityFeed` hook or inline state in `RunScreen.tsx` to collect and merge events - [complexity: M]
  - New state: `const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])`
  - In `refreshStatus` callback, call `parseLoopLog` and `parsePhaseChanges`, merge+deduplicate, append new events
  - Use the existing poll interval (no new timer needed — reuses `POLL_INTERVAL_MS`)
  - Track `lastLogLinesCount` ref to avoid re-parsing entire log on each poll

- [x] Render `<ActivityFeed>` section in `RunScreen.tsx` layout - [complexity: S]
  - Add the `ActivityFeed` component between the progress bars and the footer (or below the progress section)
  - Only render when not in `completionSummary` or `error` state
  - Wrap in `<Box marginTop={1} flexDirection="column">` with a `<Text bold>Activity</Text>` header

### Phase 4: Tests

- [x] Write unit tests for `formatRelativeTime` in `src/tui/utils/loop-status.test.ts` - [complexity: S]
  - Test: 0s ago, 30s ago, 1m ago, 59m ago, 1h ago, etc.

- [x] Write unit tests for `parseLoopLog` in `src/tui/utils/loop-status.test.ts` - [complexity: M]
  - Test: empty/missing log file returns empty array
  - Test: typical log lines are parsed into structured events with correct status inference
  - Test: keyword matching for success/error/in-progress

- [x] Write unit tests for `parsePhaseChanges` in `src/tui/utils/loop-status.test.ts` - [complexity: S]
  - Test: returns events for newly detected phases
  - Test: handles missing phases file gracefully

- [x] Write component tests for `ActivityFeed.tsx` in `src/tui/components/ActivityFeed.test.tsx` - [complexity: M]
  - Test: renders empty state when no events
  - Test: renders last 10 events when more than 10 provided
  - Test: color-codes events by status
  - Test: displays relative timestamps

- [x] Write integration test for activity feed in `RunScreen.test.tsx` - [complexity: M]
  - Test: activity feed section appears during an active run
  - Test: activity feed does not appear when completionSummary is showing
  - Mock `parseLoopLog` and `parsePhaseChanges` to return test events

### Phase 5: Polish & Design

- [x] Verify empty state shows "No activity yet" without errors when log/status/phases files are missing - [complexity: S]
- [x] Verify activity feed does not cause excessive re-renders or flicker (visual check) - [complexity: S]
- [x] Ensure relative timestamps update on each poll cycle - [complexity: S]

## Done

- [2026-02-18] Phase 1 + Phase 2 + Phase 3 + Phase 4 (utilities, tests, component, integration): commit 91a5139
- [2026-02-18] Phase 4 integration test for RunScreen activity feed (hoisted parseLoopLog/parsePhaseChanges mocks, 4 new tests): commit e47a81d
- [2026-02-18] Phase 5 polish verification — all acceptance criteria confirmed via existing tests and code review; no code changes needed: all validations pass (680 tests, typecheck clean, build clean)
