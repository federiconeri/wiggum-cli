# add-sync-command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent storage for AI-enhanced codebase analysis and a `/sync` command that refreshes context without the full `/init` flow, so `/new` benefits from rich project understanding across TUI sessions.

**Architecture:** New `src/context/` module handles persistence (types + storage). `/init` saves context after AI analysis. `/new` loads persisted context when no in-memory state exists. `/sync` is a lightweight shell command that re-runs scan + AI enhancement using existing provider config and persists the result. All context I/O is centralized in `src/context/storage.ts`.

**Tech Stack:** TypeScript, React (Ink TUI), Vitest, Node.js fs/promises

**Spec:** `.ralph/specs/add-sync-command.md`
**Branch:** `feat/add-sync-command`
**Status:** Planning

---

## Tasks

### Phase 1: Context Persistence Module

#### Task 1: Define PersistedContext types [complexity: S]

**Files:**
- Create: `src/context/types.ts`
- Create: `src/context/index.ts`

**Step 1: Create the types file**

```typescript
// src/context/types.ts
/**
 * Persisted Context Types
 * Schema for the .ralph/.context.json file
 */

/**
 * Subset of scanner output for persistence
 */
export interface PersistedScanResult {
  framework?: string;
  frameworkVersion?: string;
  frameworkVariant?: string;
  packageManager?: string;
  testing?: {
    unit?: string | null;
    e2e?: string | null;
  };
  styling?: string | null;
  database?: string | null;
  orm?: string | null;
  auth?: string | null;
}

/**
 * AI-enhanced project understanding for persistence
 */
export interface PersistedAIAnalysis {
  projectContext?: {
    entryPoints?: string[];
    keyDirectories?: Record<string, string>;
    namingConventions?: string;
  };
  commands?: Record<string, string>;
  implementationGuidelines?: string[];
  technologyPractices?: {
    projectType?: string;
    practices?: string[];
    antiPatterns?: string[];
  };
}

/**
 * Full persisted context written to .ralph/.context.json
 */
export interface PersistedContext {
  version: number;
  lastAnalyzedAt: string;
  gitCommitHash?: string;
  gitBranch?: string;
  scanResult: PersistedScanResult;
  aiAnalysis: PersistedAIAnalysis;
}
```

**Step 2: Create the barrel export**

```typescript
// src/context/index.ts
export type {
  PersistedContext,
  PersistedScanResult,
  PersistedAIAnalysis,
} from './types.js';

export {
  saveContext,
  loadContext,
  getContextAge,
  CONTEXT_VERSION,
} from './storage.js';
```

Note: `storage.ts` is created in Task 2. The barrel import will fail until then — that's expected.

**Step 3: Commit**

```bash
git add src/context/types.ts src/context/index.ts
git commit -m "feat(context): define PersistedContext types for .ralph/.context.json"
```

---

#### Task 2: Implement context storage (save/load/age) [complexity: M]

**Files:**
- Create: `src/context/storage.ts`

**Context:**
- The `.ralph` directory is the local state dir. The `projectRoot` parameter determines where `.ralph/` lives — consistent with how other code resolves `.ralph` paths (e.g., `src/utils/config.ts` and `src/generator/writer.ts`).
- The file goes to `.ralph/.context.json`.

**Step 1: Write the storage module**

```typescript
// src/context/storage.ts
/**
 * Context Storage
 * Read/write .ralph/.context.json for persisted project analysis
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { PersistedContext } from './types.js';

export const CONTEXT_VERSION = 1;
const CONTEXT_FILENAME = '.context.json';

/**
 * Get the path to the context file
 */
function getContextFilePath(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  return path.join(root, '.ralph', CONTEXT_FILENAME);
}

/**
 * Save context to .ralph/.context.json
 *
 * Ensures .ralph directory exists. Stamps version automatically.
 * Throws on filesystem errors.
 */
export async function saveContext(
  context: Omit<PersistedContext, 'version'>,
  projectRoot?: string,
): Promise<void> {
  const fullContext: PersistedContext = {
    version: CONTEXT_VERSION,
    ...context,
  };
  const filePath = getContextFilePath(projectRoot);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(fullContext, null, 2), 'utf8');
}

/**
 * Load context from .ralph/.context.json
 *
 * Returns null if file does not exist.
 * Throws if file exists but contains invalid JSON or fails validation.
 */
export async function loadContext(
  projectRoot?: string,
): Promise<PersistedContext | null> {
  const filePath = getContextFilePath(projectRoot);
  let json: string;
  try {
    json = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Failed to parse .ralph/.context.json: invalid JSON`);
  }

  // Basic validation
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as PersistedContext).version !== 'number' ||
    typeof (parsed as PersistedContext).lastAnalyzedAt !== 'string'
  ) {
    throw new Error(
      'Failed to parse .ralph/.context.json: missing required fields (version, lastAnalyzedAt)',
    );
  }

  return parsed as PersistedContext;
}

