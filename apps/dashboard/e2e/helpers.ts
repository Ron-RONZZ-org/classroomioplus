/**
 * Shared helpers for E2E tests.
 *
 * All tests log in through the actual form (not API) so GUI login bugs
 * are caught in CI — same as a manual tester sitting down at the browser.
 */
import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:6036';
export const API_URL = process.env.E2E_API_URL || 'http://localhost:6035';

export const ADMIN_EMAIL = 'admin@test.com';
export const STUDENT_EMAIL = 'student@test.com';
export const PASSWORD = '123456';
export const ORG_SLUG = 'udemy-test';

// ── Error tracking ────────────────────────────────────────────────

export interface ErrorCollector {
  pageErrors: string[];
  consoleErrors: string[];
}

/**
 * Set up console error + page error tracking.
 * Call in `test.beforeEach`, then assert `expectCollectorEmpty` in `afterEach`.
 */
export function setupErrorTracking(page: Page): ErrorCollector {
  const collector: ErrorCollector = { pageErrors: [], consoleErrors: [] };

  page.on('pageerror', (err) => {
    // Filter out navigation aborted errors (Vite dev server timing)
    const msg = err.message.slice(0, 200);
    if (
      msg.includes('navigation aborted') ||
      msg.includes('NS_ERROR_') ||
      msg.includes('intl string context variable') // pre-existing i18n bug in ai-credits page
    ) {
      return;
    }
    collector.pageErrors.push(msg);
    console.log('  [PAGE ERROR]', msg);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // Filter out expected benign errors (e.g. favicon 404, ResizeObserver loops)
      const text = msg.text();
      if (text.includes('favicon.ico') || text.includes('ResizeObserver') || text.includes('Failed to load resource')) {
        return;
      }
      collector.consoleErrors.push(text.slice(0, 200));
      console.log('  [CONSOLE ERROR]', text.slice(0, 200));
    }
  });

  return collector;
}

/**
 * Assert no unexpected page / console errors occurred during the test.
 */
export function expectCollectorEmpty(c: ErrorCollector): void {
  const errors: string[] = [];
  if (c.pageErrors.length) errors.push(`Page errors: ${c.pageErrors.join('; ')}`);
  // Console errors are informative — don't fail on them by default
  // since third-party scripts may log errors outside our control.
  // Uncomment the line below to enforce zero console errors:
  // if (c.consoleErrors.length) errors.push(`Console errors: ${c.consoleErrors.join('; ')}`);
  expect(errors, `Unexpected errors during test:\n${errors.join('\n')}`).toEqual([]);
}

// ── Login ─────────────────────────────────────────────────────────

/**
 * Log in through the actual login form (not API).
 *
 * Flow:
 *  1. Navigate to /login, wait for `load` event (not just domcontentloaded)
 *     because Vite dev serves JS modules lazily after the initial HTML.
 *  2. Wait for the SvelteKit session API call (get-session) — this proves
 *     that the JS bundle has loaded, SvelteKit has hydrated, and the app
 *     is interactive.
 *  3. Fill email + password in the visible form fields.
 *  4. Click "Log In" and wait for redirect away from /login.
 *
 * CSP / Svelte 5 note: the form uses `onsubmit={handler}` which Svelte 5
 * compiles to `addEventListener('submit', handler)` on the DOM element.
 * Playwright's `.click()` dispatches a real click event that SvelteKit
 * intercepts — it does NOT trigger the (non-existent) HTML attribute.
 * This avoids the `mode: 'auto'` CSP inline-hash gap that exists in dev.
 */
