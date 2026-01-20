/**
 * Braintrust Tracing Utility
 * Provides AI call tracing for debugging and analysis
 */

import { initLogger, wrapAISDK } from 'braintrust';
import * as ai from 'ai';

// Re-export traced utilities
export { traced, currentSpan, wrapTraced } from 'braintrust';

/**
 * Initialize Braintrust logger if API key is available
 */
let loggerInitialized = false;

export function initTracing(): void {
  if (loggerInitialized) return;

  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) {
    // Silently skip tracing if no API key
    return;
  }

  try {
    initLogger({
      apiKey,
      projectName: process.env.BRAINTRUST_PROJECT_NAME || 'wiggum-cli',
    });
    loggerInitialized = true;
  } catch {
    // Silently fail if tracing can't be initialized
  }
}

/**
 * Check if tracing is enabled
 */
export function isTracingEnabled(): boolean {
  return !!process.env.BRAINTRUST_API_KEY;
}

/**
 * Get wrapped AI SDK functions for automatic tracing
 * Falls back to original functions if tracing not available
 */
export function getTracedAI() {
  initTracing();

  if (isTracingEnabled()) {
    return wrapAISDK(ai);
  }

  // Return original AI SDK functions if tracing not enabled
  return ai;
}

/**
 * Wrap a function with tracing
 * No-op if tracing is not enabled
 */
export function maybeTraced<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: { type?: string; name?: string } = {}
): T {
  if (!isTracingEnabled()) {
    return fn;
  }

  const { wrapTraced } = require('braintrust');
  return wrapTraced(fn, {
    type: options.type || 'function',
    name: options.name || fn.name || 'anonymous',
  });
}