/**
 * Calculate the age of a persisted context
 */
export function getContextAge(
  context: PersistedContext,
): { ms: number; human: string } {
  const ts = new Date(context.lastAnalyzedAt).getTime();
  const now = Date.now();
  const ms = Math.max(0, now - ts);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let human: string;
  if (days > 0) {
    human = `${days} day${days === 1 ? '' : 's'}`;
  } else if (hours > 0) {
    human = `${hours} hour${hours === 1 ? '' : 's'}`;
  } else if (minutes > 0) {
    human = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  } else {
    human = `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  return { ms, human };
}
```

**Step 2: Commit**

```bash
git add src/context/storage.ts
git commit -m "feat(context): implement saveContext, loadContext, getContextAge"
```

---

#### Task 3: Write tests for context storage [complexity: M]

**Files:**
- Create: `src/context/storage.test.ts`

**Notes:**
- Follow existing test patterns (see `src/ai/agents/codebase-analyzer.test.ts`, `src/utils/env.test.ts`).
- Use Vitest. Use `fs/promises` with `os.tmpdir()` for isolation.

**Step 1: Write the test file**

```typescript
// src/context/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveContext, loadContext, getContextAge, CONTEXT_VERSION } from './storage.js';
import type { PersistedContext } from './types.js';

describe('context/storage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-context-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const sampleContext = {
    lastAnalyzedAt: '2026-02-05T12:00:00.000Z',
    gitCommitHash: 'abc1234',
    gitBranch: 'main',
    scanResult: {
      framework: 'React',
      packageManager: 'npm',
    },
    aiAnalysis: {
      projectContext: {
        entryPoints: ['src/index.ts'],
        keyDirectories: { 'src/tui': 'TUI components' },
      },
      commands: { test: 'npm test', build: 'npm run build' },
      implementationGuidelines: ['Use Vitest for tests'],
    },
  };

  describe('saveContext', () => {
    it('creates .ralph directory and writes .context.json', async () => {
      await saveContext(sampleContext, tmpDir);

      const filePath = path.join(tmpDir, '.ralph', '.context.json');
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.version).toBe(CONTEXT_VERSION);
      expect(parsed.lastAnalyzedAt).toBe('2026-02-05T12:00:00.000Z');
      expect(parsed.scanResult.framework).toBe('React');
      expect(parsed.aiAnalysis.commands.test).toBe('npm test');
    });

    it('overwrites existing .context.json', async () => {
      await saveContext(sampleContext, tmpDir);
      await saveContext(
        { ...sampleContext, lastAnalyzedAt: '2026-02-06T12:00:00.000Z' },
        tmpDir,
      );

      const filePath = path.join(tmpDir, '.ralph', '.context.json');
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
      expect(parsed.lastAnalyzedAt).toBe('2026-02-06T12:00:00.000Z');
    });

    it('creates .ralph dir even if it does not exist', async () => {
      const freshDir = path.join(tmpDir, 'sub');
      await fs.mkdir(freshDir);
      await saveContext(sampleContext, freshDir);

      const filePath = path.join(freshDir, '.ralph', '.context.json');
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('loadContext', () => {
    it('returns populated PersistedContext when file exists and is valid', async () => {
      await saveContext(sampleContext, tmpDir);
      const loaded = await loadContext(tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(CONTEXT_VERSION);
      expect(loaded!.scanResult.framework).toBe('React');
      expect(loaded!.aiAnalysis.projectContext?.entryPoints).toEqual(['src/index.ts']);
    });

    it('returns null when file does not exist', async () => {
      const result = await loadContext(tmpDir);
      expect(result).toBeNull();
    });

    it('throws on invalid JSON', async () => {
      const ralphDir = path.join(tmpDir, '.ralph');
      await fs.mkdir(ralphDir, { recursive: true });
      await fs.writeFile(path.join(ralphDir, '.context.json'), 'not json!!!', 'utf8');

      await expect(loadContext(tmpDir)).rejects.toThrow(/invalid JSON/);
    });

    it('throws on missing required fields', async () => {
      const ralphDir = path.join(tmpDir, '.ralph');
      await fs.mkdir(ralphDir, { recursive: true });
      await fs.writeFile(
        path.join(ralphDir, '.context.json'),
        JSON.stringify({ foo: 'bar' }),
        'utf8',
      );

      await expect(loadContext(tmpDir)).rejects.toThrow(/missing required fields/);
    });
  });

  describe('getContextAge', () => {
    it('returns age in days for old contexts', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: twoDaysAgo,
        scanResult: {},
        aiAnalysis: {},
      };
      const { ms, human } = getContextAge(context);
      expect(ms).toBeGreaterThan(0);
      expect(human).toBe('2 days');
    });

    it('returns age in hours for recent contexts', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: threeHoursAgo,
        scanResult: {},
        aiAnalysis: {},
      };
      const { human } = getContextAge(context);
      expect(human).toBe('3 hours');
    });

    it('returns age in minutes for very recent contexts', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const context: PersistedContext = {
        version: 1,
        lastAnalyzedAt: fiveMinutesAgo,
        scanResult: {},
        aiAnalysis: {},
      };
      const { human } = getContextAge(context);
      expect(human).toBe('5 minutes');
    });
  });
});
```

**Step 2: Run the tests**

Run: `npx vitest run src/context/storage.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/context/storage.test.ts
git commit -m "test(context): add unit tests for saveContext, loadContext, getContextAge"
```

---

### Phase 2: Integrate into /init (persist after AI analysis)

#### Task 4: Add context conversion helpers [complexity: S]

**Files:**
- Create: `src/context/convert.ts`
- Modify: `src/context/index.ts` — add re-export

**Context:**
- `EnhancedScanResult` (from `src/ai/enhancer.ts`) has `aiAnalysis?: AIAnalysisResult` and inherits `ScanResult` which has `stack: DetectedStack`.
- We need to map these rich types to the flat `PersistedScanResult` and `PersistedAIAnalysis`.
- For git metadata, use `child_process.execFile` (not `exec`) with arguments as array — safe against injection since no shell interpolation occurs.

**Step 1: Create converter**

```typescript
// src/context/convert.ts
/**
 * Context Converters
 * Map between runtime AI/scanner types and persisted context types
 */

import type { ScanResult } from '../scanner/types.js';
import type { AIAnalysisResult } from '../ai/enhancer.js';
import type { PersistedScanResult, PersistedAIAnalysis } from './types.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Convert a ScanResult.stack to PersistedScanResult
 */
export function toPersistedScanResult(scanResult: ScanResult): PersistedScanResult {
  const { stack } = scanResult;
  return {
    framework: stack.framework?.name,
    frameworkVersion: stack.framework?.version,
    frameworkVariant: stack.framework?.variant,
    packageManager: stack.packageManager?.name,
    testing: {
      unit: stack.testing?.unit?.name ?? null,
      e2e: stack.testing?.e2e?.name ?? null,
    },
    styling: stack.styling?.name ?? null,
    database: stack.database?.name ?? null,
    orm: stack.orm?.name ?? null,
    auth: stack.auth?.name ?? null,
  };
}

/**
 * Convert an AIAnalysisResult to PersistedAIAnalysis
 */
export function toPersistedAIAnalysis(
  analysis: AIAnalysisResult | undefined,
): PersistedAIAnalysis {
  if (!analysis) return {};
  return {
    projectContext: analysis.projectContext
      ? {
          entryPoints: analysis.projectContext.entryPoints,
          keyDirectories: analysis.projectContext.keyDirectories,
          namingConventions: analysis.projectContext.namingConventions,
        }
      : undefined,
    commands: analysis.commands as Record<string, string> | undefined,
    implementationGuidelines: analysis.implementationGuidelines,
    technologyPractices: analysis.technologyPractices
      ? {
          projectType: analysis.technologyPractices.projectType,
          practices: analysis.technologyPractices.practices,
          antiPatterns: analysis.technologyPractices.antiPatterns,
        }
      : undefined,
  };
}

/**
 * Get git metadata (commit hash, branch) using execFile (no shell injection risk).
 * Returns undefined values if git is not available or not a git repo.
 */
export async function getGitMetadata(
  projectRoot: string,
): Promise<{ gitCommitHash?: string; gitBranch?: string }> {
  let gitCommitHash: string | undefined;
  let gitBranch: string | undefined;

  try {
    const { stdout: hash } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
    });
    gitCommitHash = hash.trim();
  } catch {
    // Not a git repo or git not available
  }

  try {
    const { stdout: branch } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: projectRoot },
    );
    gitBranch = branch.trim();
  } catch {
    // Not a git repo or git not available
  }

  return { gitCommitHash, gitBranch };
}
```

**Step 2: Update barrel export**

Add to `src/context/index.ts`:

```typescript
export {
  toPersistedScanResult,
  toPersistedAIAnalysis,
  getGitMetadata,
} from './convert.js';
```

**Step 3: Commit**

```bash
git add src/context/convert.ts src/context/index.ts
git commit -m "feat(context): add converters from runtime types to persisted types"
```

---

#### Task 5: Save context after /init AI analysis completes [complexity: M]

**Files:**
- Modify: `src/tui/screens/InitScreen.tsx`

**Context:**
- The `InitScreen` orchestrates the full init flow. After `aiEnhancer.enhance()` returns in the `useEffect` at lines 170-223, we need to call `saveContext()`.
- We should save context right after `setEnhancedResult()` succeeds (the AI analysis effect), not after generation — because generation produces config files, which is a separate concern.
- On save failure, log the error but don't block the flow (non-blocking).

**Step 1: Add imports to InitScreen.tsx**

Add after the existing imports (around line 41):

```typescript
import { saveContext, toPersistedScanResult, toPersistedAIAnalysis, getGitMetadata } from '../../context/index.js';
import { logger } from '../../utils/logger.js';
```

**Step 2: Modify the AI analysis effect**

In `InitScreen.tsx`, inside the `runAnalysis` async function (the `useEffect` starting at line 170), after the try block that processes `enhancedResult` (around lines 197-214), add context saving logic.

Replace the existing try block body (lines 197-214) with:

```typescript
        const enhancedResult = await traced(
          async () => {
            return await aiEnhancer.enhance(state.scanResult!);
          },
          {
            name: 'ai-analysis',
            type: 'task',
          }
        );

        if (enhancedResult.aiEnhanced && enhancedResult.aiAnalysis) {
          setEnhancedResult(enhancedResult, enhancedResult.tokenUsage);
        } else if (enhancedResult.aiError) {
          setAiError(enhancedResult.aiError);
        } else {
          setEnhancedResult(enhancedResult);
        }

        // Persist context for /sync and /new
        try {
          const git = await getGitMetadata(projectRoot);
          await saveContext(
            {
              lastAnalyzedAt: new Date().toISOString(),
              gitCommitHash: git.gitCommitHash,
              gitBranch: git.gitBranch,
              scanResult: toPersistedScanResult(state.scanResult!),
              aiAnalysis: toPersistedAIAnalysis(enhancedResult.aiAnalysis),
            },
            projectRoot,
          );
        } catch (saveErr) {
          logger.error(
            `Failed to save project context: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
          );
          // Non-blocking: don't fail /init if context save fails
        }
