/**
 * useBackgroundRuns - Hook for tracking background run processes
 *
 * Manages a list of backgrounded feature loop runs, polling their
 * status files periodically to track completion.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { readLoopStatus, type LoopStatus } from '../utils/loop-status.js';
import { logger } from '../../utils/logger.js';

const POLL_INTERVAL_MS = 5000;

/**
 * A backgrounded feature loop run
 */
export interface BackgroundRun {
  /** Feature name being implemented */
  featureName: string;
  /** Timestamp when backgrounded */
  backgroundedAt: number;
  /** Path to the log file */
  logPath: string;
  /** Last polled status */
  lastStatus: LoopStatus;
  /** Whether the run has completed */
  completed: boolean;
}

/**
 * Return type for useBackgroundRuns hook
 */
export interface UseBackgroundRunsReturn {
  /** Current list of background runs */
  runs: BackgroundRun[];
  /** Add a feature to background tracking */
  background: (featureName: string) => void;
  /** Remove a completed run from tracking */
  dismiss: (featureName: string) => void;
  /** Get a specific run by feature name */
  getRun: (featureName: string) => BackgroundRun | undefined;
}

/**
 * Hook to track background feature loop runs
 *
 * @example
 * ```tsx
 * const { runs, background, dismiss, getRun } = useBackgroundRuns();
 *
 * // When user presses Esc on RunScreen
 * background('my-feature');
 *
 * // Check if a feature is running in background
 * const run = getRun('my-feature');
 * ```
 */
export function useBackgroundRuns(): UseBackgroundRunsReturn {
  const [runs, setRuns] = useState<BackgroundRun[]>([]);
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const startPolling = useCallback((featureName: string) => {
    // Clear existing timer if any
    const existing = pollTimers.current.get(featureName);
    if (existing) clearInterval(existing);

    let consecutiveFailures = 0;
    const MAX_FAILURES = 3;

    const timer = setInterval(() => {
      try {
        const status = readLoopStatus(featureName);
        consecutiveFailures = 0;
        const nowCompleted = !status.running;
        setRuns((prev) =>
          prev.map((run) => {
            if (run.featureName !== featureName) return run;
            return {
              ...run,
              lastStatus: status,
              completed: nowCompleted,
            };
          })
        );
        // Stop polling once the run completes
        if (nowCompleted) {
          clearInterval(timer);
          pollTimers.current.delete(featureName);
        }
      } catch (err) {
        consecutiveFailures++;
        logger.error(`Failed to poll status for ${featureName} (attempt ${consecutiveFailures}): ${err instanceof Error ? err.message : String(err)}`);
        if (consecutiveFailures >= MAX_FAILURES) {
          logger.error(`Stopping polling for ${featureName} after ${consecutiveFailures} consecutive failures`);
          clearInterval(timer);
          pollTimers.current.delete(featureName);
          setRuns((prev) =>
            prev.map((run) =>
              run.featureName === featureName ? { ...run, completed: true } : run
            )
          );
        }
      }
    }, POLL_INTERVAL_MS);

    pollTimers.current.set(featureName, timer);
  }, []);

  const background = useCallback((featureName: string) => {
    let status: LoopStatus;
    try {
      status = readLoopStatus(featureName);
    } catch (err) {
      logger.error(`Failed to read initial status for ${featureName}: ${err instanceof Error ? err.message : String(err)}`);
      // Assume still running so polling can discover truth — if truly dead, polling will detect it
      status = { running: true, iteration: 0, maxIterations: 0, phase: 'unknown', tokensInput: 0, tokensOutput: 0 };
    }
    const logPath = `/tmp/ralph-loop-${featureName}.log`;

    setRuns((prev) => {
      // Don't add duplicates
      if (prev.some((r) => r.featureName === featureName)) {
        return prev;
      }
      return [...prev, {
        featureName,
        backgroundedAt: Date.now(),
        logPath,
        lastStatus: status,
        completed: !status.running,
      }];
    });

    if (status.running) {
      startPolling(featureName);
    }
  }, [startPolling]);

  const dismiss = useCallback((featureName: string) => {
    // Clear poll timer
    const timer = pollTimers.current.get(featureName);
    if (timer) {
      clearInterval(timer);
      pollTimers.current.delete(featureName);
    }

    setRuns((prev) => prev.filter((r) => r.featureName !== featureName));
  }, []);

  const getRun = useCallback((featureName: string) => {
    return runs.find((r) => r.featureName === featureName);
  }, [runs]);

  // Cleanup all poll timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of pollTimers.current.values()) {
        clearInterval(timer);
      }
      pollTimers.current.clear();
    };
  }, []);

  return { runs, background, dismiss, getRun };
}
