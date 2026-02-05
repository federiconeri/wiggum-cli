/**
 * Context Converters
 * Map between runtime AI/scanner types and persisted context types
 */

import type { ScanResult, DetectionResult, DetectedStack } from '../scanner/types.js';
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
 * Convert a PersistedScanResult back into a minimal ScanResult
 * for use in prompt context (e.g., Project Tech Stack summary).
 */
export function toScanResultFromPersisted(
  persisted: PersistedScanResult,
  projectRoot: string,
): ScanResult {
  const toDetection = (
    name: string,
    version?: string,
    variant?: string,
  ): DetectionResult => ({
    name,
    version,
    variant,
    confidence: 100,
    evidence: ['persisted-context'],
  });

  const stack: DetectedStack = {};

  if (persisted.framework) {
    stack.framework = toDetection(
      persisted.framework,
      persisted.frameworkVersion,
      persisted.frameworkVariant,
    );
  }

  if (persisted.packageManager) {
    stack.packageManager = toDetection(persisted.packageManager);
  }

  const unit = persisted.testing?.unit ?? null;
  const e2e = persisted.testing?.e2e ?? null;
  if (unit || e2e) {
    stack.testing = {
      unit: unit ? toDetection(unit) : undefined,
      e2e: e2e ? toDetection(e2e) : undefined,
    };
  }

  if (persisted.styling) {
    stack.styling = toDetection(persisted.styling);
  }

  if (persisted.database) {
    stack.database = toDetection(persisted.database);
  }

  if (persisted.orm) {
    stack.orm = toDetection(persisted.orm);
  }

  if (persisted.auth) {
    stack.auth = toDetection(persisted.auth);
  }

  return {
    projectRoot,
    scanTime: 0,
    stack,
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