```

**Step 3: Commit**

```bash
git add src/tui/screens/InitScreen.tsx
git commit -m "feat(init): persist context to .ralph/.context.json after AI analysis"
```

---

### Phase 3: Integrate into /new (load persisted context)

#### Task 6: Load persisted context in InterviewScreen [complexity: M]

**Files:**
- Modify: `src/tui/screens/InterviewScreen.tsx`

**Context:**
- `InterviewScreen` creates an `InterviewOrchestrator` on mount (lines 109-200).
- The orchestrator accepts `scanResult?: ScanResult` and `sessionContext?: SessionContext`.
- Currently, `scanResult` comes from `InterviewScreenProps`. If that's undefined (fresh session, no `/init` run), we should attempt to load persisted context.
- The `extractSessionContext` function in `src/tui/orchestration/interview-orchestrator.ts` already converts `EnhancedScanResult.aiAnalysis` to `SessionContext`. We can construct a compatible `SessionContext` from `PersistedContext.aiAnalysis` directly.
- If `loadContext()` throws, show a system message and continue without context.

**Step 1: Add imports**

Add at top of `InterviewScreen.tsx`:

```typescript
import { loadContext } from '../../context/index.js';
import type { SessionContext } from '../orchestration/interview-orchestrator.js';
```

**Step 2: Modify the useEffect that creates the orchestrator**

In the `useEffect` starting at line 109, wrap orchestrator creation in an async IIFE to allow `loadContext()`. The key change: if `scanResult` prop is undefined, attempt to load persisted context and map it to `sessionContext`.

Replace the entire useEffect body (lines 109-200) with:

```typescript
  useEffect(() => {
    isCancelledRef.current = false;

    initialize({
      featureName,
      projectRoot,
      provider,
      model,
    });

    // Async IIFE to allow loading persisted context
    (async () => {
      // Determine session context: use scanResult prop if available,
      // otherwise try loading persisted context from disk
      let resolvedScanResult = scanResult;
      let resolvedSessionContext: SessionContext | undefined;

      if (!scanResult) {
        try {
          const persisted = await loadContext(projectRoot);
          if (persisted) {
            // Map persisted AI analysis to SessionContext
            resolvedSessionContext = {
              entryPoints: persisted.aiAnalysis.projectContext?.entryPoints,
              keyDirectories: persisted.aiAnalysis.projectContext?.keyDirectories,
              commands: persisted.aiAnalysis.commands as SessionContext['commands'],
              namingConventions: persisted.aiAnalysis.projectContext?.namingConventions,
              implementationGuidelines: persisted.aiAnalysis.implementationGuidelines,
              keyPatterns: persisted.aiAnalysis.technologyPractices?.practices,
            };
          }
        } catch (err) {
          // Show error but continue without context
          if (!isCancelledRef.current) {
            addMessage(
              'system',
              `Unable to load cached project context; continuing without it.`,
            );
          }
        }
      }

      if (isCancelledRef.current) return;

      const orchestrator = new InterviewOrchestrator({
        featureName,
        projectRoot,
        provider,
        model,
        scanResult: resolvedScanResult,
        sessionContext: resolvedSessionContext,
        onMessage: (role, content) => {
          if (isCancelledRef.current) return;
          addMessage(role, content);
        },
        onStreamChunk: (chunk) => {
          if (isCancelledRef.current) return;
          if (isGeneratingRef.current) return;
          if (!isStreamingRef.current) {
            isStreamingRef.current = true;
            streamContentRef.current = chunk;
            addStreamingMessage(chunk);
          } else {
            streamContentRef.current += chunk;
            updateStreamingMessage(streamContentRef.current);
          }
        },
        onStreamComplete: () => {
          if (isCancelledRef.current) return;
          if (isStreamingRef.current) {
            completeStreamingMessage();
            isStreamingRef.current = false;
            streamContentRef.current = '';
          }
        },
        onToolStart: (toolName, input) => {
          if (isCancelledRef.current) return '';
          return startToolCall(toolName, input);
        },
        onToolEnd: (toolId, output, error) => {
          if (isCancelledRef.current) return;
          completeToolCall(toolId, output, error);
        },
        onPhaseChange: (phase: GeneratorPhase) => {
          if (isCancelledRef.current) return;
          isGeneratingRef.current = phase === 'generation';
          setPhase(phase);
        },
        onComplete: (spec) => {
          if (isCancelledRef.current) return;
          setGeneratedSpec(spec);
          onCompleteRef.current(spec, messagesRef.current);
        },
        onError: (error) => {
          if (isCancelledRef.current) return;
          setError(error);
        },
        onWorkingChange: (isWorking, status) => {
          if (isCancelledRef.current) return;
          setWorking(isWorking, status);
        },
        onReady: () => {
          if (isCancelledRef.current) return;
          setReady();
        },
      });

      orchestratorRef.current = orchestrator;
      orchestrator.start();
    })();

    return () => {
      isCancelledRef.current = true;
      orchestratorRef.current = null;
    };
  }, [featureName, projectRoot, provider, model, scanResult]);
