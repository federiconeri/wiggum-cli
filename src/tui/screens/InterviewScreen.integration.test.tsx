/**
 * Integration tests for InterviewScreen
 *
 * Tests the full TUI render with mocked AI layers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { InterviewScreen } from './InterviewScreen.js';
import { stripAnsi, wait, pressEscape, renderAndWait } from '../../__test-utils__/ink-helpers.js';

const testHeader = <Text>TEST HEADER</Text>;

// --- Module-level mocks ---

// Mock tracing (already done in setup.ts, but be explicit)
vi.mock('../../utils/tracing.js', () => ({
  initTracing: vi.fn(),
  flushTracing: vi.fn().mockResolvedValue(undefined),
}));

// Track the orchestrator instance for test control
let mockOrchestratorInstance: {
  start: ReturnType<typeof vi.fn>;
  getPhase: ReturnType<typeof vi.fn>;
  addReference: ReturnType<typeof vi.fn>;
  advanceToGoals: ReturnType<typeof vi.fn>;
  submitGoals: ReturnType<typeof vi.fn>;
  submitAnswer: ReturnType<typeof vi.fn>;
  skipToGeneration: ReturnType<typeof vi.fn>;
};

vi.mock('../orchestration/interview-orchestrator.js', () => {
  class MockInterviewOrchestrator {
    start: ReturnType<typeof vi.fn>;
    getPhase: ReturnType<typeof vi.fn>;
    addReference: ReturnType<typeof vi.fn>;
    advanceToGoals: ReturnType<typeof vi.fn>;
    submitGoals: ReturnType<typeof vi.fn>;
    submitAnswer: ReturnType<typeof vi.fn>;
    skipToGeneration: ReturnType<typeof vi.fn>;

    constructor(opts: Record<string, unknown>) {
      this.start = vi.fn().mockImplementation(async () => {
        const onPhaseChange = opts.onPhaseChange as (phase: string) => void;
        const onReady = opts.onReady as () => void;
        const onMessage = opts.onMessage as (role: string, content: string) => void;
        onPhaseChange('context');
        onMessage('system', 'Phase 1: Context - New spec for feature: test-feature');
        onReady();
      });
      this.getPhase = vi.fn().mockReturnValue('context');
      this.addReference = vi.fn();
      this.advanceToGoals = vi.fn();
      this.submitGoals = vi.fn();
      this.submitAnswer = vi.fn();
      this.skipToGeneration = vi.fn();
      mockOrchestratorInstance = this;
    }
  }
  return {
    InterviewOrchestrator: MockInterviewOrchestrator,
    extractSessionContext: vi.fn(),
  };
});

// Mock context loading
vi.mock('../../context/index.js', () => ({
  loadContext: vi.fn().mockResolvedValue(null),
  toScanResultFromPersisted: vi.fn(),
  getContextAge: vi.fn(),
}));

// Mock useSpecGenerator with real-ish state management
const mockState = {
  phase: 'context' as string,
  messages: [] as Array<{ id: string; role: string; content: string }>,
  isWorking: false,
  awaitingInput: true,
  workingStatus: '',
  error: null as string | null,
};

vi.mock('../hooks/useSpecGenerator.js', () => ({
  useSpecGenerator: () => ({
    state: mockState,
    initialize: vi.fn(),
    addMessage: vi.fn((role: string, content: string) => {
      mockState.messages.push({ id: `msg-${Date.now()}`, role, content });
    }),
    addStreamingMessage: vi.fn(),
    updateStreamingMessage: vi.fn(),
    completeStreamingMessage: vi.fn(),
    startToolCall: vi.fn().mockReturnValue('tool-1'),
    completeToolCall: vi.fn(),
    setPhase: vi.fn((phase: string) => {
      mockState.phase = phase;
    }),
    setGeneratedSpec: vi.fn(),
    setError: vi.fn((err: string) => {
      mockState.error = err;
    }),
    setWorking: vi.fn((isWorking: boolean, status: string) => {
      mockState.isWorking = isWorking;
      mockState.workingStatus = status;
    }),
    setReady: vi.fn(() => {
      mockState.isWorking = false;
      mockState.awaitingInput = true;
    }),
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

describe('InterviewScreen integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    mockState.phase = 'context';
    mockState.messages = [];
    mockState.isWorking = false;
    mockState.awaitingInput = true;
    mockState.workingStatus = '';
    mockState.error = null;
  });

  it('renders and initializes orchestrator on mount', async () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    const instance = await renderAndWait(
      () =>
        render(
          <InterviewScreen
            header={testHeader}
            featureName="test-feature"
            projectRoot="/tmp/test"
            provider="anthropic"
            model="sonnet"
            onComplete={onComplete}
            onCancel={onCancel}
          />,
        ),
      100,
    );

    // Orchestrator should have been created and started
    expect(mockOrchestratorInstance.start).toHaveBeenCalled();

    // Should render the footer with feature name
    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('New Spec');
    expect(frame).toContain('test-feature');

    instance.unmount();
  });

  it('shows footer with phase info', async () => {
    const instance = await renderAndWait(
      () =>
        render(
          <InterviewScreen
            header={testHeader}
            featureName="my-feature"
            projectRoot="/tmp/test"
            provider="anthropic"
            model="sonnet"
            onComplete={vi.fn()}
            onCancel={vi.fn()}
          />,
        ),
      100,
    );

    const frame = stripAnsi(instance.lastFrame() ?? '');
    expect(frame).toContain('Context');
    expect(frame).toContain('my-feature');
    instance.unmount();
  });

  it('Escape calls onCancel', async () => {
    const onCancel = vi.fn();
    const instance = await renderAndWait(
      () =>
        render(
          <InterviewScreen
            header={testHeader}
            featureName="test-feature"
            projectRoot="/tmp/test"
            provider="anthropic"
            model="sonnet"
            onComplete={vi.fn()}
            onCancel={onCancel}
          />,
        ),
      100,
    );

    pressEscape(instance);
    await wait(30);

    expect(onCancel).toHaveBeenCalled();
    instance.unmount();
  });

  it('shows ChatInput for free-text input by default', async () => {
    const instance = await renderAndWait(
      () =>
        render(
          <InterviewScreen
            header={testHeader}
            featureName="test-feature"
            projectRoot="/tmp/test"
            provider="anthropic"
            model="sonnet"
            onComplete={vi.fn()}
            onCancel={vi.fn()}
          />,
        ),
      100,
    );

    const frame = instance.lastFrame() ?? '';
    // Should show the prompt character from ChatInput
    expect(frame).toContain('›');
    instance.unmount();
  });
});
