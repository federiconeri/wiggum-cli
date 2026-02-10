/**
 * AI mock factory
 *
 * Provides mock LanguageModel and provider helpers for tests that
 * exercise AI-dependent code without hitting real APIs.
 */

import { vi } from 'vitest';

/**
 * A single mock response for doGenerate.
 */
export interface MockGenerateResponse {
  text: string;
  finishReason?: string;
}

/**
 * Create a mock LanguageModel that returns canned responses.
 *
 * Each call to `doGenerate` pops the next response from the list.
 * `doStream` wraps responses as a ReadableStream for streaming tests.
 */
export function createMockLanguageModel(responses: MockGenerateResponse[] = []) {
  let callIndex = 0;

  return {
    specificationVersion: 'v1' as const,
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: undefined,

    doGenerate: vi.fn(async () => {
      const response = responses[callIndex] ?? { text: '', finishReason: 'stop' };
      callIndex++;
      return {
        text: response.text,
        finishReason: response.finishReason ?? 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        rawCall: { rawPrompt: '', rawSettings: {} },
      };
    }),

    doStream: vi.fn(async () => {
      const response = responses[callIndex] ?? { text: '', finishReason: 'stop' };
      callIndex++;

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', textDelta: response.text });
          controller.enqueue({
            type: 'finish',
            finishReason: response.finishReason ?? 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
          });
          controller.close();
        },
      });

      return {
        stream,
        rawCall: { rawPrompt: '', rawSettings: {} },
      };
    }),
  };
}

/**
 * Create a full mock providers module for vi.mock('…/ai/providers.js').
 *
 * Usage:
 *   vi.mock('../../ai/providers.js', () => mockProviders([{ text: 'Hello' }]));
 */
export function mockProviders(responses: MockGenerateResponse[] = []) {
  const model = createMockLanguageModel(responses);
  return {
    getModel: vi.fn(() => model),
    getAvailableProvider: vi.fn(() => 'anthropic' as const),
    normalizeModelId: vi.fn((id: string) => id),
    isReasoningModel: vi.fn(() => false),
    isAnthropicAlias: vi.fn(() => false),
    hasTavilyKey: vi.fn(() => false),
    hasContext7Key: vi.fn(() => false),
    AVAILABLE_MODELS: {
      anthropic: [{ value: 'sonnet', label: 'Sonnet', hint: 'recommended' }],
      openai: [{ value: 'gpt-4o', label: 'GPT-4o' }],
      openrouter: [{ value: 'auto', label: 'Auto' }],
    },
  };
}