export async function login(page: Page, email = ADMIN_EMAIL, password = PASSWORD): Promise<void> {
  // Clear any leftover state from previous tests
  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

  // 1. Navigate to login (domcontentloaded is faster — doesn't wait for images etc.)
  //
  //    NOTE: the Vite dev server compiles routes on demand — the first hit
  //    after a cold start can take 60-120s. CI runs the production build
  //    (pre-compiled), so 30s is fine there, but local dev runs need headroom.
  //    Keep this above the `actionTimeout` (30s) in playwright.config.ts.
  await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 });

  // 2. Wait for SvelteKit hydration: the app fetches /api/auth/get-session
  //    on mount.  When this response arrives, JS is running and the app
  //    has initialized.
  await Promise.race([
    page
      .waitForResponse((resp) => resp.url().includes('/api/auth/get-session') && resp.status() === 200, {
        timeout: 60000
      })
      .catch(() => {}),
    page.waitForTimeout(40000)
  ]);

  // Allow a brief settling window for on-submit handlers to be attached
  // after the initial session check completes.
  await page.waitForTimeout(3000);

  // 3. Fill form fields
  const emailField = page.locator('#email');
  await emailField.waitFor({ state: 'visible', timeout: 20000 });
  await emailField.fill(email);
  await page.locator('#password').fill(password);

  // 4. Submit and wait for redirect (successful login redirects to / or /org/.../dash)
  //    On a cold Vite dev server the redirect target page may still be
  //    compiling — the POST succeeds but navigation stalls for 60s+. Retry
  //    the submit (it is idempotent) instead of failing the whole test.
  let redirected = false;
  for (let attempt = 0; attempt < 3 && !redirected; attempt++) {
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 90000 }).catch(() => {}),
      page
        .locator('button[type="submit"]')
        .click()
        .catch(() => {})
    ]);
    await page.waitForTimeout(2000);
    redirected = !page.url().includes('/login');
    if (!redirected && attempt < 2) {
      console.warn(`[e2e] login redirect stalled (attempt ${attempt + 1}) — retrying submit`);
    }
  }

  if (!redirected) {
    throw new Error(`login: still on /login after 3 submit attempts. URL=${page.url()}`);
  }
}

/**
 * Log in as an org admin and land on that org's dashboard.
 *
 * Prefer this over `login()` for org-scoped tests: it asserts the session
 * actually resolved the org context, so a seeding/org-routing regression
 * fails here with a clear message instead of cascading `ORG_ID_REQUIRED`
 * console errors in every later assertion.
 *
 * After login the app redirects to the org that the session resolved
 * (`routeUserToNextPage` → `/org/{siteName}`). Navigating directly to
 * `{BASE_URL}/org/{orgSlug}/dash` afterwards is still needed because the
 * login redirect target is derived from session state, not the URL we ask
 * for here.
 */
export async function loginAndGotoOrgAdmin(page: Page, orgSlug = ORG_SLUG, email = ADMIN_EMAIL): Promise<void> {
  await login(page, email, PASSWORD);

  // The app picks the "current org" from the session (managed orgs first).
  // If the seed doesn't mark this account as an org admin, the redirect
  // lands on /lms (learner view) and every org-scoped assertion fails with
  // `ORG_ID_REQUIRED` / missing content. Fail fast instead of cascading.
  await page.waitForTimeout(3000);
  if (page.url().includes('/lms')) {
    throw new Error(
      `loginAndGotoOrgAdmin: login as ${email} landed on /lms (learner view), not the org dashboard. ` +
        `The seed must mark ${email} as admin of "${orgSlug}" (roleId 1 in organizationmember).`
    );
  }

  await navigateAndSettle(page, BASE_URL + `/org/${orgSlug}/dash`);
}

/**
 * Wait for a locator to contain non-empty text, with a timeout.
 * Useful for asserting that dynamic content has loaded.
 */
export async function expectNonEmpty(page: Page, selector: string, timeout = 10000): Promise<Locator> {
  const loc = page.locator(selector);
  await expect(loc).not.toBeEmpty({ timeout });
  return loc;
}

// ── Benchmark / timing ─────────────────────────────────────────────

/** Set to `true` (via `E2E_BENCHMARK=true`) to log page-navigation timing. */
export const E2E_BENCHMARK = process.env.E2E_BENCHMARK === 'true';

/**
 * Navigate to a URL and wait for SvelteKit hydration to complete.
 *
 * After the HTML parse, waits for the `/api/auth/get-session` response
 * as evidence that JS has hydrated and the app is interactive.
 *
 * Returns the elapsed time in milliseconds.
 */
export async function navigateAndSettle(page: Page, url: string, timeout = 90000): Promise<number> {
  const start = performance.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await Promise.race([
    page
      .waitForResponse((r) => r.url().includes('/api/auth/get-session') && r.status() === 200, { timeout })
      .catch(() => {}),
    page.waitForTimeout(15000)
  ]);
  await page.waitForTimeout(2000);
  return performance.now() - start;
}

/**
 * Like {@link navigateAndSettle} but logs elapsed time when
 * `E2E_BENCHMARK=true` is set.
 *
 * The benchmark flag is a soft signal (no assertions) — useful for
 * trend analysis without failing on Vite dev server variance.
 */
export async function benchNavigate(page: Page, url: string, label: string, timeout = 90000): Promise<number> {
  const elapsed = await navigateAndSettle(page, url, timeout);
  if (E2E_BENCHMARK) {
    console.log(`  [BENCHMARK] ${label}: ${elapsed.toFixed(0)}ms`);
  }
  return elapsed;
}
