import {
  AIProvider,
  DEFAULT_PROVIDER_PROFILES,
  type AiProviderProfile,
  type AIProviderConfig
} from '@cio/ai-assistant';
import { getProviderConfigForProvider } from '@cio/ai-assistant/providers';
import { getOrgAiProviderSettings, updateOrgAiProviderSettings } from '@cio/db/queries/agent';

import { AppError } from '@api/utils/errors';

export interface ResolvedOrgAiProvider {
  /** Effective profiles: persisted org profiles, or the built-in defaults when none are stored. */
  profiles: AiProviderProfile[];
  /** True when the returned profiles are the computed defaults (nothing persisted yet). */
  isDefault: boolean;
}

/** Strips empty strings and normalizes profile fields for storage. */
function normalizeProfile(profile: AiProviderProfile): AiProviderProfile {
  return {
    ...profile,
    baseURL: profile.baseURL?.trim() || undefined,
    apiKey: profile.apiKey?.trim() || undefined,
    model: profile.model?.trim() || undefined
  };
}

/**
 * Resolves the effective AI provider profiles for an org.
 *
 * Returns the persisted profiles when set, otherwise the built-in default
 * profiles (the previously hardcoded constants, now a modifiable default
 * state). Env vars still supply API keys when a profile has none.
 */
export async function getResolvedOrgAiProvider(orgId: string): Promise<ResolvedOrgAiProvider> {
  const stored = await getOrgAiProviderSettings(orgId);

  if (stored?.profiles?.length) {
    return { profiles: stored.profiles, isDefault: false };
  }

  return { profiles: DEFAULT_PROVIDER_PROFILES, isDefault: true };
}

/**
 * Updates the org-level AI provider profiles.
 *
 * Accepts either a full replacement (`{ profiles }`) or a reset
 * (`{ reset: true }`) that clears the stored profiles so the system falls
 * back to the built-in defaults + env vars.
 */
export async function updateOrgAiProviderService(
  orgId: string,
  patch: { profiles?: AiProviderProfile[]; reset?: boolean }
): Promise<ResolvedOrgAiProvider> {
  if (patch.reset) {
    await updateOrgAiProviderSettings(orgId, null);
    return { profiles: DEFAULT_PROVIDER_PROFILES, isDefault: true };
  }

  const profiles = (patch.profiles ?? []).map(normalizeProfile);

  const stored = await updateOrgAiProviderSettings(orgId, profiles);
  if (!stored) {
    throw new AppError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
  }

  return { profiles: stored.profiles, isDefault: false };
}

/**
 * Resolves the provider config for a specific provider, merging org-level
 * profiles with env-var defaults.
 *
 * Precedence: profile apiKey → env var → null
 *             profile baseURL → provider default (createModel fallback)
 *             model param → profile model → env default
 *
 * When several profiles share a provider type, the one flagged `isDefault`
 * wins; otherwise the first match in list order. Returns null when neither
 * the profile nor the env var has an API key.
 */
export async function getOrgAwareProviderConfig(
  orgId: string,
  provider: AIProvider,
  model?: string
): Promise<AIProviderConfig | null> {
  const stored = await getOrgAiProviderSettings(orgId);
  const profiles = stored?.profiles?.length ? stored.profiles : DEFAULT_PROVIDER_PROFILES;

  const envConfig = getProviderConfigForProvider(provider);
  const match =
    profiles.find((profile) => profile.provider === provider && profile.isDefault) ??
    profiles.find((profile) => profile.provider === provider);

  // No profile for this provider — fall back to env var.
  if (!match) {
    if (!envConfig) return null;
    return { ...envConfig, model: model ?? envConfig.model };
  }

  const apiKey = match.apiKey || envConfig?.apiKey || '';
  if (!apiKey) return null;

  return {
    provider,
    apiKey,
    baseURL: match.baseURL || undefined,
    model: model ?? match.model ?? envConfig?.model ?? undefined
  };
}
