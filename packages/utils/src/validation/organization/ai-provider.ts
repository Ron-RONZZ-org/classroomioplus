import { z } from 'zod';

/**
 * Validation schemas for org-level AI provider & profile management.
 *
 * Stored in `organization.settings.aiProviders` / `organization.settings.aiProfiles`
 * (JSONB). Providers are a catalog (name + underlying SDK type + default base URL);
 * profiles reference a provider and hold the API key / base URL / model for a
 * specific credential set. One profile can be activated per agent role.
 */

export const AI_PROVIDER_TYPES = ['openai', 'anthropic', 'google', 'moonshot', 'deepseek'] as const;
export type TAiProviderType = (typeof AI_PROVIDER_TYPES)[number];

export const ZAiProvider = z.object({
  name: z.string().min(1, 'Provider name is required'),
  providerType: z.enum(AI_PROVIDER_TYPES),
  defaultBaseUrl: z.string().url('Must be a valid URL').optional().or(z.literal(''))
});
export type TAiProvider = z.infer<typeof ZAiProvider>;

export const ZAiProviderPatch = ZAiProvider.partial();

export const ZAiProfile = z.object({
  name: z.string().min(1, 'Profile name is required'),
  providerId: z.string().min(1, 'Provider is required'),
  apiKey: z.string().min(1).optional().or(z.literal('')),
  baseURL: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  model: z.string().min(1).optional().or(z.literal(''))
});
export type TAiProfile = z.infer<typeof ZAiProfile>;

export const ZAiProfilePatch = ZAiProfile.partial();

export const AI_PROFILE_ROLES = ['teacher', 'student'] as const;
export type TAiProfileRole = (typeof AI_PROFILE_ROLES)[number];

export const ZActivateAiProfile = z.object({
  role: z.enum(AI_PROFILE_ROLES)
});
export type TActivateAiProfile = z.infer<typeof ZActivateAiProfile>;
