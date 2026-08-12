import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { AiProfileRole, OrgAiProfile, OrgAiProvider, OrgAiProviderManagement } from '@cio/ai-assistant';
import * as schema from '@db/schema';
import { db, type DbOrTxClient } from '@db/drizzle';

/**
 * AI provider & profile management queries.
 *
 * Org-level data lives in `organization.settings` (JSONB):
 *   - `aiProviders`  — catalog of providers (name, underlying SDK type, default base URL)
 *   - `aiProfiles`   — credential sets referencing a provider (api key, base URL, model)
 *   - `activeAiProfileByRole` — active profile id per agent role (teacher/student)
 *   - `aiProvider`   — legacy single override from pre-management versions; migrated on read
 *
 * No schema migration is required: the `settings` column is an untyped JSONB column
 * at the DB level; the shape is enforced by the `$type<>` annotation in schema.ts.
 */

type OrgSettings = NonNullable<typeof schema.organization.$inferSelect.settings>;

/**
 * Standard provider catalog seeded at org creation and on first read for
 * orgs created before provider management existed.
 */
export const DEFAULT_AI_PROVIDERS: Array<{
  name: string;
  providerType: OrgAiProvider['providerType'];
  defaultBaseUrl: string;
}> = [
  { name: 'OpenAI', providerType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1' },
  { name: 'Anthropic', providerType: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com' },
  { name: 'Google', providerType: 'google', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { name: 'Moonshot', providerType: 'moonshot', defaultBaseUrl: 'https://api.moonshot.ai/v1' },
  { name: 'DeepSeek', providerType: 'deepseek', defaultBaseUrl: 'https://api.deepseek.com/v1' }
];

async function readOrgSettings(orgId: string, dbClient: DbOrTxClient): Promise<OrgSettings | null> {
  const [row] = await dbClient
    .select({ settings: schema.organization.settings })
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1);

  return row?.settings ?? null;
}

async function writeOrgSettings(orgId: string, settings: OrgSettings, dbClient: DbOrTxClient): Promise<boolean> {
  const [row] = await dbClient
    .update(schema.organization)
    .set({ settings })
    .where(eq(schema.organization.id, orgId))
    .returning({ id: schema.organization.id });

  return row !== undefined;
}

function collectionFromSettings(settings: OrgSettings): OrgAiProviderManagement {
  return {
    providers: settings.aiProviders ?? [],
    profiles: settings.aiProfiles ?? [],
    activeProfileByRole: settings.activeAiProfileByRole ?? {}
  };
}

/**
 * Seeds the default provider catalog + one profile per provider and migrates a
 * legacy `settings.aiProvider` blob into a profile. Idempotent: no-ops once
 * `aiProviders`/`aiProfiles` exist.
 *
 * Called at org creation and lazily on first read (covers orgs created before
 * provider management existed).
 */
export async function ensureDefaultAiProviderData(orgId: string, dbClient: DbOrTxClient = db): Promise<void> {
  const settings = await readOrgSettings(orgId, dbClient);
  if (!settings) return;

  if (settings.aiProviders && settings.aiProfiles) return;

  const providers: OrgAiProvider[] = DEFAULT_AI_PROVIDERS.map((p) => ({ id: randomUUID(), ...p }));
  const profiles: OrgAiProfile[] = providers.map((provider) => ({
    id: randomUUID(),
    name: provider.name,
    providerId: provider.id,
    baseURL: provider.defaultBaseUrl
  }));

  // Migrate the legacy single override (pre-management) into a profile active for both roles.
  const activeProfileByRole: Partial<Record<AiProfileRole, string>> = {};
  if (settings.aiProvider) {
    const { provider, apiKey, baseURL, model } = settings.aiProvider;
    const providerEntry = providers.find((p) => p.providerType === provider) ?? providers[0];
    const legacyProfile: OrgAiProfile = {
      id: randomUUID(),
      name: `${providerEntry.name} (legacy)`,
      providerId: providerEntry.id,
      apiKey,
      baseURL,
      model
    };
    profiles.push(legacyProfile);
    activeProfileByRole.teacher = legacyProfile.id;
    activeProfileByRole.student = legacyProfile.id;
  }

  const { aiProvider: _legacy, ...restSettings } = settings;
  await writeOrgSettings(
    orgId,
    {
      ...restSettings,
      aiProviders: providers,
      aiProfiles: profiles,
      activeAiProfileByRole: activeProfileByRole
    },
    dbClient
  );
}

/** Returns the full provider/profile management state, seeding defaults on first read. */
export async function getOrgAiProviderManagement(
  orgId: string,
  dbClient: DbOrTxClient = db
): Promise<OrgAiProviderManagement | null> {
  try {
    const settings = await readOrgSettings(orgId, dbClient);
    if (!settings) return null;

    if (!settings.aiProviders || !settings.aiProfiles) {
      await ensureDefaultAiProviderData(orgId, dbClient);
      const refreshed = await readOrgSettings(orgId, dbClient);
      if (!refreshed) return null;
      return collectionFromSettings(refreshed);
    }

    return collectionFromSettings(settings);
  } catch (error) {
    console.error('getOrgAiProviderManagement error:', error);
    throw new Error('Failed to fetch AI provider management data');
  }
}

async function withSettingsMutation<T>(
  orgId: string,
  mutate: (settings: OrgSettings) => { settings: OrgSettings; result: T } | null,
  dbClient: DbOrTxClient = db
): Promise<T | null> {
  return dbClient.transaction(async (tx) => {
    const settings = await readOrgSettings(orgId, tx);
    if (!settings) return null;

    const outcome = mutate(settings);
    if (!outcome) return null;

    const updated = await writeOrgSettings(orgId, outcome.settings, tx);
    return updated ? outcome.result : null;
  });
}

// ─── Providers ────────────────────────────────────────────────────────────────

export async function createOrgAiProvider(
  orgId: string,
  data: { name: string; providerType: OrgAiProvider['providerType']; defaultBaseUrl?: string },
  dbClient: DbOrTxClient = db
): Promise<OrgAiProvider | null> {
  try {
    return await withSettingsMutation<OrgAiProvider>(
      orgId,
      (settings) => {
        const provider: OrgAiProvider = {
          id: randomUUID(),
          name: data.name,
          providerType: data.providerType,
          defaultBaseUrl: data.defaultBaseUrl || undefined
        };
        return {
          settings: { ...settings, aiProviders: [...(settings.aiProviders ?? []), provider] },
          result: provider
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('createOrgAiProvider error:', error);
    throw new Error('Failed to create AI provider');
  }
}

export async function updateOrgAiProvider(
  orgId: string,
  providerId: string,
  patch: Partial<Pick<OrgAiProvider, 'name' | 'providerType' | 'defaultBaseUrl'>>,
  dbClient: DbOrTxClient = db
): Promise<OrgAiProvider | null> {
  try {
    return await withSettingsMutation<OrgAiProvider>(
      orgId,
      (settings) => {
        const providers = (settings.aiProviders ?? []).map((p) =>
          p.id === providerId
            ? {
                ...p,
                ...patch,
                defaultBaseUrl:
                  patch.defaultBaseUrl !== undefined ? patch.defaultBaseUrl || undefined : p.defaultBaseUrl
              }
            : p
        );

        const updated = providers.find((p) => p.id === providerId);
        if (!updated) return null;

        return {
          settings: { ...settings, aiProviders: providers },
          result: updated
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('updateOrgAiProvider error:', error);
    throw new Error('Failed to update AI provider');
  }
}

export async function deleteOrgAiProvider(
  orgId: string,
  providerId: string,
  dbClient: DbOrTxClient = db
): Promise<{ deleted: boolean; referencedByProfiles: number } | null> {
  try {
    return await withSettingsMutation<{ deleted: boolean; referencedByProfiles: number }>(
      orgId,
      (settings) => {
        const referencing = (settings.aiProfiles ?? []).filter((p) => p.providerId === providerId).length;
        if (referencing > 0) {
          return { settings, result: { deleted: false, referencedByProfiles: referencing } };
        }

        return {
          settings: {
            ...settings,
            aiProviders: (settings.aiProviders ?? []).filter((p) => p.id !== providerId)
          },
          result: { deleted: true, referencedByProfiles: 0 }
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('deleteOrgAiProvider error:', error);
    throw new Error('Failed to delete AI provider');
  }
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function createOrgAiProfile(
  orgId: string,
  data: { name: string; providerId: string; apiKey?: string; baseURL?: string; model?: string },
  dbClient: DbOrTxClient = db
): Promise<OrgAiProfile | null> {
  try {
    return await withSettingsMutation<OrgAiProfile>(
      orgId,
      (settings) => {
        const providerExists = (settings.aiProviders ?? []).some((p) => p.id === data.providerId);
        if (!providerExists) return null;

        const profile: OrgAiProfile = {
          id: randomUUID(),
          name: data.name,
          providerId: data.providerId,
          apiKey: data.apiKey || undefined,
          baseURL: data.baseURL || undefined,
          model: data.model || undefined
        };
        return {
          settings: { ...settings, aiProfiles: [...(settings.aiProfiles ?? []), profile] },
          result: profile
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('createOrgAiProfile error:', error);
    throw new Error('Failed to create AI profile');
  }
}

export async function updateOrgAiProfile(
  orgId: string,
  profileId: string,
  patch: Partial<Pick<OrgAiProfile, 'name' | 'providerId' | 'apiKey' | 'baseURL' | 'model'>>,
  dbClient: DbOrTxClient = db
): Promise<OrgAiProfile | null> {
  try {
    return await withSettingsMutation<OrgAiProfile>(
      orgId,
      (settings) => {
        const profiles = settings.aiProfiles ?? [];

        // Reject provider changes to an unknown provider id.
        if (patch.providerId && !(settings.aiProviders ?? []).some((p) => p.id === patch.providerId)) {
          return null;
        }

        const target = profiles.find((p) => p.id === profileId);
        if (!target) return null;

        // Empty strings clear the field; undefined keeps the current value.
        const pickCleared = <K extends keyof Pick<OrgAiProfile, 'apiKey' | 'baseURL' | 'model'>>(
          key: K
        ): OrgAiProfile[K] | undefined => (patch[key] !== undefined ? patch[key] || undefined : target[key]);

        const updated: OrgAiProfile = {
          ...target,
          ...patch,
          apiKey: pickCleared('apiKey'),
          baseURL: pickCleared('baseURL'),
          model: pickCleared('model')
        };

        return {
          settings: { ...settings, aiProfiles: profiles.map((p) => (p.id === profileId ? updated : p)) },
          result: updated
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('updateOrgAiProfile error:', error);
    throw new Error('Failed to update AI profile');
  }
}

export async function deleteOrgAiProfile(
  orgId: string,
  profileId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean | null> {
  try {
    return await withSettingsMutation<boolean>(
      orgId,
      (settings) => {
        const profiles = settings.aiProfiles ?? [];
        if (!profiles.some((p) => p.id === profileId)) return null;

        const activeProfileByRole: Partial<Record<AiProfileRole, string>> = settings.activeAiProfileByRole ?? {};
        const nextActive = { ...activeProfileByRole };
        for (const role of Object.keys(nextActive) as AiProfileRole[]) {
          if (nextActive[role] === profileId) delete nextActive[role];
        }

        return {
          settings: {
            ...settings,
            aiProfiles: profiles.filter((p) => p.id !== profileId),
            activeAiProfileByRole: nextActive
          },
          result: true
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('deleteOrgAiProfile error:', error);
    throw new Error('Failed to delete AI profile');
  }
}

export async function activateOrgAiProfile(
  orgId: string,
  role: AiProfileRole,
  profileId: string,
  dbClient: DbOrTxClient = db
): Promise<Partial<Record<AiProfileRole, string>> | null> {
  try {
    return await withSettingsMutation<Partial<Record<AiProfileRole, string>>>(
      orgId,
      (settings) => {
        if (!(settings.aiProfiles ?? []).some((p) => p.id === profileId)) return null;

        const nextActive = { ...(settings.activeAiProfileByRole ?? {}), [role]: profileId };
        return {
          settings: { ...settings, activeAiProfileByRole: nextActive },
          result: nextActive
        };
      },
      dbClient
    );
  } catch (error) {
    console.error('activateOrgAiProfile error:', error);
    throw new Error('Failed to activate AI profile');
  }
}
