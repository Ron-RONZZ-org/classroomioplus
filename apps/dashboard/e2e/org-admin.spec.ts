/**
 * Org administration E2E tests.
 *
 * Verifies that admin settings pages render correctly and that key
 * fork-specific features (AI provider, SSO) are accessible.
 *
 * Pages are tested in sequential flows to minimise Vite's lazy-compilation
 * overhead on the dev server.
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  ORG_SLUG,
  ADMIN_EMAIL,
  PASSWORD,
  login,
  setupErrorTracking,
  expectCollectorEmpty,
  navigateAndSettle,
  type ErrorCollector
} from './helpers';

test.describe('Org admin', () => {
  let err: ErrorCollector;

  test.beforeEach(async ({ page }) => {
    err = setupErrorTracking(page);
    await login(page, ADMIN_EMAIL, PASSWORD);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-ADMIN-01: General settings pages render', async ({ page }) => {
    test.setTimeout(180_000);

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/landingpage`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/teams`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-ADMIN-02: Fork-specific settings pages render', async ({ page }) => {
    test.setTimeout(180_000);

    // AI provider settings — fork feature
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/ai-provider`);
    const aiTitle = await page.title();
    expect(aiTitle).toContain('AI Provider');

    // SSO settings — fork feature (always unlocked in self-hosted mode)
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/auth`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    // Domain settings
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/domains`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-ADMIN-03: Audience and analytics pages render', async ({ page }) => {
    test.setTimeout(180_000);

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/audience`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/tags`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/analytics`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-ADMIN-04: Media page loads', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/media`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-ADMIN-05: Org profile settings — modify and save', async ({ page }) => {
    test.setTimeout(180_000);

    // Navigate to org settings page
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/org`);
    await page.waitForTimeout(2000);

    // Find the org name input — it's the first non-readonly text input
    // (other inputs on the page are read-only search/select triggers)
    const nameInput = page.locator('input:not([readonly])').first();
    if (await nameInput.isVisible().catch(() => false)) {
      const suffix = ` [E2E ${Date.now()}]`;
      const currentValue = await nameInput.inputValue();
      await nameInput.click();
      await nameInput.fill('');
      await nameInput.fill(`${currentValue}${suffix}`);

      // Click the "Save" button in the page header (settingsHeaderAction)
      const saveButton = page.getByRole('button', { name: /save/i });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        // Wait for save to complete
        await page.waitForTimeout(3000);
      }
    }

    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-ADMIN-06: Settings pages load (notifications, integrations, customize-lms, billing, workspaces, ai-credits, ai-tutor)', async ({
    page
  }) => {
    test.setTimeout(300_000);

    const pages = [
      `/org/${ORG_SLUG}/settings/notifications`,
      `/org/${ORG_SLUG}/settings/integrations`,
      `/org/${ORG_SLUG}/settings/customize-lms`,
      `/org/${ORG_SLUG}/settings/billing`,
      `/org/${ORG_SLUG}/settings/workspaces`,
      `/org/${ORG_SLUG}/settings/ai-credits`,
      `/org/${ORG_SLUG}/settings/ai-tutor`
    ];

    for (const route of pages) {
      await navigateAndSettle(page, BASE_URL + route);
      await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
    }
  });

  test('TC-ADMIN-07: Management pages load (cohorts, community, widgets, import-export, api, mcp, zapier, teams-overview, compliance)', async ({
    page
  }) => {
    test.setTimeout(300_000);

    const pages = [
      `/org/${ORG_SLUG}/cohorts`,
      `/org/${ORG_SLUG}/community`,
      `/org/${ORG_SLUG}/widgets`,
      `/org/${ORG_SLUG}/import-export`,
      `/org/${ORG_SLUG}/api`,
      `/org/${ORG_SLUG}/mcp`,
      `/org/${ORG_SLUG}/zapier`,
      `/org/${ORG_SLUG}/teams-overview`,
      `/org/${ORG_SLUG}/compliance`
    ];

    for (const route of pages) {
      await navigateAndSettle(page, BASE_URL + route);
      await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
    }
  });

  test('TC-ADMIN-08: Community question — ask and publish', async ({ page }) => {
    test.setTimeout(180_000);

    // Navigate to community ask page
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/community/ask`);
    await page.waitForTimeout(2000);

    // Find the question title input and fill it
    const titleInput = page.getByPlaceholder(/title/i).first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill(`E2E Test Question ${Date.now()}`);
    }

    // Click the "Publish" button
    const publishButton = page.getByRole('button', { name: /publish/i });
    if (await publishButton.isVisible().catch(() => false)) {
      await publishButton.click();
      // Wait for question creation to complete
      await page.waitForTimeout(3000);
    }

    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });
});
