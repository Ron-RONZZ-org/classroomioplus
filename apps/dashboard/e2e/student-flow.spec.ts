/**
 * Student LMS E2E tests.
 *
 * The entire student experience (7+ routes) previously had zero
 * coverage.  These tests verify:
 *   - Student login redirects to LMS
 *   - The course catalog renders with expected content
 *   - Student learning pages load
 *
 * After login, the SvelteKit app initializes asynchronously: it fetches
 * session data, loads org roles, and sets up stores.  The redirect to
 * /lms only happens after `appInitApi.isInitializedAndReady` becomes
 * true AND `$isOrgStudent` is true.  Tests must wait for this.
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  ORG_SLUG,
  STUDENT_EMAIL,
  PASSWORD,
  login,
  setupErrorTracking,
  expectCollectorEmpty,
  navigateAndSettle,
  type ErrorCollector
} from './helpers';

test.describe('Student LMS', () => {
  let err: ErrorCollector;

  test.beforeEach(async ({ page }) => {
    err = setupErrorTracking(page);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-STU-01: Student login redirects to LMS', async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, STUDENT_EMAIL, PASSWORD);

    // Wait for the app to finish initializing — this is what triggers the
    // student redirect to /lms (layout's $effect checks
    // appInitApi.isInitializedAndReady && $isOrgStudent).
    // The init calls /api/auth/get-session, then loads org roles.
    await page.waitForTimeout(3000);

    // Check for redirect now; if it hasn't happened, wait a bit more
    if (!page.url().includes('/lms')) {
      await page.waitForURL((url) => url.pathname.includes('/lms'), { timeout: 20000 });
    }
    expect(page.url()).toContain('/lms');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-STU-02: Student course catalog shows seeded courses', async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, STUDENT_EMAIL, PASSWORD);
    await page.waitForTimeout(3000);

    // Course catalog — the seeded udemy-test org has "Data Science with
    // Python and Pandas" which should be visible to enrolled students
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/courses`);
    // The course appears in multiple elements (heading, card title, description)
    await expect(page.getByText('Data Science with Python').first()).toBeVisible({ timeout: 20000 });
  });

  test('TC-STU-03: Student LMS pages load', async ({ page }) => {
    test.setTimeout(180_000);

    await login(page, STUDENT_EMAIL, PASSWORD);
    await page.waitForTimeout(3000);

    // LMS explore
    await navigateAndSettle(page, BASE_URL + '/lms/explore');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    // My learning
    await navigateAndSettle(page, BASE_URL + '/lms/mylearning');
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });
});
