/**
 * Auth flow E2E tests.
 *
 * Covers signup page render, signup form submission (POST), and
 * forgot/reset password pages.  Signup uses a timestamped unique email
 * to avoid collisions with seed data or prior test runs.
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  login,
  setupErrorTracking,
  expectCollectorEmpty,
  navigateAndSettle,
  type ErrorCollector
} from './helpers';

test.describe('Auth pages', () => {
  let err: ErrorCollector;

  test.beforeEach(({ page }) => {
    err = setupErrorTracking(page);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-AUTH-01: Signup page renders', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + '/signup');

    // Verify form fields are present
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#password')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#confirmPassword')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible({ timeout: 10000 });
  });

  test('TC-AUTH-02: Signup form submits and creates account', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + '/signup');

    // Fill form with unique credentials
    const uniqueEmail = `e2e-test-${Date.now()}@test.com`;
    const testPassword = 'TestPass123!';

    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill(testPassword);
    await page.locator('#confirmPassword').fill(testPassword);

    // Submit and wait for redirect away from /signup
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes('/signup'), { timeout: 30000 }).catch(() => {}),
      page.locator('button[type="submit"]').click()
    ]);

    // After successful signup, should redirect away from /signup
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/signup');
  });

  test('TC-AUTH-03: Forgot and reset password pages render', async ({ page }) => {
    test.setTimeout(120_000);

    // Forgot password page
    await navigateAndSettle(page, BASE_URL + '/forgot');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    // Reset password page
    await navigateAndSettle(page, BASE_URL + '/reset');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });
});
