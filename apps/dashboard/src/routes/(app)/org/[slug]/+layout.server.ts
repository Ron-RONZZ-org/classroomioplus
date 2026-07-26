import { env } from '$env/dynamic/private';
import { getApiKeyHeaders } from '$lib/utils/services/api/server';
import { getOrgBySiteName } from '$features/org/api/org.server';

const ORG_ID_COOKIE_PREFIX = 'cio_org_id_';

export const load = async ({ params, url, cookies }) => {
  const loadStart = performance.now();

  const siteName = params.slug;
  const cookieKey = `${ORG_ID_COOKIE_PREFIX}${siteName}`;
  const cachedOrgId = cookies.get(cookieKey);

  let orgId: string | undefined = cachedOrgId;
  let orgLookupMs = 0;

  if (!orgId) {
    const orgLookupStart = performance.now();
    const apiKeyHeaders = getApiKeyHeaders();
    const org = await getOrgBySiteName(siteName, apiKeyHeaders);
    orgLookupMs = Math.round((performance.now() - orgLookupStart) * 100) / 100;

    if (org?.id) {
      orgId = org.id;

      cookies.set(cookieKey, org.id, {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: 'lax',
        httpOnly: false // Allow client-side access if needed
      });
    }
  }

  const loadMs = Math.round((performance.now() - loadStart) * 100) / 100;
  console.log(
    `[org/+layout.server] load: ${loadMs}ms | siteName=${siteName} orgIdCache=${cachedOrgId ? 'hit' : 'miss'} getOrgBySiteName: ${orgLookupMs}ms`
  );

  return {
    orgName: siteName,
    orgId
  };
};
