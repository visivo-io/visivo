/**
 * Story: Insight & Layout Property Filtering
 *
 * Hides the scary "0 of 1366 properties" / "2 of 286 properties" by filtering
 * the property panel to chart-type-relevant essentials. Default mode is
 * "essentials"; users can opt in to the full schema with a toggle.
 *
 * Precondition: Sandbox running on :3017/:8017
 *   bash scripts/sandbox.sh start
 *
 * The default Playwright baseURL is :3001; set PROPERTY_FILTER_E2E_BASE_URL
 * to point to a different sandbox port, e.g.:
 *   PROPERTY_FILTER_E2E_BASE_URL=http://localhost:3017
 */

import { test, expect } from '@playwright/test';
import { loadExplorer } from '../helpers/explorer.mjs';

if (process.env.PROPERTY_FILTER_E2E_BASE_URL) {
  test.use({ baseURL: process.env.PROPERTY_FILTER_E2E_BASE_URL });
}

test.describe('Insight Property Filtering', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ context }) => {
    // Reset cookies between tests. We cannot blanket-clear localStorage in an
    // init script because addInitScript runs on every navigation, including
    // page.reload() — which would defeat the persistence test below. Instead,
    // each test that needs a clean slate does so explicitly.
    await context.clearCookies();
  });

  test('defaults to essentials mode and shows a Show all toggle', async ({ page }) => {
    await loadExplorer(page);

    // Ensure default state — clear only the property-filter keys.
    await page.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith('visivo_property_filter_mode_')) {
          window.localStorage.removeItem(k);
        }
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const insightSection = page.locator('[data-testid="insight-crud-section-insight"]');
    await expect(insightSection).toBeVisible({ timeout: 10000 });

    // The PropertyFilter should be visible inside the insight section.
    const filter = insightSection.locator('[data-testid="property-filter"]').first();
    await expect(filter).toBeVisible({ timeout: 10000 });
    await expect(filter).toContainText(/essential propert/);

    const toggle = insightSection.locator('[data-testid="property-filter-toggle"]').first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText(/Show all/);

    // Capture the "before" state visually.
    await page.screenshot({
      path: 'test-results/property-filtering-essentials.png',
      fullPage: true,
    });
  });

  test('toggling shows total properties count', async ({ page }) => {
    await loadExplorer(page);

    // Ensure default state — clear only the property-filter keys.
    await page.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith('visivo_property_filter_mode_')) {
          window.localStorage.removeItem(k);
        }
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const insightSection = page.locator('[data-testid="insight-crud-section-insight"]');
    await expect(insightSection).toBeVisible({ timeout: 10000 });

    const filter = insightSection.locator('[data-testid="property-filter"]').first();
    await expect(filter).toBeVisible({ timeout: 10000 });
    await expect(filter).toContainText(/essential propert/);

    const toggle = insightSection.locator('[data-testid="property-filter-toggle"]').first();
    await toggle.click();

    // After clicking, count flips to "total properties"
    await expect(filter).toContainText(/total properties/, { timeout: 5000 });
    await expect(toggle).toContainText(/Show essentials only/);

    await page.screenshot({
      path: 'test-results/property-filtering-all.png',
      fullPage: true,
    });
  });

  test('preserves last selected mode across reload (per chart type)', async ({ page }) => {
    await loadExplorer(page);

    // Start clean.
    await page.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith('visivo_property_filter_mode_')) {
          window.localStorage.removeItem(k);
        }
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const insightSection = page.locator('[data-testid="insight-crud-section-insight"]');
    await expect(insightSection).toBeVisible({ timeout: 10000 });

    // Click toggle to switch to "all" mode
    const toggle = insightSection.locator('[data-testid="property-filter-toggle"]').first();
    await toggle.click();

    const filter = insightSection.locator('[data-testid="property-filter"]').first();
    await expect(filter).toContainText(/total properties/, { timeout: 5000 });

    // Reload — mode should be preserved via localStorage
    await page.reload();
    await page.waitForLoadState('networkidle');

    const insightSectionAfter = page.locator('[data-testid="insight-crud-section-insight"]');
    await expect(insightSectionAfter).toBeVisible({ timeout: 10000 });

    const filterAfter = insightSectionAfter
      .locator('[data-testid="property-filter"]')
      .first();
    await expect(filterAfter).toBeVisible({ timeout: 10000 });
    await expect(filterAfter).toContainText(/total properties/, { timeout: 5000 });
  });
});
