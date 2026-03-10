# fix-run-summary Implementation Plan

**Spec:** .ralph/specs/fix-run-summary.md
**Branch:** feat/fix-run-summary
**Status:** Complete

## Analysis

### Current State
The Changes section in `RunCompletionSummary.tsx` (lines 146-153) renders each file as:
```tsx
<Box key={file.path} flexDirection="row">
  <Text>{file.path}  </Text>
  <Text color={colors.green}>+{file.added} </Text>
  <Text color={colors.pink}>-{file.removed}</Text>
  <Text> lines</Text>
</Box>
```

Problems:
1. No path truncation → long paths wrap or overflow
2. No fixed-width stats columns → insertions/deletions misaligned across rows
3. No terminal width awareness → layout breaks in narrow terminals

### Target Layout
```
  src/tui/components/SummaryBox.tsx   +15  -6
  …/components/RunCompletionSummary.tsx   +42 -18
  README.md                               +3  -1
```

- Paths left-aligned, truncated with prefix ellipsis (`…/`) when too long
- Stats right-aligned in fixed-width columns, consistent across all rows
- Stats columns always fully visible; only the path column shrinks

### Width Budget
- `SummaryBox` content width = `boxWidth - 4` (borders + 1-char padding each side)
- `boxWidth = min(max(60, termWidth), 80)` (from SummaryBox.tsx)
- At 80 columns: content width = 76 chars
- Stats block: `+NNNN -NNNN` → need to compute max width per column dynamically
- Gap between path and stats: 2 spaces minimum
- Path column width = contentWidth - statsBlockWidth - gap

## Tasks

### Phase 1: Core Implementation

- [x] Add `useStdout` import and compute content width inside `RunCompletionSummary` - [complexity: S]
- [x] Add helper functions for path truncation and stats formatting - [complexity: M]
- [x] Refactor Changes section rendering to use formatted layout - [complexity: M]

### Phase 2: Tests

- [x] Write unit tests for `truncatePath` helper - [complexity: S]
- [x] Write unit tests for `formatChangesFiles` helper - [complexity: M]
- [x] Update existing `RunCompletionSummary` render tests - [complexity: S]

### Phase 3: Polish

- [x] Verify no layout regressions in other summary sections - [complexity: S]
  - All 706 tests pass, typecheck clean, build clean

## Done

- All tasks complete (commit pending)
