import { eq } from 'drizzle-orm';

import * as schema from '@db/schema';
import { db } from '@db/drizzle';

/**
 * AI provider configuration queries.
 *
 * Org-level provider profiles live in `organization.settings.aiProvider`
 * (JSONB). When unset, the system falls back to the built-in default
 * profiles plus env-var defaults.
 */

type OrgSettings = NonNullable<typeof schema.organization.$inferSelect.settings>;
type AiProviderSettings = NonNullable<OrgSettings['aiProvider']>;
type AiProviderProfile = NonNullable<AiProviderSettings['profiles']>[number];

/**
 * Legacy single-provider override stored before multi-profile support
 * (`{ provider, apiKey?, baseURL?, model? }`). Converted to one profile.
 */
function legacyToProfile(legacy: Record<string, unknown>): AiProviderProfile {
  const provider = legacy['provider'] as AiProviderProfile['provider'];
  return {
    id: provider ?? 'default',
    name: provider ?? 'Default',
    provider,
    apiKey: (legacy['apiKey'] as string | undefined) ?? undefined,
    baseURL: (legacy['baseURL'] as string | undefined) ?? undefined,
    model: (legacy['model'] as string | undefined) ?? undefined,
    isDefault: true
  };
}

export async function getOrgAiProviderSettings(orgId: string): Promise<AiProviderSettings | null> {
  try {
    const [row] = await db
      .select({ settings: schema.organization.settings })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1);

    const stored = row?.settings?.aiProvider;
    if (!stored) return null;

    // New shape: { profiles: [...] }
    if ('profiles' in stored && Array.isArray(stored.profiles)) {
      return stored as AiProviderSettings;
    }

    // Legacy single-provider override — migrate on read.
    return { profiles: [legacyToProfile(stored as Record<string, unknown>)] };
  } catch (error) {
    console.error('getOrgAiProviderSettings error:', error);
    throw new Error('Failed to fetch org AI provider settings');
  }
}

/**
 * Replaces the org's AI provider profiles. Pass `null` to remove the
 * `aiProvider` key entirely (reset to default profiles + env vars).
 */
export async function updateOrgAiProviderSettings(
  orgId: string,
  profiles: AiProviderProfile[] | null
): Promise<AiProviderSettings | null> {
  try {
    const [row] = await db
      .select({ settings: schema.organization.settings })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1);

    if (!row) return null;

    // When profiles is null, remove the aiProvider key entirely.
    if (profiles === null) {
      const { aiProvider: _drop, ...restSettings } = row.settings ?? {};
      const nextSettings = restSettings as OrgSettings;

      const [updated] = await db
        .update(schema.organization)
        .set({ settings: nextSettings })
        .where(eq(schema.organization.id, orgId))
        .returning({ settings: schema.organization.settings });

      return updated?.settings?.aiProvider ?? null;
    }

    const nextSettings: OrgSettings = {
      ...(row.settings ?? {}),
      aiProvider: { profiles }
    };

    const [updated] = await db
      .update(schema.organization)
      .set({ settings: nextSettings })
      .where(eq(schema.organization.id, orgId))
      .returning({ settings: schema.organization.settings });

    return updated?.settings?.aiProvider ?? null;
  } catch (error) {
    console.error('updateOrgAiProviderSettings error:', error);
    throw new Error('Failed to update org AI provider settings');
  }
}
