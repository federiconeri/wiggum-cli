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
