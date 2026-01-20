/**
 * AI Provider Configuration
 * Configures AI providers (Anthropic, OpenAI, OpenRouter) for the enhancer
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * Supported AI providers
 */
export type AIProvider = 'anthropic' | 'openai' | 'openrouter';

/**
 * Provider configuration result
 */
export interface ProviderConfig {
  model: LanguageModel;
  provider: AIProvider;
  modelId: string;
}

/**
 * Environment variable names for each provider
 */
const API_KEY_ENV_VARS: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Model option with label and value
 */
export interface ModelOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Available models for each provider
 */
export const AVAILABLE_MODELS: Record<AIProvider, ModelOption[]> = {
  anthropic: [
    { value: 'claude-opus-4-5-20250514', label: 'Claude Opus 4.5', hint: 'most capable' },
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5', hint: 'recommended' },
    { value: 'claude-haiku-4-5-20250514', label: 'Claude Haiku 4.5', hint: 'fastest' },
  ],
  openai: [
    { value: 'gpt-5.1', label: 'GPT-5.1', hint: 'most capable' },
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max', hint: 'best for code' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini', hint: 'fastest' },
  ],
  openrouter: [
    { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro', hint: 'Google' },
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', hint: 'fast' },
    { value: 'deepseek/deepseek-v3.2', label: 'DeepSeek v3.2', hint: 'efficient' },
    { value: 'z-ai/glm-4.7', label: 'GLM 4.7', hint: 'Z-AI' },
    { value: 'minimax/minimax-m2.1', label: 'MiniMax M2.1', hint: 'MiniMax' },
  ],
};

/**
 * Default models for each provider
 * Using balanced models for good results
 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250514',
  openai: 'gpt-5.1',
  openrouter: 'google/gemini-3-pro-preview',
};

/**
 * Check if an API key is available for a provider
 */
export function hasApiKey(provider: AIProvider): boolean {
  const envVar = API_KEY_ENV_VARS[provider];
  return !!process.env[envVar];
}

/**
 * Get the API key for a provider
 * @throws Error if API key is not set
 */
function getApiKey(provider: AIProvider): string {
  const envVar = API_KEY_ENV_VARS[provider];
  const apiKey = process.env[envVar];

  if (!apiKey) {
    throw new Error(
      `API key not found. Set ${envVar} environment variable to use ${provider} provider.`
    );
  }

  return apiKey;
}

/**
 * Get a configured AI model for the specified provider
 */
export function getModel(provider: AIProvider = 'anthropic', customModelId?: string): ProviderConfig {
  const modelId = customModelId || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: getApiKey('anthropic'),
      });
      return {
        model: anthropic(modelId),
        provider,
        modelId,
      };
    }

    case 'openai': {
      const openai = createOpenAI({
        apiKey: getApiKey('openai'),
      });
      return {
        model: openai(modelId),
        provider,
        modelId,
      };
    }

    case 'openrouter': {
      // OpenRouter uses OpenAI-compatible API
      const openrouter = createOpenAI({
        apiKey: getApiKey('openrouter'),
        baseURL: 'https://openrouter.ai/api/v1',
      });
      return {
        model: openrouter(modelId),
        provider,
        modelId,
      };
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get the first available provider with an API key
 * Checks in order: anthropic, openai, openrouter
 */
export function getAvailableProvider(): AIProvider | null {
  const providers: AIProvider[] = ['anthropic', 'openai', 'openrouter'];

  for (const provider of providers) {
    if (hasApiKey(provider)) {
      return provider;
    }
  }

  return null;
}

/**
 * Get the environment variable name for a provider's API key
 */
export function getApiKeyEnvVar(provider: AIProvider): string {
  return API_KEY_ENV_VARS[provider];
}
