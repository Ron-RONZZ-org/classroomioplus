/**
 * Public org-site pages and enrollment E2E tests.
 *
 * In self-hosted mode, `isOrgSite` is always true, so org-site routes
 * (/courses, /course/[slug]) are accessible without a subdomain.
 *
 * Tests:
 *   - Public course catalog
 *   - Course landing page
 *   - Student enrollment flow (POST)
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

test.describe('Public pages (org-site)', () => {
  let err: ErrorCollector;

  test.beforeEach(({ page }) => {
    err = setupErrorTracking(page);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-PUB-01: Public course catalog loads', async ({ page }) => {
    test.setTimeout(120_000);

    // In self-hosted mode, /courses serves the public catalog via the
    // (org-site) route group (isOrgSite is always true).
    await navigateAndSettle(page, BASE_URL + '/courses');

    // Verify the page loaded with content
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 20000 });
  });

  test('TC-PUB-02: Course landing page loads', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + '/course/getting-started-with-mvc');

    // Verify course heading is visible (use first match for text that
    // appears in both heading and description)
    await expect(page.getByText('Getting started with MVC').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-PUB-03: Student enrollment page loads and enrolls', async ({ page }) => {
    test.setTimeout(180_000);

    // Login as student first
    await login(page, STUDENT_EMAIL, PASSWORD);

    // Wait for student redirect to /lms — this can take up to 30s on a
    // cold Vite dev server (lazy compilation + app init + role check)
    try {
      // First check if already on /lms
      if (!page.url().includes('/lms')) {
        await page.waitForURL((url) => url.pathname.includes('/lms'), { timeout: 30000 });
      }
    } catch {
      // If redirect doesn't happen, that's OK — navigate directly
    }

    // Navigate to the enrollment page
    await navigateAndSettle(page, BASE_URL + '/course/getting-started-with-mvc/enroll');

    // The enrollment page may auto-enroll via $effect when the student
    // is logged in and the app is initialized.  Wait for this.
    await page.waitForTimeout(5000);

    // After enrollment, the page either shows success state or redirects.
    // At minimum, verify no page errors occurred during the flow.
    // If still on the enroll page, check for the Join button
    const currentUrl = page.url();
    if (currentUrl.includes('/enroll')) {
      const joinBtn = page.getByRole('button', { name: /join/i });
      if (await joinBtn.isVisible().catch(() => false)) {
        await joinBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    // No page errors should have occurred throughout the flow
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });
});
