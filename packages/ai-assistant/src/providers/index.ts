import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { LanguageModel } from 'ai';
import { AIProvider, type AIProviderConfig } from '../types';

/**
 * Default base URL for DeepSeek's OpenAI-compatible API.
 */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

const DEFAULT_MODELS: Record<AIProvider, string> = {
  [AIProvider.OPENAI]: 'gpt-5.4-mini',
  [AIProvider.ANTHROPIC]: 'claude-sonnet-4-20250514',
  [AIProvider.GOOGLE]: 'gemini-3.1-flash-lite',
  [AIProvider.MOONSHOT]: 'kimi-k2.6',
  [AIProvider.DEEPSEEK]: 'deepseek-chat'
};

const PROVIDER_API_KEY_ENV: Record<AIProvider, string> = {
  [AIProvider.OPENAI]: 'OPENAI_API_KEY',
  [AIProvider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [AIProvider.GOOGLE]: 'GOOGLE_API_KEY',
  [AIProvider.MOONSHOT]: 'MOONSHOT_API_KEY',
  [AIProvider.DEEPSEEK]: 'DEEPSEEK_API_KEY'
};

/**
 * Resolves the effective baseURL for an OpenAI-compatible provider.
 *
 * Precedence: explicit `baseURL` on AIProviderConfig  →  OPENAI_BASE_URL env var  →  undefined (default).
 * For DeepSeek, the default is `https://api.deepseek.com/v1` unless overridden.
 */
function resolveOpenAIBaseURL(config: AIProviderConfig): string | undefined {
  if (config.baseURL) return config.baseURL;

  if (config.provider === AIProvider.DEEPSEEK) {
    return process.env['DEEPSEEK_BASE_URL'] || DEEPSEEK_BASE_URL;
  }

  return process.env['OPENAI_BASE_URL'] || undefined;
}

/**
 * Creates an AI SDK LanguageModel from provider configuration.
 * Normalizes all providers into a single interface for streamText().
 *
 * OpenAI-compatible providers (OpenAI, Moonshot, DeepSeek, custom) use
 * `createOpenAI()` with optional `baseURL`. Anthropic and Google use their
 * own SDK constructors.
 */
export function createModel(config: AIProviderConfig): LanguageModel {
  const modelName = config.model || DEFAULT_MODELS[config.provider];

  switch (config.provider) {
    case AIProvider.OPENAI:
    case AIProvider.DEEPSEEK: {
      const baseURL = resolveOpenAIBaseURL(config);
      const openai = createOpenAI({ apiKey: config.apiKey, baseURL });
      return openai(modelName);
    }
    case AIProvider.ANTHROPIC: {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(modelName);
    }
    case AIProvider.GOOGLE: {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(modelName);
    }
    case AIProvider.MOONSHOT: {
      const moonshot = createMoonshotAI({ apiKey: config.apiKey });
      return moonshot(modelName);
    }
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Reads the API key for a specific provider from its dedicated env var.
 * Returns null when the key is unset, so callers can decide whether to 503.
 */
export function getProviderConfigForProvider(provider: AIProvider): AIProviderConfig | null {
  const apiKey = process.env[PROVIDER_API_KEY_ENV[provider]];
  if (!apiKey) return null;

  return { provider, apiKey };
}

/**
 * Returns the first provider that has a key configured, in preference order.
 * Used by routes that don't take an explicit model (status check, title generation).
 */
export function pickAnyConfiguredProvider(): AIProviderConfig | null {
  const order: AIProvider[] = [
    AIProvider.GOOGLE,
    AIProvider.OPENAI,
    AIProvider.DEEPSEEK,
    AIProvider.ANTHROPIC,
    AIProvider.MOONSHOT
  ];

  for (const provider of order) {
    const config = getProviderConfigForProvider(provider);
    if (config) return config;
  }

  return null;
}