```

**Step 3: Commit**

```bash
git add src/tui/screens/InterviewScreen.tsx
git commit -m "feat(new): load persisted context from .ralph/.context.json when no in-memory state"
```

---

### Phase 4: Add /sync command

#### Task 7: Register /sync in command parser [complexity: S]

**Files:**
- Modify: `src/repl/command-parser.ts`

**Step 1: Add sync to REPL_COMMANDS**

In `command-parser.ts`, add to the `REPL_COMMANDS` object (after `init`):

```typescript
  sync: {
    description: 'Refresh project context (scan + AI analysis)',
    usage: '/sync',
    aliases: ['s'],
  },
```

**Step 2: Commit**

```bash
git add src/repl/command-parser.ts
git commit -m "feat(sync): register /sync command in REPL command parser"
```

---

#### Task 8: Create useSync hook [complexity: M]

**Files:**
- Create: `src/tui/hooks/useSync.ts`
- Modify: `src/tui/hooks/index.ts` — add re-export

**Context:**
- Follow the pattern of `useInit.ts`: `useState` for status, async action function.
- The sync operation: `Scanner.scan()` → `AIEnhancer.enhance()` → `saveContext()`.
- Provider/model config comes from `SessionState` (already configured by `/init`).
- No UI for provider/model selection — reuse existing config.

**Step 1: Create the hook**

```typescript
// src/tui/hooks/useSync.ts
/**
 * useSync - Hook for the /sync command
 *
 * Runs scan + AI enhancement and persists context to .ralph/.context.json
 * without the full /init interview flow.
 */

