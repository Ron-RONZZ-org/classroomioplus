import { createHash } from 'crypto';

import { AppError, ErrorCodes } from '@api/utils/errors';
import { getCloudflarePngBuffer } from '@api/utils/cloudflare';
import { resolveThemeColor } from '@cio/email';
import { getOrganizationBySiteName } from '@cio/db/queries/organization';
import { extractOrgTagline, renderOrgSiteOg } from '@api/utils/org-site-og';
import { getCachedOrgSiteOgBuffer, getOrgSiteOgPublicUrl, persistOrgSiteOgImage } from '@api/services/org/og-cache';

const DEFAULT_OG_IMAGE = 'https://brand.cdn.clsrio.com/og/classroomio-opengraph.jpg';
const OG_VIEWPORT = { width: 1200, height: 630, deviceScaleFactor: 2 } as const;

export function normalizeOrgOgSiteName(rawSiteName: string): string {
  return rawSiteName.endsWith('.png') ? rawSiteName.slice(0, -4) : rawSiteName;
}

export function getOrgSiteOgFallbackImageUrl(): string {
  return DEFAULT_OG_IMAGE;
}

export { getOrgSiteOgPublicUrl };

function buildOrgSiteOgEtag(payload: {
  siteName: string;
  orgName: string;
  logoUrl?: string;
  tagline?: string;
  themeColor: string;
  showWatermark: boolean;
}): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export async function generateOrgSiteOgImage(siteName: string): Promise<{ buffer: Buffer; etag: string }> {
  const organization = await getOrganizationBySiteName(siteName);
  if (!organization) {
    throw new AppError('Organization not found', ErrorCodes.ORGANIZATION_NOT_FOUND, 404);
  }

  const tagline = extractOrgTagline(organization.landingpage);
  const themeColor = resolveThemeColor(organization.theme) ?? '#1d4ed8';
  const renderInput = {
    orgName: organization.name,
    logoUrl: organization.avatarUrl?.trim() || undefined,
    tagline,
    themeColor,
    showWatermark: false
  };

  const etag = buildOrgSiteOgEtag({
    siteName,
    ...renderInput
  });

  const cachedBuffer = await getCachedOrgSiteOgBuffer(siteName, etag);
  if (cachedBuffer) {
    return { buffer: cachedBuffer, etag };
  }

  const { html, styles } = renderOrgSiteOg(renderInput);
  const buffer = await getCloudflarePngBuffer(html, styles, OG_VIEWPORT);

  await persistOrgSiteOgImage(siteName, buffer, etag);

  return { buffer, etag };
}
