/**
 * AI provider & profile management E2E tests.
 *
 * Verifies the settings/ai-provider page:
 *  - providers/profiles render as two expandable lists
 *  - provider creation via dialog
 *  - profile creation with base URL auto-fill from the provider
 *  - per-role activation
 *  - destructive reset/delete confirmations
 */
import { test, expect, type Page } from '@playwright/test';
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

const unique = (prefix: string) => `${prefix}-${Date.now()}`;

test.describe('AI provider settings', () => {
  let err: ErrorCollector;
  let providerName: string;

  test.beforeEach(async ({ page }) => {
    err = setupErrorTracking(page);
    await login(page, ADMIN_EMAIL, PASSWORD);
    providerName = unique('Custom LLM');
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  async function openProviderDialog(page: Page) {
    await page.getByRole('button', { name: 'Add provider' }).click();
    await expect(page.getByText('New AI provider', { exact: true })).toBeVisible({ timeout: 15000 });
  }

  /** The second accordion on the page is the profiles list. */
  const profilesAccordion = (page: Page) => page.locator('[data-slot="accordion"]').nth(1);

  test('TC-AIP-01: renders seeded providers and profiles as expandable lists', async ({ page }) => {
    test.setTimeout(180_000);
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/ai-provider`);

    // Two expandable list sections are visible.
    await expect(page.getByText('AI Providers', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('AI Profiles', { exact: true })).toBeVisible();

    // Default seeded providers are listed at root level (names only).
    await expect(page.getByText('OpenAI', { exact: true }).first()).toBeVisible();

    // Expanding a provider reveals type + default base URL.
    await page.getByText('DeepSeek', { exact: true }).first().click();
    await expect(page.getByText('deepseek', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('https://api.deepseek.com/v1', { exact: true })).toBeVisible();

    // Expanding a profile reveals its provider, masked API key, base URL.
    const profileItem = profilesAccordion(page).locator('[data-slot="accordion-item"]').first();
    await profileItem.getByRole('button').first().click();
    await expect(page.getByText('Provider', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('••••••••', { exact: true }).first()).toBeVisible();
  });

  test('TC-AIP-02: creates a provider via the dialog', async ({ page }) => {
    test.setTimeout(180_000);
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/ai-provider`);
    await expect(page.getByText('AI Providers', { exact: true })).toBeVisible({ timeout: 15000 });

    await openProviderDialog(page);

    await page.getByPlaceholder('e.g. OpenAI').fill(providerName);
    await page.getByPlaceholder('https://api.openai.com/v1').fill('https://custom.example.com/v1');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // The dialog closes and the new provider appears in the list.
    await expect(page.getByText('New AI provider', { exact: true })).toBeHidden({ timeout: 15000 });
    await expect(page.getByText(providerName, { exact: true })).toBeVisible({ timeout: 15000 });

    // Expand the new provider to confirm the default base URL stuck.
    await page.getByText(providerName, { exact: true }).click();
    await expect(page.getByText('https://custom.example.com/v1', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('TC-AIP-03: profile base URL auto-fills from the selected provider', async ({ page }) => {
    test.setTimeout(180_000);
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/ai-provider`);
    await expect(page.getByText('AI Profiles', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Add profile' }).click();
    await expect(page.getByText('New AI profile', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder('e.g. OpenAI (teacher)').fill(unique('Profile'));

    // Choose DeepSeek from the (catalog-driven) provider dropdown.
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole('option', { name: 'DeepSeek' }).click();

    // The base URL field auto-fills with the provider default.
    const baseUrlInput = page.locator('input[type="url"]');
    await expect(baseUrlInput).toHaveValue('https://api.deepseek.com/v1', { timeout: 10000 });

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('New AI profile', { exact: true })).toBeHidden({ timeout: 15000 });
  });

  test('TC-AIP-04: activates a profile per role and requires confirmation for reset', async ({ page }) => {
    test.setTimeout(180_000);
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/settings/ai-provider`);
    await expect(page.getByText('AI Profiles', { exact: true })).toBeVisible({ timeout: 15000 });

    // Expand profile rows until we find one that is not yet the teacher profile
    // (activation persists in the test DB across runs, so be tolerant).
    const items = profilesAccordion(page).locator('[data-slot="accordion-item"]');
    const itemCount = await items.count();
    let activated = false;

    for (let index = 0; index < Math.min(itemCount, 5); index += 1) {
      const item = items.nth(index);
      await item.getByRole('button').first().click();

      const setTeacher = page.getByRole('button', { name: 'Set as teacher profile' }).first();
      if (await setTeacher.isVisible().catch(() => false)) {
        await setTeacher.click();
        await expect(page.getByText('Teacher', { exact: true }).first()).toBeVisible({ timeout: 15000 });
        activated = true;
        break;
      }
    }
    expect(activated, 'expected at least one profile row with "Set as teacher profile"').toBe(true);

    // Reset to default opens the destructive confirmation dialog.
    const resetButton = page.getByRole('button', { name: 'Reset to default', exact: true }).first();
    await resetButton.click();
    await expect(page.getByText('Reset profile to default?', { exact: true })).toBeVisible({ timeout: 10000 });

    // Cancel closes the dialog without side effects.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Reset profile to default?', { exact: true })).toBeHidden({ timeout: 10000 });

    // Deleting also requires the confirmation dialog.
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByText('Delete AI profile?', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Delete AI profile?', { exact: true })).toBeHidden({ timeout: 10000 });
  });
});
