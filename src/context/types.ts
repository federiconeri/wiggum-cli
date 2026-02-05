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