import { useState, useCallback } from 'react';
import { Scanner } from '../../scanner/index.js';
import { AIEnhancer } from '../../ai/enhancer.js';
import {
  saveContext,
  toPersistedScanResult,
  toPersistedAIAnalysis,
  getGitMetadata,
} from '../../context/index.js';
import { logger } from '../../utils/logger.js';
import type { AIProvider } from '../../ai/providers.js';

export type SyncStatus = 'idle' | 'running' | 'success' | 'error';

export interface UseSyncReturn {
  status: SyncStatus;
  error: Error | null;
  sync: (projectRoot: string, provider: AIProvider, model: string) => Promise<void>;
}

export function useSync(): UseSyncReturn {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const sync = useCallback(
    async (projectRoot: string, provider: AIProvider, model: string) => {
      setStatus('running');
      setError(null);

      try {
        // Step 1: Scan
        const scanner = new Scanner();
        const scanResult = await scanner.scan(projectRoot);

        // Step 2: AI enhancement
        const enhancer = new AIEnhancer({
          provider,
          model,
          agentic: true,
        });
        const enhanced = await enhancer.enhance(scanResult);

        // Step 3: Persist
        const git = await getGitMetadata(projectRoot);
        await saveContext(
          {
            lastAnalyzedAt: new Date().toISOString(),
            gitCommitHash: git.gitCommitHash,
            gitBranch: git.gitBranch,
            scanResult: toPersistedScanResult(scanResult),
            aiAnalysis: toPersistedAIAnalysis(enhanced.aiAnalysis),
          },
          projectRoot,
        );

        setStatus('success');
      } catch (err) {
        const syncError =
          err instanceof Error ? err : new Error(String(err));
        logger.error(`Sync failed: ${syncError.message}`);
        setError(syncError);
        setStatus('error');
      }
    },
    [],
  );

  return { status, error, sync };
}
```

**Step 2: Add re-export to hooks/index.ts**

Read `src/tui/hooks/index.ts` and add:

```typescript
export { useSync, type SyncStatus, type UseSyncReturn } from './useSync.js';
```

**Step 3: Commit**

```bash
git add src/tui/hooks/useSync.ts src/tui/hooks/index.ts
git commit -m "feat(sync): create useSync hook for scan + AI + persist flow"
```

---

#### Task 9: Wire /sync into MainShell [complexity: M]

**Files:**
- Modify: `src/tui/screens/MainShell.tsx`

**Context:**
- MainShell handles slash commands via `executeCommand()` switch.
- `/sync` should: print "started" → run sync → print "completed" or "failed".
- Use the `useSync()` hook.
- Shell must remain responsive during sync (useEffect watches status changes).

**Step 1: Add import**

At top of `MainShell.tsx`:

```typescript
import { useSync } from '../hooks/useSync.js';
```

**Step 2: Add useSync hook and status effect**

Inside the `MainShell` function, after the existing `useCallback` declarations (before `useInput`):

```typescript
  // Sync hook
  const { status: syncStatus, error: syncError, sync } = useSync();

  // Watch sync status changes
  React.useEffect(() => {
    if (syncStatus === 'success') {
      addSystemMessage('Project context sync completed successfully.');
    } else if (syncStatus === 'error') {
      const msg = syncError?.message || 'Unknown error';
      addSystemMessage(`Sync failed: ${msg}`);
    }
  }, [syncStatus, syncError, addSystemMessage]);
