import { Hono } from '@api/utils/hono';
import { authMiddleware } from '@api/middlewares/auth';
import { orgMemberMiddleware } from '@api/middlewares/org-member';
import { orgAdminMiddleware } from '@api/middlewares/org-admin';
import { handleError } from '@api/utils/errors';
import { zValidator } from '@hono/zod-validator';
import {
  ZActivateAiProfile,
  ZAiProfile,
  ZAiProfilePatch,
  ZAiProvider,
  ZAiProviderPatch
} from '@cio/utils/validation/organization';

import {
  activateAiProfileService,
  createAiProfileService,
  createAiProviderService,
  deleteAiProfileService,
  deleteAiProviderService,
  getOrgAiProviderManagementService,
  updateAiProfileService,
  updateAiProviderService
} from '@api/services/organization/ai-provider';

/**
 * Org-level AI provider & profile management.
 *
 * GET /organization/ai-provider                 — any org member can read the catalog.
 * POST/PUT/DELETE /providers[/:providerId]      — org admin only.
 * POST/PUT/DELETE /profiles[/:profileId]        — org admin only.
 * PUT /profiles/:profileId/activate             — org admin only; body: { role }.
 *
 * All mutations return the full management collection so clients stay consistent
 * without local reconciliation.
 */
export const organizationAiProviderRouter = new Hono()
  .get('/', authMiddleware, orgMemberMiddleware, async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const data = await getOrgAiProviderManagementService(orgId);

      return c.json({ success: true as const, data });
    } catch (error) {
      return handleError(c, error, 'Failed to fetch AI provider settings');
    }
  })
  .post('/providers', authMiddleware, orgAdminMiddleware, zValidator('json', ZAiProvider), async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const body = c.req.valid('json');
      await createAiProviderService(orgId, body);
      const data = await getOrgAiProviderManagementService(orgId);

      return c.json({ success: true as const, data });
    } catch (error) {
      return handleError(c, error, 'Failed to create AI provider');
    }
  })
  .put(
    '/providers/:providerId',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('json', ZAiProviderPatch),
    async (c) => {
      try {
        const orgId = c.req.header('cio-org-id')!;
        const providerId = c.req.param('providerId');
        const body = c.req.valid('json');
        await updateAiProviderService(orgId, providerId, body);
        const data = await getOrgAiProviderManagementService(orgId);

        return c.json({ success: true as const, data });
      } catch (error) {
        return handleError(c, error, 'Failed to update AI provider');
      }
    }
  )
  .delete('/providers/:providerId', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const providerId = c.req.param('providerId');
      await deleteAiProviderService(orgId, providerId);
      const data = await getOrgAiProviderManagementService(orgId);

      return c.json({ success: true as const, data });
    } catch (error) {
      return handleError(c, error, 'Failed to delete AI provider');
    }
  })
  .post('/profiles', authMiddleware, orgAdminMiddleware, zValidator('json', ZAiProfile), async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const body = c.req.valid('json');
      await createAiProfileService(orgId, body);
      const data = await getOrgAiProviderManagementService(orgId);

      return c.json({ success: true as const, data });
    } catch (error) {
      return handleError(c, error, 'Failed to create AI profile');
    }
  })
  .put('/profiles/:profileId', authMiddleware, orgAdminMiddleware, zValidator('json', ZAiProfilePatch), async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const profileId = c.req.param('profileId');
      const body = c.req.valid('json');
      await updateAiProfileService(orgId, profileId, body);
      const data = await getOrgAiProviderManagementService(orgId);

      return c.json({ success: true as const, data });
    } catch (error) {
      return handleError(c, error, 'Failed to update AI profile');
    }
  })
  .delete('/profiles/:profileId', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      const orgId = c.req.header('cio-org-id')!;
      const profileId = c.req.param('profileId');
      await deleteAiProfileService(orgId, profileId);
      const data = await getOrgAiProviderManagementService(orgId);

      return c.json({ success: true as const, data });
    } catch (error) {
      return handleError(c, error, 'Failed to delete AI profile');
    }
  })
  .put(
    '/profiles/:profileId/activate',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('json', ZActivateAiProfile),
    async (c) => {
      try {
        const orgId = c.req.header('cio-org-id')!;
        const profileId = c.req.param('profileId');
        const { role } = c.req.valid('json');
        await activateAiProfileService(orgId, role, profileId);
        const data = await getOrgAiProviderManagementService(orgId);

        return c.json({ success: true as const, data });
      } catch (error) {
        return handleError(c, error, 'Failed to activate AI profile');
      }
    }
  );
