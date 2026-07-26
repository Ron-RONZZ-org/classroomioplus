/**
 * The apex that hosts every tenant site as `<orgSiteName>.<TENANT_ROOT_DOMAIN>`.
 * The Cloudflare Worker terminates traffic for this zone and forwards
 * to the dashboard service. Marketing apex is intentionally separate.
 */
export const TENANT_ROOT_DOMAIN = 'libreclassroom.ronzz.org';

/** The marketing / admin / api zone. Fork defaults to project homepage. */
export const BRAND_ROOT_DOMAIN = 'libreclassroom.ronzz.org';

export { EMBED_PUBLIC_BASE_URL, EMBED_PUBLIC_HOST } from './embeds';
