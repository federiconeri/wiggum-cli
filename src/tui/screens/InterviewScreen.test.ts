/**
 * Unit tests for InterviewScreen tracing lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tracing module before importing InterviewScreen
vi.mock('../../utils/tracing.js', () => ({
  initTracing: vi.fn(),
  flushTracing: vi.fn(),
}));

// Mock the useSpecGenerator hook to avoid complex setup
vi.mock('../hooks/useSpecGenerator.js', () => ({
  useSpecGenerator: () => ({
    state: {
      phase: 'context',
      messages: [],
      isWorking: false,
      awaitingInput: true,
      workingStatus: '',
      error: null,
    },
    initialize: vi.fn(),
    addMessage: vi.fn(),
    addStreamingMessage: vi.fn(),
    updateStreamingMessage: vi.fn(),
    completeStreamingMessage: vi.fn(),
    startToolCall: vi.fn(),
    completeToolCall: vi.fn(),
    setPhase: vi.fn(),
    setGeneratedSpec: vi.fn(),
    setError: vi.fn(),
    setWorking: vi.fn(),
    setReady: vi.fn(),
  }),
  PHASE_CONFIGS: {
    context: { name: 'Context', number: 1 },
    goals: { name: 'Goals', number: 2 },
    interview: { name: 'Interview', number: 3 },
    generation: { name: 'Generation', number: 4 },
    complete: { name: 'Complete', number: 5 },
  },
  TOTAL_DISPLAY_PHASES: 4,
}));

// Mock the InterviewOrchestrator
vi.mock('../orchestration/interview-orchestrator.js', () => ({
  InterviewOrchestrator: class MockInterviewOrchestrator {
    start = vi.fn();
    getPhase = vi.fn().mockReturnValue('context');
  },
}));

// Mock context loading
vi.mock('../../context/index.js', () => ({
  loadContext: vi.fn().mockResolvedValue(null),
  toScanResultFromPersisted: vi.fn(),
  getContextAge: vi.fn(),
}));

import React from 'react';
import { render } from 'ink-testing-library';
import { initTracing, flushTracing } from '../../utils/tracing.js';
import { InterviewScreen } from './InterviewScreen.js';

describe('InterviewScreen tracing lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls initTracing on mount', async () => {
    let unmountFn: (() => void) | undefined;
    try {
      const result = render(
        React.createElement(InterviewScreen, {
          featureName: 'test-feature',
          projectRoot: '/tmp/test',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          onComplete: vi.fn(),
          onCancel: vi.fn(),
        })
      );
      unmountFn = result.unmount;

      // Wait for effects to run
      await new Promise(resolve => setTimeout(resolve, 10));

      // initTracing should be called at least once (may be called more in strict mode)
      expect(initTracing).toHaveBeenCalled();
    } finally {
      unmountFn?.();
    }
  });

  it('calls flushTracing on unmount', async () => {
    // Clear mocks again to ensure clean state
    vi.clearAllMocks();

    const { unmount } = render(
      React.createElement(InterviewScreen, {
        featureName: 'test-feature',
        projectRoot: '/tmp/test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      })
    );

    // Wait for effects to run
    await new Promise(resolve => setTimeout(resolve, 10));

    // Clear mocks after mount to isolate unmount behavior
    vi.clearAllMocks();

    unmount();

    // Wait a tick for cleanup to run
    await new Promise(resolve => setTimeout(resolve, 10));

    // flushTracing should be called on unmount
    expect(flushTracing).toHaveBeenCalled();
  });
});
