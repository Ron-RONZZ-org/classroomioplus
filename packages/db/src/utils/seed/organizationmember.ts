import { db, organizationmember } from '@db/drizzle';

interface SeedOrganizationMember {
  testOrgId: string;
  adminUserId: string;
  studentUserId: string;
}

export async function seedOrganizationMember({ testOrgId, adminUserId, studentUserId }: SeedOrganizationMember) {
  const existingOrgMembers = await db.select().from(organizationmember);
  const existingOrgMemberKeys = existingOrgMembers.map((om) => `${om.organizationId}-${om.profileId}`);

  const orgMembersToInsert = [
    {
      organizationId: testOrgId,
      roleId: 1, // ADMIN
      profileId: adminUserId,
      verified: false
    },
    {
      organizationId: testOrgId,
      roleId: 3, // STUDENT
      profileId: studentUserId,
      verified: false
    }
  ].filter((om) => !existingOrgMemberKeys.includes(`${om.organizationId}-${om.profileId}`));

  if (orgMembersToInsert.length > 0) {
    await db.insert(organizationmember).values(orgMembersToInsert);
    console.log(`   ✓ Inserted ${orgMembersToInsert.length} organization member(s)`);
  } else {
    console.log('   ✓ Organization members already exist, skipping');
  }
}
