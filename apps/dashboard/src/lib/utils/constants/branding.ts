import { env as publicEnv } from '$env/static/public';

/**
 * Branding configuration for self-hosted instances.
 *
 * All values are env-configurable via PUBLIC_* vars so self-hosters can brand
 * their instance without editing source code. Empty defaults for support/docs
 * mean those features fail closed (no visible link) rather than pointing at
 * the fork maintainer's infrastructure.
 */

/** Product name used in fallback UI strings and page titles. */
export const APP_NAME = publicEnv.PUBLIC_APP_NAME || 'LibreClassroom';

/** Fork domain for branding links (powered-by, logo href, etc.). */
export const BRAND_ROOT_DOMAIN = publicEnv.PUBLIC_BRAND_ROOT_DOMAIN || 'libreclassroom.ronzz.org';

/** Tenant subdomain apex (unused on self-hosted, kept for cloud compat). */
export const TENANT_ROOT_DOMAIN = publicEnv.PUBLIC_TENANT_ROOT_DOMAIN || 'libreclassroom.ronzz.org';

/**
 * Support email — EMPTY by default so self-hosters MUST configure their own.
 * When empty, support links are hidden from the UI.
 */
export const SUPPORT_EMAIL = publicEnv.PUBLIC_SUPPORT_EMAIL || '';

/**
 * Docs URL — EMPTY by default so self-hosters MUST configure their own.
 * When empty, docs links are hidden from the UI.
 */
export const DOCS_URL = publicEnv.PUBLIC_DOCS_URL || '';
