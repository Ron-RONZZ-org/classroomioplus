import { ensureDefaultAiProviderData } from '@db/queries/agent';

/**
 * Seeds the default AI provider catalog + one profile per provider for the demo orgs.
 */
export async function seedAiProviders({ orgIds }: { orgIds: string[] }) {
  for (const orgId of orgIds) {
    await ensureDefaultAiProviderData(orgId);
  }
  console.log(`   ✓ Seeded default AI providers/profiles for ${orgIds.length} organization(s)`);
}
