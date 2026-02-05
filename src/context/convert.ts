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
