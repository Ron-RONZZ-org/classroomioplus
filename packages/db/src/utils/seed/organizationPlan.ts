import { and, db, eq, organizationPlan } from '@db/drizzle';

/**
 * Seed the self-hosted ENTERPRISE plan for the single org.
 * Mirrors what the onboarding service assigns when an org is created in
 * self-hosted mode (see apps/api/src/services/onboarding.ts).
 */
export async function seedOrganizationPlan({ orgId }: { orgId: string }) {
  const existing = await db
    .select()
    .from(organizationPlan)
    .where(
      and(
        eq(organizationPlan.orgId, orgId),
        eq(organizationPlan.planName, 'ENTERPRISE'),
        eq(organizationPlan.isActive, true)
      )
    );

  if (existing.length > 0) {
    console.log('   ✓ Enterprise organization plan already exists, skipping');
    return;
  }

  await db.insert(organizationPlan).values({
    orgId,
    planName: 'ENTERPRISE',
    isActive: true,
    subscriptionId: `selfhosted-${orgId}`,
    provider: 'selfhosted'
  });
  console.log('   ✓ Inserted enterprise organization plan');
}
