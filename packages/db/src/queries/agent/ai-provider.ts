import { eq } from 'drizzle-orm';

import * as schema from '@db/schema';
import { db } from '@db/drizzle';

/**
 * AI provider configuration queries.
 *
 * Org-level overrides live in `organization.settings.aiProvider` (JSONB).
 * When unset, the system falls back to env-var defaults.
 */

type OrgSettings = NonNullable<typeof schema.organization.$inferSelect.settings>;
type AiProviderSettings = NonNullable<OrgSettings['aiProvider']>;

export async function getOrgAiProviderSettings(orgId: string): Promise<AiProviderSettings | null> {
  try {
    const [row] = await db
      .select({ settings: schema.organization.settings })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1);

    return row?.settings?.aiProvider ?? null;
  } catch (error) {
    console.error('getOrgAiProviderSettings error:', error);
    throw new Error('Failed to fetch org AI provider settings');
  }
}

export async function updateOrgAiProviderSettings(
  orgId: string,
  patch: Partial<AiProviderSettings> | null
): Promise<AiProviderSettings | null> {
  try {
    const [row] = await db
      .select({ settings: schema.organization.settings })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1);

    if (!row) return null;

    // When patch is null, remove the aiProvider key entirely (reset to env-var defaults)
    if (patch === null) {
      const { aiProvider: _drop, ...restSettings } = row.settings ?? {};
      const nextSettings = restSettings as OrgSettings;

      const [updated] = await db
        .update(schema.organization)
        .set({ settings: nextSettings })
        .where(eq(schema.organization.id, orgId))
        .returning({ settings: schema.organization.settings });

      return updated?.settings?.aiProvider ?? null;
    }

    const currentAiProvider = row.settings?.aiProvider ?? {};
    const next: AiProviderSettings = { ...currentAiProvider, ...patch } as AiProviderSettings;

    const nextSettings: OrgSettings = {
      ...(row.settings ?? {}),
      aiProvider: next
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
