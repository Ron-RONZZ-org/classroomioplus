import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  // Resets + re-seeds the DB before every run (skipped in CI, which seeds its
  // own fresh Postgres service). Opt out with E2E_SKIP_DB_RESET=1.
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:6036',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Increase default timeout for SvelteKit SSR pages (~30-60s per page)
    actionTimeout: 30000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  timeout: 120000
});
