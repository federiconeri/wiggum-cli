# read-looplog-memory Feature Specification

**Status:** Complete
**Version:** 1.0  
**Last Updated:** 2026-03-12

## Purpose
Prevent high memory usage and potential OOM/GC pressure in `readLoopLog` by replacing full-file reads with bounded tail-based reads for large log files, while preserving existing caller-visible output semantics (tail lines behavior).

## User Stories
- As a developer running long agent loops, I want loop log introspection to remain stable even when logs are very large so that the CLI/TUI does not slow down or crash.
- As a caller of `readLoopLog`, I want the same output shape and tail-lines semantics so that existing features and tests continue to work.
- As a maintainer, I want deterministic and testable bounded-read behavior so that performance regressions are caught early.

## Requirements

### Functional Requirements
- [x] `readLoopLog` must avoid reading the entire file when log size exceeds a bounded cap.
  - **Acceptance criteria:** for files larger than cap, only the last capped byte range is read from disk.
- [x] For files at or below the cap, existing full read behavior is retained.
  - **Acceptance criteria:** files under cap are read with current normal path and produce same results as before.
- [x] Tail-line semantics must remain unchanged from caller perspective.
  - **Acceptance criteria:** output still returns the last `tailLines` lines (default behavior unchanged), including newline splitting behavior currently relied on by tests.
- [x] Missing/unreadable file behavior must remain backward-compatible.
  - **Acceptance criteria:** existing error handling/return conventions are preserved (no breaking contract changes).
- [x] File descriptor resources must be safely closed in all paths.
  - **Acceptance criteria:** no leaked handles on read success/failure.

### Non-Functional Requirements
- [x] Memory usage must be bounded for large logs.
  - **Acceptance criteria:** peak memory should scale with cap size, not total file size.
- [x] Performance should improve for very large logs.
  - **Acceptance criteria:** large-file introspection completes without full-file I/O and without observable hangs in normal CLI usage.
- [x] Implementation should remain simple and maintainable in current TypeScript/Node architecture.
  - **Acceptance criteria:** change localized primarily to `src/agent/tools/introspection.ts` with focused tests.
- [x] No regressions in test and type safety.
  - **Acceptance criteria:** `npm run test` and `npm run typecheck` pass.

## Technical Notes
- **Primary file to modify:** `src/agent/tools/introspection.ts`
- **Tests to update/add:** `src/agent/tools/introspection.test.ts`
- **Approach (v1):** use a **1 MB fixed cap** for bounded read.
  - Determine file size with `stat`.
  - If `size <= MAX_BYTES` (1 MB), keep existing `readFile(logPath, 'utf-8')`.
  - If `size > MAX_BYTES`, open file descriptor, read from offset `size - MAX_BYTES` into buffer, decode UTF-8, then apply existing line-tail slicing.
- **Node APIs:** `fs/promises` (`stat`, `open`, `readFile`), `Buffer`.
- **Semantics note:** Because reading starts mid-file for large logs, first decoded line in chunk may be partial; this is acceptable as long as final returned lines preserve current “last N lines from available content” behavior.
- **Error handling:** maintain current handling patterns used by introspection tools; ensure `fd.close()` in `finally`.
- **No config surface in v1:** cap remains internal constant to minimize scope and avoid CLI/config changes.
- **Validation:** no schema changes required; existing zod usage unaffected.

## Acceptance Criteria
- [x] For log files `< 1 MB`, `readLoopLog` behavior/output matches pre-change behavior.
- [x] For log files `> 1 MB`, function reads only last 1 MB (verified via test spy/mocking or controlled fixture behavior).
- [x] Returned result still contains last `tailLines` lines according to existing logic.
- [x] Default `tailLines` behavior remains unchanged.
- [x] Existing tests for introspection continue to pass.
- [x] New tests cover:
  - [x] small file path (`readFile` path),
  - [x] large file path (bounded fd read path),
  - [x] correctness of tail slicing from bounded content,
  - [x] resource cleanup on read errors.
- [x] Project-level `npm run test` passes.
- [x] Project-level `npm run typecheck` passes.

## Out of Scope
- Making cap user-configurable via env/CLI/config.
- Streaming/chunked reverse line reader implementation.
- Changing output schema or adding metadata about truncation.
- Refactoring unrelated introspection tools.

## Project Tech Stack
Framework: React v^18.3.1  
Unit Testing: Vitest  
Package Manager: npm

## Reference Documents

### GitHub issue #118
**Agent: readLoopLog reads entire log file into memory**

Key direction captured:
- Replace full-file read for large logs with bounded tail read.
- Preserve tail-line output semantics.
- Ensure compatibility with existing tests and caller expectations.