```

**Step 3: Add handleSync callback**

After `handleExit`:

```typescript
  /**
   * Handle /sync command
   */
  const handleSync = useCallback(() => {
    if (!sessionState.initialized) {
      addSystemMessage('Project not initialized. Run /init first.');
      return;
    }
    if (!sessionState.provider) {
      addSystemMessage('No AI provider configured. Run /init first.');
      return;
    }
    addSystemMessage('Starting sync of project context…');
    sync(sessionState.projectRoot, sessionState.provider, sessionState.model);
  }, [sessionState, addSystemMessage, sync]);
```

**Step 4: Add sync case to executeCommand switch**

In the `executeCommand` switch statement, add before `default`:

```typescript
      case 'sync':
        handleSync();
        break;
```

**Step 5: Update executeCommand dependencies**

Add `handleSync` to the `useCallback` dependencies array of `executeCommand`.

**Step 6: Commit**

```bash
git add src/tui/screens/MainShell.tsx
git commit -m "feat(sync): wire /sync command into MainShell with status messages"
```

---

### Phase 5: Git Ignore

#### Task 10: Add .context.json to .ralph/.gitignore template [complexity: S]

**Files:**
- Modify: `src/templates/root/.gitignore.tmpl`

**Context:**
- This template becomes `.ralph/.gitignore` in generated projects (via `mapTemplateOutputPaths` in writer.ts: `root/` prefix maps to `.ralph/`).
- The project-level `.gitignore` (from `config/.gitignore.tmpl`) already ignores the entire `.ralph` directory with `/.ralph`. However, the `.ralph/.gitignore` is for when users un-ignore `.ralph` and commit Ralph files — it ensures machine-specific files like `.context.json` stay out.

**Step 1: Add .context.json to the template**

Update `src/templates/root/.gitignore.tmpl` to:

```
# Ralph working files
*.log
*.tmp
.env.local
.context.json

