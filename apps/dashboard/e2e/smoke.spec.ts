/**
 * Smoke tests — verify that core pages render with expected content.
 *
 * Tests log in through the actual form (not API) so GUI login bugs
 * are caught.  Each login uses a fresh browser context (Playwright
 * default) to avoid stale session state.
 *
 * NOTE: Vite dev compiles Svelte modules lazily, making the first
 * page navigation to a new route slow (10-30s).  These tests are
 * designed to run against a dev server.  For CI, use `vite build`
 * + `vite preview` or set E2E_BASE_URL to a production deployment.
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  API_URL,
  ADMIN_EMAIL,
  PASSWORD,
  ORG_SLUG,
  login,
  setupErrorTracking,
  expectCollectorEmpty,
  navigateAndSettle,
  benchNavigate,
  type ErrorCollector
} from './helpers';

test.describe('Login', () => {
  let err: ErrorCollector;

  test.beforeEach(({ page }) => {
    err = setupErrorTracking(page);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-01: Login form renders and accepts credentials', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(BASE_URL + '/login', { waitUntil: 'load', timeout: 30000 });
    await page.waitForResponse((r) => r.url().includes('/api/auth/get-session') && r.status() === 200, {
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Verify form fields
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Fill and submit valid credentials
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(PASSWORD);

    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }),
      page.locator('button[type="submit"]').click()
    ]);

    // Successful login → redirect to /
    expect(page.url()).toBe(BASE_URL + '/');
    await expect(page.getByText('Udemy Test').first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-02: Invalid credentials show error', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(BASE_URL + '/login', { waitUntil: 'load', timeout: 30000 });
    await page.waitForResponse((r) => r.url().includes('/api/auth/get-session') && r.status() === 200, {
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    await page.locator('#email').fill('bad@user.com');
    await page.locator('#password').fill('wrong-password');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);

    // Should stay on login page
    expect(page.url()).toContain('/login');
  });
});

test.describe('Authenticated pages', () => {
  let err: ErrorCollector;

  test.beforeEach(async ({ page }) => {
    err = setupErrorTracking(page);
    await login(page, ADMIN_EMAIL, PASSWORD);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-03: Dashboard and course list', async ({ page }) => {
    test.setTimeout(180_000);

    // Dashboard
    await benchNavigate(page, BASE_URL + `/org/${ORG_SLUG}/dash`, 'Dashboard');
    await expect(page.getByRole('button', { name: /Create Course/i })).toBeVisible({ timeout: 20000 });

    // Course list (navigate within same session)
    await benchNavigate(page, BASE_URL + `/org/${ORG_SLUG}/courses`, 'Course list');
    await expect(page.getByText('Modern Web Development')).toBeVisible({ timeout: 20000 });
  });

  test('TC-04: Fork-specific settings pages', async ({ page }) => {
    test.setTimeout(180_000);

    // AI provider
    await benchNavigate(page, BASE_URL + `/org/${ORG_SLUG}/settings/ai-provider`, 'AI Provider settings');
    let title = await page.title();
    expect(title).toContain('AI Provider');

    // SSO settings
    await benchNavigate(page, BASE_URL + `/org/${ORG_SLUG}/settings/auth`, 'SSO settings');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-05: Logout', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto(BASE_URL + '/logout', { waitUntil: 'load', timeout: 30000 });
    await page.waitForURL('**/login**', { timeout: 20000 });
    expect(page.url()).toContain('/login');
  });
});

test.describe('API health', () => {
  test('TC-06: API root responds', async ({ page }) => {
    test.setTimeout(30_000);

    const response = await page.request.get(API_URL + '/');
    expect(response.status()).toBe(200);
    console.log(`  API root: ${response.status()} (${response.statusText()})`);
  });
});

test.describe('Public pages (no auth)', () => {
  let err: ErrorCollector;

  test.beforeEach(({ page }) => {
    err = setupErrorTracking(page);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-07: Public org landing page and course catalog', async ({ page }) => {
    test.setTimeout(180_000);

    await benchNavigate(page, BASE_URL + `/org/${ORG_SLUG}`, 'Public org landing');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await benchNavigate(page, BASE_URL + `/org/${ORG_SLUG}/courses`, 'Public course catalog');
    await expect(page.getByText('Modern Web Development')).toBeVisible({ timeout: 20000 });
  });
});
