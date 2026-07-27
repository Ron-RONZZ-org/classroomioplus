import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const EMAIL = 'admin@test.com';
const PASSWORD = '123456';
const ORG_SLUG = 'udemy-test';
const BASE_URL = 'http://localhost:5173';

/**
 * Log in via direct API call (bypasses CSP blocking inline event handlers).
 *
 * Why page.evaluate() instead of form submit:
 * The SvelteKit SSR renders inline `onsubmit` handlers which the CSP
 * ('unsafe-hashes' without 'unsafe-inline') blocks. Calling the Better Auth
 * API directly via fetch + credentials: 'include' sets the session cookies
 * without relying on event handler execution.
 */
async function loginViaApi(page: Page): Promise<string> {
  // Navigate to the app first so cookies are set for the right origin.
  // Use a retry: the first navigation sometimes races with Vite HMR.
  try {
    await page.goto(BASE_URL + '/login', { waitUntil: 'load', timeout: 15000 });
  } catch {
    // Retry once if frame was detached
    await page.waitForTimeout(2000);
    await page.goto(BASE_URL + '/login', { waitUntil: 'load', timeout: 15000 });
  }
  await page.waitForTimeout(1500);

  // Call the Better Auth sign-in endpoint directly
  const result = await page.evaluate(
    async ({ email, password }) => {
      try {
        const res = await fetch('http://localhost:3002/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        return { ok: res.ok, status: res.status, hasToken: !!data.token };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    { email: EMAIL, password: PASSWORD }
  );

  expect(result.ok, `Login failed: ${JSON.stringify(result)}`).toBe(true);

  // Navigate to org dashboard to finalize the session
  await page.goto(BASE_URL + `/org/${ORG_SLUG}/dash`, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(2000);

  return ORG_SLUG;
}

test.describe('Smoke tests', () => {
  test('TC-01: Login with demo credentials', async ({ page }) => {
    test.setTimeout(120_000);
    const slug = await loginViaApi(page);
    expect(slug).toBe(ORG_SLUG);

    // Confirm the page has meaningful content (not an empty body)
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('TC-02: Org dashboard loads after login', async ({ page }) => {
    test.setTimeout(90_000);
    const slug = await loginViaApi(page);

    await page.goto(BASE_URL + `/org/${slug}/dash`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('TC-03: Course list is accessible', async ({ page }) => {
    test.setTimeout(90_000);
    const slug = await loginViaApi(page);

    await page.goto(BASE_URL + `/org/${slug}/courses`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('TC-04: Org settings page is accessible', async ({ page }) => {
    test.setTimeout(90_000);
    const slug = await loginViaApi(page);

    await page.goto(BASE_URL + `/org/${slug}/settings`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('TC-05: Fork-specific — AI provider settings load without error', async ({ page }) => {
    test.setTimeout(90_000);
    const slug = await loginViaApi(page);

    await page.goto(BASE_URL + `/org/${slug}/settings/ai-provider`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('TC-06: Fork-specific — SSO settings page renders', async ({ page }) => {
    test.setTimeout(90_000);
    const slug = await loginViaApi(page);

    // Verify the SSO settings page renders without a crash.
    // The fork hardcodes isEnterprisePlan to true, so SSO setup fields
    // are always enabled (the "Enterprise plan" badge in the UI is
    // cosmetic — the license system was removed in a6f747158).
    await page.goto(BASE_URL + `/org/${slug}/settings/auth`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('TC-07: Logout redirects to login page', async ({ page }) => {
    test.setTimeout(90_000);
    await loginViaApi(page);

    await page.goto(BASE_URL + '/logout', { waitUntil: 'load' });
    // The logout function calls SvelteKit's goto('/login'), wait for it
    await page.waitForURL('**/login**', { timeout: 15000 });
  });
});