# Don't ignore anything else - all ralph files should be committed
```

**Step 2: Commit**

```bash
git add src/templates/root/.gitignore.tmpl
git commit -m "feat(gitignore): add .context.json to .ralph/.gitignore template"
```

---

### Phase 6: Tests

#### Task 11: Write tests for context converters [complexity: S]

**Files:**
- Create: `src/context/convert.test.ts`

**Step 1: Write converter tests**

```typescript
// src/context/convert.test.ts
import { describe, it, expect } from 'vitest';
import { toPersistedScanResult, toPersistedAIAnalysis } from './convert.js';
import type { ScanResult } from '../scanner/types.js';
import type { AIAnalysisResult } from '../ai/enhancer.js';

describe('context/convert', () => {
  describe('toPersistedScanResult', () => {
    it('maps DetectedStack fields to flat persisted format', () => {
      const scanResult: ScanResult = {
        projectRoot: '/tmp/test',
        scanTime: 100,
        stack: {
          framework: { name: 'Next.js', version: '14.0.0', variant: 'app-router', confidence: 95, evidence: [] },
          packageManager: { name: 'pnpm', confidence: 90, evidence: [] },
          testing: {
            unit: { name: 'Vitest', confidence: 85, evidence: [] },
            e2e: { name: 'Playwright', confidence: 80, evidence: [] },
          },
          styling: { name: 'Tailwind CSS', confidence: 90, evidence: [] },
          database: { name: 'Supabase', confidence: 75, evidence: [] },
          orm: { name: 'Prisma', confidence: 70, evidence: [] },
          auth: { name: 'NextAuth', confidence: 65, evidence: [] },
        },
      };

      const result = toPersistedScanResult(scanResult);

      expect(result.framework).toBe('Next.js');
      expect(result.frameworkVersion).toBe('14.0.0');
      expect(result.frameworkVariant).toBe('app-router');
      expect(result.packageManager).toBe('pnpm');
      expect(result.testing?.unit).toBe('Vitest');
      expect(result.testing?.e2e).toBe('Playwright');
      expect(result.styling).toBe('Tailwind CSS');
      expect(result.database).toBe('Supabase');
      expect(result.orm).toBe('Prisma');
      expect(result.auth).toBe('NextAuth');
    });

    it('handles missing optional fields gracefully', () => {
      const scanResult: ScanResult = {
        projectRoot: '/tmp/test',
        scanTime: 50,
        stack: {},
      };

      const result = toPersistedScanResult(scanResult);

      expect(result.framework).toBeUndefined();
      expect(result.packageManager).toBeUndefined();
      expect(result.testing?.unit).toBeNull();
      expect(result.testing?.e2e).toBeNull();
    });
  });

  describe('toPersistedAIAnalysis', () => {
    it('maps AIAnalysisResult to persisted format', () => {
      const analysis: AIAnalysisResult = {
        projectContext: {
          entryPoints: ['src/index.ts'],
          keyDirectories: { 'src/api': 'API routes' },
          namingConventions: 'camelCase',
        },
        commands: { test: 'npm test', build: 'npm run build' },
        implementationGuidelines: ['Use TypeScript strict mode'],
        technologyPractices: {
          projectType: 'Web App',
          practices: ['SSR first'],
          antiPatterns: ['No inline styles'],
        },
      };

      const result = toPersistedAIAnalysis(analysis);

      expect(result.projectContext?.entryPoints).toEqual(['src/index.ts']);
      expect(result.projectContext?.keyDirectories).toEqual({ 'src/api': 'API routes' });
      expect(result.commands?.test).toBe('npm test');
      expect(result.implementationGuidelines).toEqual(['Use TypeScript strict mode']);
      expect(result.technologyPractices?.projectType).toBe('Web App');
    });

    it('returns empty object for undefined analysis', () => {
      const result = toPersistedAIAnalysis(undefined);
      expect(result).toEqual({});
    });
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/context/convert.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/context/convert.test.ts
git commit -m "test(context): add unit tests for type converters"
```

---

#### Task 12: Run full test suite and fix any issues [complexity: S]

**Step 1: Run the build**

Run: `npm run build`
Expected: No TypeScript errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Fix any issues found**

Address any TypeScript errors or test failures.

**Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix: address build/test issues from sync command integration"
```

---

### Phase 7: Verification

#### Task 13: Verify /sync does not navigate away from shell [complexity: S]

**Manual verification:**
- The `/sync` handler in MainShell calls `sync()` which is async via `useSync`, but does NOT call `onNavigate()`.
- Confirm the shell remains active and responsive during/after sync.
- This is already ensured by the architecture (useSync is a state hook, not a navigation event).

No code changes expected. Mark as verified.

---

## Done
- [x] Task 1: Define PersistedContext types (1d9f984)
- [x] Task 2: Implement context storage (8c585f3)
- [x] Task 3: Write tests for context storage (30c963e)
- [x] Task 4: Add context conversion helpers (c251ae9)
- [x] Task 5: Save context after /init AI analysis (c5919bf)
- [x] Task 6: Load persisted context in /new (6006f31)
- [x] Task 7: Register /sync in command parser (9ac6f29)
- [x] Task 8: Create useSync hook (b30b3c4)
- [x] Task 9: Wire /sync into MainShell (378691a)
- [x] Task 10: Add .context.json to .ralph/.gitignore template (b44817d)
- [x] Task 11: Write tests for context converters (49efe25)
- [x] Task 12: Run full test suite and fix issues (verified - all pass)
- [x] Task 13: Verify /sync stays in shell (verified - handleSync does not call onNavigate)
