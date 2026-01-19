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
 * Default models for each provider
 * Using fast/cost-effective models for speed
 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  openrouter: 'anthropic/claude-3.5-sonnet',
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
export function getModel(provider: AIProvider = 'anthropic'): ProviderConfig {
  const modelId = DEFAULT_MODELS[provider];

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
