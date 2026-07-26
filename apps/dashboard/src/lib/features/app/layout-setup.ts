import { getFirstOrg } from '$features/org/api/org.server';

import type { AccountOrg } from '$features/app/types';
import type { Cookies } from '@sveltejs/kit';
import { getApiKeyHeaders } from '$lib/utils/services/api/server';

export interface OrgSiteInfo {
  isOrgSite: boolean;
  org: AccountOrg | null;
  subdomain: string;
  orgSiteName: string;
}

export async function getOrgSiteInfo(_url: URL, _cookies: Cookies): Promise<OrgSiteInfo> {
  const apiKeyHeaders = getApiKeyHeaders();
  const firstOrg = await getFirstOrg(apiKeyHeaders);

  if (firstOrg) {
    return {
      org: firstOrg as AccountOrg,
      isOrgSite: true,
      orgSiteName: firstOrg.siteName || '',
      subdomain: ''
    };
  }

  return {
    orgSiteName: '',
    subdomain: '',
    isOrgSite: false,
    org: null
  };
}

function isURLCustomDomain(url: URL) {
  if (url.host.includes('localhost')) {
    return false;
  }

  const notCustomDomainHosts = [env.PRIVATE_APP_HOST || '', 'classroomio.com', 'myclassroomio.com'].filter(Boolean);

  return !notCustomDomainHosts.some((host) => url.host.endsWith(host));
}

export function getSubdomain(url: URL) {
  const appHost = env.PRIVATE_APP_HOST;
  if (!appHost) return null;

  const host = url.hostname.replace('www.', '');
  const parts = host.split('.');
  const appHostParts = appHost.split('.');
  const isAppHost = parts.slice(-appHostParts.length).join('.') === appHost;

  if (isAppHost) {
    // Subdomain exists only if extra part(s) before main domain
    return parts.length > appHostParts.length ? parts[0] : null;
  }

  return null;
}
