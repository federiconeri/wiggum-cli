/**
 * useCommandHistory - Command history for ↑ arrow recall
 *
 * Manages a list of previously entered commands for easy recall.
 */

import { useState, useCallback } from 'react';

/**
 * Maximum number of commands to store in history
 */
const MAX_HISTORY_SIZE = 100;

/**
 * Return value from useCommandHistory hook
 */
export interface UseCommandHistoryReturn {
  /** Add a command to history */
  addToHistory: (command: string) => void;
  /** Navigate to previous command (↑ arrow) */
  navigateUp: () => string | null;
  /** Navigate to next command (↓ arrow) */
  navigateDown: () => string | null;
  /** Get current history item */
  getCurrentItem: () => string | null;
  /** Reset navigation index (called when user starts typing) */
  resetNavigation: () => void;
  /** Get all history items */
  getHistory: () => string[];
}

/**
 * useCommandHistory - React hook for managing command history
 *
 * Provides ↑/↓ arrow navigation through previously entered commands.
 *
 * @example
 * ```tsx
 * function ChatInput() {
 *   const { addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();
 *   const [value, setValue] = useState('');
 *
 *   useInput((input, key) => {
 *     if (key.upArrow) {
 *       const prev = navigateUp();
 *       if (prev) setValue(prev);
 *     }
 *     if (key.downArrow) {
 *       const next = navigateDown();
 *       setValue(next || '');
 *     }
 *   });
 *
 *   const handleSubmit = (cmd: string) => {
 *     addToHistory(cmd);
 *     // ... submit logic
 *   };
 * }
 * ```
 */
export function useCommandHistory(): UseCommandHistoryReturn {
  // History is stored newest-first (index 0 = most recent)
  const [history, setHistory] = useState<string[]>([]);
  // Navigation index: -1 = new input, 0 = most recent, etc.
  const [navIndex, setNavIndex] = useState(-1);

  /**
   * Add a command to history
   */
  const addToHistory = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      // Remove duplicate if exists
      const filtered = prev.filter((cmd) => cmd !== trimmed);
      // Add to front (newest first)
      const updated = [trimmed, ...filtered];
      // Trim to max size
      return updated.slice(0, MAX_HISTORY_SIZE);
    });

    // Reset navigation when adding new command
    setNavIndex(-1);
  }, []);

  /**
   * Navigate to previous command (↑ arrow)
   * Returns the command or null if at the end
   */
  const navigateUp = useCallback((): string | null => {
    if (history.length === 0) return null;

    const newIndex = Math.min(navIndex + 1, history.length - 1);
    setNavIndex(newIndex);
    return history[newIndex] ?? null;
  }, [history, navIndex]);

  /**
   * Navigate to next command (↓ arrow)
   * Returns the command or null if at new input
   */
  const navigateDown = useCallback((): string | null => {
    if (navIndex <= 0) {
      setNavIndex(-1);
      return null;
    }

    const newIndex = navIndex - 1;
    setNavIndex(newIndex);
    return history[newIndex] ?? null;
  }, [history, navIndex]);

  /**
   * Get current history item
   */
  const getCurrentItem = useCallback((): string | null => {
    if (navIndex < 0 || navIndex >= history.length) return null;
    return history[navIndex];
  }, [history, navIndex]);

  /**
   * Reset navigation index (called when user types)
   */
  const resetNavigation = useCallback(() => {
    setNavIndex(-1);
  }, []);

  /**
   * Get all history items
   */
  const getHistory = useCallback((): string[] => {
    return [...history];
  }, [history]);

  return {
    addToHistory,
    navigateUp,
    navigateDown,
    getCurrentItem,
    resetNavigation,
    getHistory,
  };
}
