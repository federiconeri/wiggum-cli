# Fix Run Summary Feature Specification

**Status:** Completed
**Version:** 1.0
**Last Updated:** 2026-02-19

## Purpose
Improve readability of the “Changes” section in the RunCompletionSummary by fixing column layout, truncating long paths with prefix ellipsis, and ensuring insertions/deletions stats remain aligned across all rows and terminal widths.

## User Stories
- As a user, I want file paths to display without wrapping mid-name so that the Changes list is readable.
- As a user, I want insertions/deletions stats aligned consistently so I can quickly compare changes across files.
- As a user, I want the summary to remain readable even in narrow terminals so I can use the tool in constrained environments.

## Requirements

### Functional Requirements
- [x] **Prefix-ellipsis path truncation:** When a file path exceeds the available path column width, truncate from the start and prefix with an ellipsis (e.g., `…/components/SomeComponent.tsx`), preserving the filename suffix.
  - **Acceptance:** No path is split across columns or wrapped mid-name within a row.
- [x] **Fixed-width stats columns:** Render insertions and deletions as two right-aligned, fixed-width columns (e.g., `+12 -3`) with consistent spacing for every row.
  - **Acceptance:** All rows show stats aligned vertically across the list.
- [x] **Width prioritization:** When terminal width is too small, shrink the path column first while always showing full stats columns.
  - **Acceptance:** Stats columns are always fully visible; only the path length changes.
- [x] **Stable ordering:** Preserve the original ordering from diff stats.
  - **Acceptance:** Output ordering matches the underlying diff stats list.

### Non-Functional Requirements
- [x] **Terminal compatibility:** Layout remains readable at standard terminal widths (80–120 columns).
- [x] **No wrapping artifacts:** Rendering should not introduce line wrapping or misalignment in Ink.

## Technical Notes
- **Location:** `src/tui/components/RunCompletionSummary.tsx`
- **Approach:**
  - Compute terminal/Ink available width.
  - Reserve a fixed stats block width (e.g., 4 chars per column plus spacing).
  - Calculate path column width as `availableWidth - statsBlockWidth - gap`.
  - Apply prefix-ellipsis truncation to paths exceeding path column width.
  - Render stats using right-aligned padding into fixed-width columns.
- **Dependencies:** Use existing Ink text layout; no new libraries.
- **Testing:** Add or update unit tests (Vitest) for truncation and alignment logic where applicable.

## Acceptance Criteria
- [x] File paths display with prefix ellipsis and never wrap mid-name in the Changes section.
- [x] Insertions and deletions render in fixed-width, right-aligned columns across all rows.
- [x] At 80, 100, and 120 column widths, stats remain visible and aligned; only path column width changes.
- [x] No layout regressions elsewhere in the RunCompletionSummary.

## Out of Scope
- Changes to other summary sections or overall summary layout.
- Alternative visualizations (e.g., bar charts).
- Live streaming or monitoring updates.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents
- Related issues: Enhanced structured summary for feature loop completion #26; Enhance monitor to track all loop phases and stream output #58