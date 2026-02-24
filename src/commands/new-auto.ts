/**
 * Headless Autonomous Spec Generation
 * Drives InterviewOrchestrator without the Ink TUI for non-interactive use.
 * Used by AI agents (e.g. OpenClaw orchestrator) to generate feature specs.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import {
  getAvailableProvider,
  normalizeModelId,
  AVAILABLE_MODELS,
} from '../ai/providers.js';
import type { AIProvider } from '../ai/providers.js';
import { loadConfigWithDefaults, hasConfig } from '../utils/config.js';
import { loadContext, toScanResultFromPersisted } from '../context/index.js';
import { detectGitHubRemote, fetchGitHubIssue } from '../utils/github.js';
import { initTracing, flushTracing } from '../utils/tracing.js';
import {
  InterviewOrchestrator,
  type SessionContext,
} from '../tui/orchestration/interview-orchestrator.js';
import type { ScanResult } from '../scanner/types.js';

export interface NewAutoOptions {
  goals?: string;
  initialReferences?: string[];
  model?: string;
  provider?: AIProvider;
  /** Timeout in ms for spec generation (default: 5 minutes) */
  timeoutMs?: number;
}

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function newAutoCommand(
  featureName: string,
  options: NewAutoOptions = {},
): Promise<void> {
  // Validate inputs
  if (!featureName) {
    console.error('Error: feature name is required for --auto mode');
    process.exit(1);
  }

  // Detect provider
  const provider = options.provider ?? getAvailableProvider();
  if (!provider) {
    console.error(
      'Error: No AI provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.',
    );
    process.exit(1);
  }

  // Load config
  const projectRoot = process.cwd();
  let specsDir = join(projectRoot, '.ralph/specs');

  if (hasConfig(projectRoot)) {
    const config = await loadConfigWithDefaults(projectRoot);
    specsDir = join(projectRoot, config.paths.specs);
  }

  // Determine model — resolve aliases (e.g. 'sonnet' → full model ID)
  const recommendedModel = AVAILABLE_MODELS[provider].find(
    (m) => m.hint?.includes('recommended'),
  );
  const defaultModel = recommendedModel?.value ?? AVAILABLE_MODELS[provider][0].value;
  const model = normalizeModelId(provider, options.model ?? defaultModel);

  // Init tracing
  try {
    initTracing();
  } catch (err) {
    logger.debug(
      `Failed to init tracing: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Load project context (same logic as InterviewScreen.tsx)
  let resolvedScanResult: ScanResult | undefined;
  let resolvedSessionContext: SessionContext | undefined;

  try {
    const persisted = await loadContext(projectRoot);
    if (persisted) {
      resolvedSessionContext = {
        entryPoints: persisted.aiAnalysis.projectContext?.entryPoints,
        keyDirectories: persisted.aiAnalysis.projectContext?.keyDirectories,
        commands: persisted.aiAnalysis.commands as SessionContext['commands'],
        namingConventions: persisted.aiAnalysis.projectContext?.namingConventions,
        implementationGuidelines: persisted.aiAnalysis.implementationGuidelines,
        keyPatterns: persisted.aiAnalysis.technologyPractices?.practices,
      };

      resolvedScanResult = toScanResultFromPersisted(
        persisted.scanResult,
        projectRoot,
      );

      logger.info('Loaded cached project context from .ralph/.context.json');
    }
  } catch (err) {
    logger.debug(
      `Unable to load cached project context: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Drive the orchestrator headlessly
  const spec = await driveOrchestrator({
    featureName,
    projectRoot,
    provider,
    model,
    scanResult: resolvedScanResult,
    sessionContext: resolvedSessionContext,
    goals: options.goals,
    initialReferences: options.initialReferences,
    timeoutMs: options.timeoutMs,
  });

  // Save spec to disk
  if (!existsSync(specsDir)) {
    mkdirSync(specsDir, { recursive: true });
  }

  const specPath = join(specsDir, `${featureName}.md`);
  writeFileSync(specPath, spec, 'utf-8');

  // Print spec path to stdout (for piping/scripting)
  console.log(specPath);

  // Flush tracing before exit
  try {
    await flushTracing();
  } catch {
    // Non-critical
  }

  process.exit(0);
}

interface DriveOrchestratorOptions {
  featureName: string;
  projectRoot: string;
  provider: AIProvider;
  model: string;
  scanResult?: ScanResult;
  sessionContext?: SessionContext;
  goals?: string;
  initialReferences?: string[];
  timeoutMs?: number;
}

async function driveOrchestrator(
  opts: DriveOrchestratorOptions,
): Promise<string> {
  let readyDeferred = createDeferred();
  const completionDeferred = createDeferred<string>();
  let toolIdCounter = 0;

  const orchestrator = new InterviewOrchestrator({
    featureName: opts.featureName,
    projectRoot: opts.projectRoot,
    provider: opts.provider,
    model: opts.model,
    scanResult: opts.scanResult,
    sessionContext: opts.sessionContext,

    onMessage: (role, content) => {
      logger.info(`[${role}] ${content}`);
    },
    onStreamChunk: () => {
      // No-op in headless mode
    },
    onStreamComplete: () => {
      // No-op in headless mode
    },
    onToolStart: (toolName, _input) => {
      const id = `tool_${++toolIdCounter}`;
      logger.debug(`Tool start: ${toolName} (${id})`);
      return id;
    },
    onToolEnd: (toolId, _output, error) => {
      if (error) {
        logger.debug(`Tool error: ${toolId}: ${error}`);
      } else {
        logger.debug(`Tool end: ${toolId}`);
      }
    },
    onPhaseChange: (phase) => {
      logger.info(`Phase: ${phase}`);
    },
    onComplete: (spec) => {
      completionDeferred.resolve(spec);
    },
    onError: (error) => {
      completionDeferred.reject(new Error(error));
      // Also unblock readyDeferred so the flow doesn't hang
      readyDeferred.resolve();
    },
    onWorkingChange: (_isWorking, status) => {
      logger.debug(status);
    },
    onReady: () => {
      readyDeferred.resolve();
    },
    onQuestion: () => {
      // Auto-mode: skip Q&A when a question arrives
      // skipToGeneration is called below after we detect interview phase
    },
  });

  // Step 1: Start orchestrator (enters context phase)
  await orchestrator.start();
  await readyDeferred.promise;
  readyDeferred = createDeferred();

  // Step 2: Process initial references
  if (opts.initialReferences && opts.initialReferences.length > 0) {
    for (const ref of opts.initialReferences) {
      if (ref.startsWith('issue:')) {
        const value = ref.slice(6);
        if (/^\d+$/.test(value)) {
          // Bare issue number — resolve from repo remote
          const repo = await detectGitHubRemote(opts.projectRoot);
          if (repo) {
            const detail = await fetchGitHubIssue(
              repo.owner,
              repo.repo,
              parseInt(value, 10),
            );
            if (detail) {
              const content = `# ${detail.title}\n\n${detail.body ?? ''}`;
              orchestrator.addReferenceContent(
                content,
                `GitHub issue #${value}`,
              );
              logger.info(`Added: GitHub issue #${value} ${detail.title}`);
              continue;
            }
          }
          logger.warn(
            `Could not fetch issue #${value} — no GitHub remote detected or gh CLI unavailable`,
          );
        } else {
          // Full URL — use addReference which handles GitHub URLs
          await orchestrator.addReference(value);
          readyDeferred = createDeferred();
        }
      } else {
        await orchestrator.addReference(ref);
        readyDeferred = createDeferred();
      }
    }
  }

  // Step 3: Advance to goals
  await orchestrator.advanceToGoals();
  await readyDeferred.promise;
  readyDeferred = createDeferred();

  // Step 4: Submit goals — this triggers codebase exploration + first question
  // The onQuestion callback will fire, and we handle it after submitGoals returns
  await orchestrator.submitGoals(opts.goals ?? '');
  await readyDeferred.promise;
  readyDeferred = createDeferred();

  // Step 5: Skip to generation (auto-mode skips Q&A)
  if (
    orchestrator.getPhase() === 'interview' ||
    orchestrator.getPhase() === 'goals'
  ) {
    await orchestrator.skipToGeneration();
  }

  // Wait for spec generation to complete (with timeout to prevent silent hangs)
  const TIMEOUT_MS = opts.timeoutMs ?? 5 * 60 * 1000; // default: 5 minutes
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Spec generation timed out after 5 minutes')),
      TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([completionDeferred.promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
