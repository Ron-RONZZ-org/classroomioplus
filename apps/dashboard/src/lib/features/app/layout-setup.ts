import { getFirstOrg } from '$features/org/api/org.server';

import type { AccountOrg } from '$features/app/types';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getApiKeyHeaders } from '$lib/utils/services/api/server';

export interface OrgSiteInfo {
  isOrgSite: boolean;
  org: AccountOrg | null;
  subdomain: string;
  orgSiteName: string;
}

/**
 * Self-hosted single-org resolution.
 *
 * Safe assumptions (single-org self-hosting):
 *   - The DB contains exactly one organization — `getFirstOrg()` is that org.
 *   - The dashboard's own origin (ORIGIN, or PRIVATE_APP_HOST + subdomains)
 *     is the app host where the operator logs in to manage their org. It is
 *     NOT an org site: there the current org is resolved from the `/org/{slug}`
 *     URL path so the operator sees their real role (admin/tutor/student).
 *   - Any other host (tenant subdomain, custom domain) is an org site and
 *     always serves that single organization.
 */
export async function getOrgSiteInfo(url: URL, _cookies: Cookies): Promise<OrgSiteInfo> {
  if (isAppHost(url)) {
    return {
      orgSiteName: '',
      subdomain: '',
      isOrgSite: false,
      org: null
    };
  }

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

/**
 * True when `url` is the dashboard's app host (operator login / management),
 * not an organization site.
 */
function isAppHost(url: URL): boolean {
  if (url.host.includes('localhost')) {
    return true;
  }

  const host = url.hostname.replace('www.', '');

  // The dashboard's own canonical origin (e.g. https://learn.ronzz.org).
  const origin = env.ORIGIN ? new URL(env.ORIGIN).hostname : '';
  if (origin && host === origin) {
    return true;
  }

  // Upstream convention: PRIVATE_APP_HOST + PRIVATE_APP_SUBDOMAINS define the
  // app host (e.g. ronzz.org + "app" → app.ronzz.org). Any other subdomain of
  // the base domain is an org site.
  const appHost = env.PRIVATE_APP_HOST;
  if (!appHost) {
    return false;
  }

  const hostParts = host.split('.');
  const appHostParts = appHost.split('.');
  if (hostParts.slice(-appHostParts.length).join('.') !== appHost) {
    return false;
  }

  const subdomain = hostParts.length > appHostParts.length ? hostParts[0] : '';
  const appSubdomains = (env.PRIVATE_APP_SUBDOMAINS || 'app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return subdomain === '' || appSubdomains.includes(subdomain);
}
