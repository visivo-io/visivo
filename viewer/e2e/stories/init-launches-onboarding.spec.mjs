/**
 * Story: visivo init launches the in-browser onboarding wizard.
 *
 * The full happy path is:
 *   1. user runs `visivo init`
 *   2. CLI writes the scaffolded project files
 *   3. CLI continues into `visivo serve` and opens the browser at
 *      `http://localhost:8000/?onboarding=1`
 *   4. The viewer redirects from `/` -> `/onboarding`
 *
 * For E2E we don't actually run `visivo init` (heavy + slow). Instead we hit
 * the running sandbox at the equivalent URL and verify the routing lands on
 * the Onboarding screen.
 *
 * Precondition: Sandbox running on a known port. Override with
 * `PLAYWRIGHT_BASE_URL=http://localhost:3011` (this branch's port allocation).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

test.describe('visivo init launches onboarding', () => {
  test.setTimeout(60000);

  test('Step 1: ?onboarding=1 redirects to /onboarding', async ({ page }) => {
    await page.goto(`${BASE_URL}/?onboarding=1`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('Step 2: Onboarding component renders welcome heading', async ({ page }) => {
    await page.goto(`${BASE_URL}/?onboarding=1`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Welcome to Visivo/i })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId('skip-onboarding-button')).toBeVisible();

    await page.screenshot({
      path: 'e2e/screenshots/init-launches-onboarding.png',
      fullPage: true,
    });
  });

  test('Step 3: localStorage flag suppresses onboarding redirect', async ({ page }) => {
    // Pre-set the localStorage flag on / first, then verify the redirect is suppressed.
    await page.goto(`${BASE_URL}/`);
    await page.evaluate(() => {
      window.localStorage.setItem('visivo_onboarding_completed', 'true');
    });

    await page.goto(`${BASE_URL}/?onboarding=1`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/\/onboarding/);
  });
});
