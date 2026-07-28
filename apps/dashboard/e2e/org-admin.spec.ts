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
});
