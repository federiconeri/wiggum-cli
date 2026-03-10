# Add Activity Feed Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-19

## Purpose
Provide a live, structured activity feed in the TUI RunScreen during feature loop runs to make progress visible, readable, and demo-friendly.

## User Stories
- As a user, I want to see a live activity feed so I can understand what the loop is doing right now.
- As a demo presenter, I want events to be human-readable and color-coded so progress is easy to follow on screen.
- As a developer, I want the feed to be derived from existing loop artifacts so it works without changing loop output.

## Requirements

### Functional Requirements
- [x] Parse the loop log (`/tmp/ralph-loop-<feature>.log`) into structured events containing: `timestamp`, `message`, and `status` (success/error/in-progress).
- [x] Augment activity with `.status` and `.phases` data to surface current phase/task context as events when changes are detected.
- [x] Display a live activity feed in `RunScreen` showing the **last 10 events**.
- [x] Auto-scroll the feed to the newest event whenever new entries are added.
- [x] Display **relative timestamps only** (e.g., "2m ago").
- [x] Color-code events based on keyword inference:
  - success → green
  - error → red (pink in theme, consistent with codebase convention)
  - in-progress/other → yellow
- [x] Maintain backward compatibility with existing loop log output (no required format changes).

### Non-Functional Requirements
- [x] Feed updates should be non-blocking and responsive (no UI freeze).
- [x] Gracefully handle missing or empty log/status/phase files (show empty feed without errors).
- [x] Avoid excessive re-renders or flicker when new events arrive.

## Technical Notes
- **Primary UI changes**
  - `src/tui/screens/RunScreen.tsx`: add ActivityFeed section and hook it into existing loop status polling.
- **Parsing & utilities**
  - `src/tui/utils/loop-status.ts`: add/extend helpers to:
    - read and parse loop log lines into structured events
    - read `.status` and `.phases` and emit event entries on changes
    - infer status via keywords (e.g., `success`, `complete`, `passing` → success; `error`, `fail` → error)
- **New component**
  - `src/tui/components/ActivityFeed.tsx`: render scrollable list with timestamp + message + color.
- **Polling strategy**
  - Use existing RunScreen update cadence (or add a lightweight interval) to refresh events and append newly parsed items.
- **Timestamp handling**
  - Convert log line timestamps (or file mtime if not present) to relative time (e.g., using `date-fns` or internal helper).

## Acceptance Criteria
- [x] When a loop run is active, RunScreen displays an activity feed section.
- [x] The feed shows exactly the **last 10 events** and updates as new events are appended.
- [x] The feed auto-scrolls so the newest event is visible without user input.
- [x] Each event displays a **relative timestamp only** (e.g., "30s ago").
- [x] Events are color-coded by inferred status (success/error/in-progress).
- [x] Events are derived from the loop log and `.status/.phases` without requiring format changes.
- [x] Missing or empty log/status/phase files do not crash the TUI and show an empty feed.

## Implementation Notes
- Error color uses `colors.pink` from theme.ts (not pure red) — consistent with existing codebase convention for error states.
- No external dependency added for relative time formatting; `formatRelativeTime()` uses simple arithmetic (no `date-fns`).
- Activity events are collected incrementally via `lastLogLineCountRef` to avoid re-parsing the entire log each poll cycle.

## Out of Scope
- Latest commits display
- Current task/phase standalone section
- User-configurable feed length or theme settings

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### Inline context
Add a live activity feed to the TUI RunScreen that shows structured, human-readable events during the feature loop run.