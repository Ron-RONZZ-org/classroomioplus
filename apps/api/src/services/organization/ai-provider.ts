import { AIProvider, type AIProviderConfig, type OrgAiProviderSettings } from '@cio/ai-assistant';
import { getProviderConfigForProvider } from '@cio/ai-assistant/providers';
import { getOrgAiProviderSettings, updateOrgAiProviderSettings } from '@cio/db/queries/agent';

import { AppError } from '@api/utils/errors';

/**
 * Resolves the effective AI provider config for an org.
 *
 * Merge order (later overrides):
 *   env-var defaults  →  org-level settings (settings.aiProvider)
 *
 * When no org override is set, returns env-var-based config.
 */
export async function getResolvedOrgAiProvider(orgId: string): Promise<OrgAiProviderSettings | null> {
  const orgOverride = await getOrgAiProviderSettings(orgId);
  return orgOverride ?? null;
}

/**
 * Updates the org-level AI provider settings.
 */
export async function updateOrgAiProviderService(
  orgId: string,
  patch: Partial<OrgAiProviderSettings>
): Promise<OrgAiProviderSettings> {
  // When provider is an empty string, the caller wants to clear the override.
  // Pass null to the DB layer so it removes the aiProvider key entirely.
  const providerVal = patch.provider as string;
  if (providerVal === '') {
    const updated = await updateOrgAiProviderSettings(orgId, null);
    if (!updated) {
      throw new AppError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
    }
    return updated;
  }

  // Normalize empty strings to undefined
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === '') {
      clean[key] = undefined;
    } else {
      clean[key] = value;
    }
  }
  const normalizedPatch = clean as Partial<OrgAiProviderSettings> & { provider: string };

  const updated = await updateOrgAiProviderSettings(orgId, normalizedPatch);

  if (!updated) {
    throw new AppError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
  }

  return updated;
}

/**
 * Builds an AIProviderConfig from org-level provider settings.
 * Falls back to env-var defaults when org settings are missing fields.
 */
export function buildProviderConfigFromOrg(
  orgSettings: OrgAiProviderSettings,
  modelOverride?: string
): AIProviderConfig {
  const provider = orgSettings.provider as AIProvider;
  const apiKey = orgSettings.apiKey || process.env[getApiKeyEnvVar(provider)] || '';
  const baseURL = orgSettings.baseURL || undefined;
  const model = modelOverride || orgSettings.model || undefined;

  if (!apiKey) {
    throw new AppError(
      `AI provider "${provider}" has no API key configured. Set it in org settings or the ${getApiKeyEnvVar(provider)} env var.`,
      'AI_PROVIDER_NOT_CONFIGURED',
      503
    );
  }

  return { provider, apiKey, baseURL, model };
}

function getApiKeyEnvVar(provider: AIProvider): string {
  const map: Record<AIProvider, string> = {
    [AIProvider.OPENAI]: 'OPENAI_API_KEY',
    [AIProvider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
    [AIProvider.GOOGLE]: 'GOOGLE_API_KEY',
    [AIProvider.MOONSHOT]: 'MOONSHOT_API_KEY',
    [AIProvider.DEEPSEEK]: 'DEEPSEEK_API_KEY'
  };
  return map[provider] || 'OPENAI_API_KEY';
}

/**
 * Resolves the provider config for a specific provider, merging org-level
 * overrides with env-var defaults.
 *
 * Precedence: org settings.apiKey → env var → null
 *             org settings.baseURL → OPENAI_BASE_URL env → undefined
 *             org settings.model → model param → undefined
 *
 * Returns null when neither org settings nor env var has an API key.
 */
export async function getOrgAwareProviderConfig(
  orgId: string,
  provider: AIProvider,
  model?: string
): Promise<AIProviderConfig | null> {
  const orgSettings = await getOrgAiProviderSettings(orgId);
  const envConfig = getProviderConfigForProvider(provider);

  // If org has no override for this provider, fall back to env var
  if (!orgSettings || orgSettings.provider !== provider) {
    if (!envConfig) return null;
    return { ...envConfig, model: model ?? envConfig.model };
  }

  const apiKey = orgSettings.apiKey || envConfig?.apiKey || '';
  if (!apiKey) return null;

  return {
    provider: provider as AIProvider,
    apiKey,
    baseURL: orgSettings.baseURL || undefined,
    model: model ?? orgSettings.model ?? envConfig?.model ?? undefined
  };
}
