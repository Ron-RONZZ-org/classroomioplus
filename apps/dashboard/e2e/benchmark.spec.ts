import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:6036';
const API_URL = 'http://127.0.0.1:3002';

const pageErrors: string[] = [];

function setupErrorTracking(page: Page) {
  pageErrors.length = 0;
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    console.log('  [BROWSER ERROR]', err.message.slice(0, 120));
  });
}

async function measurePageLoad(page: Page, url: string, label: string): Promise<number> {
  const start = performance.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const t = performance.now() - start;
  console.log(`  ${label}: ${t.toFixed(0)}ms`);
  return t;
}

async function login(page: Page) {
  await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#email', { timeout: 10000 });
  await page.waitForSelector('#password', { timeout: 10000 });

  await page.locator('#email').fill('admin@test.com');
  await page.locator('#password').fill('123456');

  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }),
    page.locator('button[type="submit"]').click()
  ]);
}

test.describe('Performance benchmarks', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test('1. API response times', async ({ page }) => {
    for (const ep of [{ url: '/', name: 'API root' }]) {
      const start = performance.now();
      const response = await page.request.get(API_URL + ep.url);
      const t = performance.now() - start;
      console.log(`  ${ep.name}: ${t.toFixed(0)}ms (status ${response.status()})`);
      expect(t).toBeLessThan(5000);
    }
  });

  test('2. Login flow', async ({ page }) => {
    await login(page);
    console.log('  Login successful, URL:', page.url());
    expect(pageErrors).toHaveLength(0);
  });

  test('3. Page navigation (authenticated)', async ({ page }) => {
    await login(page);

    const routes = [
      { path: '/org/udemy-test/dash', name: 'Org dash' },
      { path: '/org/udemy-test/settings', name: 'Settings' },
      { path: '/org/udemy-test/settings/landingpage', name: 'Landing page settings' }
    ];

    for (const route of routes) {
      const t = await measurePageLoad(page, BASE_URL + route.path, route.name);
      expect(t).toBeLessThan(20000);
    }
    expect(pageErrors).toHaveLength(0);
  });

  test('4. Landing page editor loads without errors', async ({ page }) => {
    await login(page);

    await measurePageLoad(page, BASE_URL + '/org/udemy-test/settings/landingpage/edit', 'Landing page editor');

    // Allow preview render to stabilize
    await page.waitForTimeout(2000);

    expect(pageErrors).toHaveLength(0);
    console.log('  Editor loaded with no page errors');
  });

  test('5. Typing responsiveness in login form', async ({ page }) => {
    await measurePageLoad(page, BASE_URL + '/login', 'Login page');

    const start = performance.now();
    await page.locator('#email').click();
    await page.locator('#email').pressSequentially('admin@test.com', { delay: 20 });
    const typeTime = performance.now() - start;
    console.log(`  Typed email in ${typeTime.toFixed(0)}ms (${(typeTime / 14).toFixed(1)}ms/char)`);
    expect(typeTime).toBeLessThan(5000);
  });

  test('6. Public pages (no auth)', async ({ page }) => {
    for (const path of ['/org/udemy-test', '/org/udemy-test/courses']) {
      const t = await measurePageLoad(page, BASE_URL + path, path);
      expect(t).toBeLessThan(20000);
    }
    expect(pageErrors).toHaveLength(0);
  });
});
