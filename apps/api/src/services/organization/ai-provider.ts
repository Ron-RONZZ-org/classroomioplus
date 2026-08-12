import {
  AIProvider,
  AgentRole,
  type AIProviderConfig,
  type AiProfileRole,
  type OrgAiProfile,
  type OrgAiProvider,
  type OrgAiProviderManagement
} from '@cio/ai-assistant';
import { getProviderConfigForProvider } from '@cio/ai-assistant/providers';
import {
  activateOrgAiProfile,
  createOrgAiProfile,
  createOrgAiProvider,
  deleteOrgAiProfile,
  deleteOrgAiProvider,
  ensureDefaultAiProviderData,
  getOrgAiProviderManagement,
  updateOrgAiProfile,
  updateOrgAiProvider
} from '@cio/db/queries/agent';

import { AppError, ErrorCodes } from '@api/utils/errors';

/**
 * AI provider & profile management service.
 *
 * Separation of concerns:
 *   - Providers: the org's catalog (name, underlying SDK type, default base URL).
 *   - Profiles: credential sets referencing a provider (API key, base URL, model).
 *   - Active profile per agent role: one profile can serve the teacher agent and
 *     one can serve the student agent.
 */

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getOrgAiProviderManagementService(orgId: string): Promise<OrgAiProviderManagement | null> {
  return getOrgAiProviderManagement(orgId);
}

/** Idempotently seeds default provider/profile data. Used at org creation. */
export async function seedDefaultAiProviderDataService(orgId: string): Promise<void> {
  await ensureDefaultAiProviderData(orgId);
}

// ─── Provider CRUD ────────────────────────────────────────────────────────────

export async function createAiProviderService(
  orgId: string,
  data: { name: string; providerType: OrgAiProvider['providerType']; defaultBaseUrl?: string }
): Promise<OrgAiProvider> {
  const provider = await createOrgAiProvider(orgId, data);
  if (!provider) {
    throw new AppError('Organization not found', ErrorCodes.ORGANIZATION_NOT_FOUND, 404);
  }
  return provider;
}

export async function updateAiProviderService(
  orgId: string,
  providerId: string,
  patch: Partial<Pick<OrgAiProvider, 'name' | 'providerType' | 'defaultBaseUrl'>>
): Promise<OrgAiProvider> {
  const provider = await updateOrgAiProvider(orgId, providerId, patch);
  if (!provider) {
    throw new AppError('AI provider not found', ErrorCodes.NOT_FOUND, 404);
  }
  return provider;
}

export async function deleteAiProviderService(orgId: string, providerId: string): Promise<{ deleted: true }> {
  const result = await deleteOrgAiProvider(orgId, providerId);
  if (!result) {
    throw new AppError('AI provider not found', ErrorCodes.NOT_FOUND, 404);
  }

  if (!result.deleted) {
    throw new AppError(
      `AI provider is still referenced by ${result.referencedByProfiles} profile(s). Repoint or delete those profiles first.`,
      ErrorCodes.CONFLICT,
      409
    );
  }

  return { deleted: true };
}

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

export async function createAiProfileService(
  orgId: string,
  data: { name: string; providerId: string; apiKey?: string; baseURL?: string; model?: string }
): Promise<OrgAiProfile> {
  const management = await getOrgAiProviderManagement(orgId);
  if (!management) {
    throw new AppError('Organization not found', ErrorCodes.ORGANIZATION_NOT_FOUND, 404);
  }

  const provider = management.providers.find((p) => p.id === data.providerId);
  if (!provider) {
    throw new AppError('AI provider not found', ErrorCodes.NOT_FOUND, 404);
  }

  // Default the base URL from the provider catalog when the caller left it empty.
  const baseURL = data.baseURL || provider.defaultBaseUrl || undefined;
  const profile = await createOrgAiProfile(orgId, { ...data, baseURL });
  if (!profile) {
    throw new AppError('Organization not found', ErrorCodes.ORGANIZATION_NOT_FOUND, 404);
  }
  return profile;
}

export async function updateAiProfileService(
  orgId: string,
  profileId: string,
  patch: Partial<Pick<OrgAiProfile, 'name' | 'providerId' | 'apiKey' | 'baseURL' | 'model'>>
): Promise<OrgAiProfile> {
  const management = await getOrgAiProviderManagement(orgId);
  if (!management) {
    throw new AppError('Organization not found', ErrorCodes.ORGANIZATION_NOT_FOUND, 404);
  }

  if (patch.providerId && !management.providers.some((p) => p.id === patch.providerId)) {
    throw new AppError('AI provider not found', ErrorCodes.NOT_FOUND, 404);
  }

  const profile = await updateOrgAiProfile(orgId, profileId, patch);
  if (!profile) {
    throw new AppError('AI profile not found', ErrorCodes.NOT_FOUND, 404);
  }
  return profile;
}

export async function deleteAiProfileService(orgId: string, profileId: string): Promise<{ deleted: true }> {
  const deleted = await deleteOrgAiProfile(orgId, profileId);
  if (!deleted) {
    throw new AppError('AI profile not found', ErrorCodes.NOT_FOUND, 404);
  }
  return { deleted: true };
}

export async function activateAiProfileService(
  orgId: string,
  role: AiProfileRole,
  profileId: string
): Promise<Partial<Record<AiProfileRole, string>>> {
  const management = await getOrgAiProviderManagement(orgId);
  if (!management) {
    throw new AppError('Organization not found', ErrorCodes.ORGANIZATION_NOT_FOUND, 404);
  }

  if (!management.profiles.some((p) => p.id === profileId)) {
    throw new AppError('AI profile not found', ErrorCodes.NOT_FOUND, 404);
  }

  const active = await activateOrgAiProfile(orgId, role, profileId);
  if (!active) {
    throw new AppError('AI profile not found', ErrorCodes.NOT_FOUND, 404);
  }
  return active;
}

// ─── Agent resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the provider config for a specific provider + role, merging org-level
 * profiles with env-var defaults.
 *
 * Precedence:
 *   1. The profile activated for `role` — used only when its provider matches the
 *      requested provider AND it has an API key.
 *   2. Env-var defaults for the requested provider.
 *
 * Legacy single-override data (`settings.aiProvider`) is transparently migrated
 * into a profile active for both roles on first read, so no separate legacy path
 * is needed here.
 */
export async function getOrgAwareProviderConfig(
  orgId: string,
  provider: AIProvider,
  model?: string,
  role: AgentRole = AgentRole.TEACHER
): Promise<AIProviderConfig | null> {
  const management = await getOrgAiProviderManagement(orgId);

  const profileId = management?.activeProfileByRole?.[role];
  if (management && profileId) {
    const profile = management.profiles.find((p) => p.id === profileId);
    if (profile) {
      const catalogProvider = management.providers.find((p) => p.id === profile.providerId);
      if (catalogProvider && catalogProvider.providerType === provider && profile.apiKey) {
        return {
          provider,
          apiKey: profile.apiKey,
          baseURL: profile.baseURL || catalogProvider.defaultBaseUrl || undefined,
          model: model ?? profile.model
        };
      }
    }
  }

  const envConfig = getProviderConfigForProvider(provider);
  if (!envConfig) return null;
  return { ...envConfig, model: model ?? envConfig.model };
}
