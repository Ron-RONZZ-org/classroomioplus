import { Hono } from '@api/utils/hono';
import { authMiddleware } from '@api/middlewares/auth';
import { orgMemberMiddleware } from '@api/middlewares/org-member';
import { orgAdminMiddleware } from '@api/middlewares/org-admin';
import { handleError } from '@api/utils/errors';
import { zValidator } from '@hono/zod-validator';
import { ZAiProviderSettings } from '@cio/utils/validation/organization';

import { getResolvedOrgAiProvider, updateOrgAiProviderService } from '@api/services/organization/ai-provider';

/**
 * Org-level AI provider configuration.
 *
 * GET /organization/ai-provider  — any org member can read the resolved config.
 * PUT /organization/ai-provider  — org admin only; sets the provider override.
 */
export const organizationAiProviderRouter = new Hono()
  .get('/', authMiddleware, orgMemberMiddleware, async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const settings = await getResolvedOrgAiProvider(orgId);

      return c.json({ success: true as const, data: settings });
    } catch (error) {
      return handleError(c, error, 'Failed to fetch AI provider settings');
    }
  })
  .put('/', authMiddleware, orgAdminMiddleware, zValidator('json', ZAiProviderSettings), async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const patch = c.req.valid('json') ?? {};
      const updated = await updateOrgAiProviderService(orgId, patch);

      return c.json({ success: true as const, data: updated });
    } catch (error) {
      return handleError(c, error, 'Failed to update AI provider settings');
    }
  });
