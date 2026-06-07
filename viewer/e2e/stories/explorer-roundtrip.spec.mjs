/**
 * Story: J-2 / VIS-778 — Explorer overlay round-trip from Build mode.
 *
 * From a scoped dashboard, Library "+ New Chart" opens Explorer as a modal
 * overlay over Build mode (route
 * /workspace/dashboard/<d>/explorer?return_to=workspace&slot=new). The overlay
 * is framed (border + shadow + "Adding to dashboard … · slot …" breadcrumb)
 * and its Save button reads "Save and place in slot". Esc / close returns to
 * Build mode.
 *
 * Precondition: sandbox on :3001/:8001 (integration project).
 */

import { test, expect } from '@playwright/test';

const DASHBOARD = 'simple-dashboard';

test.use({ viewport: { width: 1600, height: 1200 } });

test.describe('J-2 — Explorer overlay round-trip', () => {
  test.setTimeout(90000);

  test('the overlay route renders the framed overlay with the origin breadcrumb', async ({
    page,
  }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}/explorer?return_to=workspace&slot=new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="explorer-overlay"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="explorer-overlay-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="explorer-overlay-dashboard"]')).toContainText(
      DASHBOARD
    );
    await expect(page.locator('[data-testid="explorer-overlay-slot"]')).toContainText('new row');
  });

  test('the overlay shows "Save and place in slot" instead of the standard Save', async ({
    page,
  }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}/explorer?return_to=workspace&slot=new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="explorer-save-and-place-button"]')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('[data-testid="explorer-save-button"]')).toHaveCount(0);
  });

  test('Esc / close returns to Build mode without placing', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}/explorer?return_to=workspace&slot=new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="explorer-overlay"]')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-testid="explorer-overlay-close"]').click();
    await page.waitForURL(new RegExp(`/workspace/dashboard/${DASHBOARD}$`), { timeout: 15000 });
    await expect(page.locator('[data-testid="explorer-overlay"]')).toHaveCount(0);
  });

  test('Library "+ New Chart" inside a scoped dashboard opens the overlay', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    // Expand the Charts subsection if needed, then click "+ New Chart".
    const newChart = page.locator('[data-testid="library-subsection-chart-create"]');
    if (!(await newChart.isVisible().catch(() => false))) {
      const chartHeader = page.locator('[data-testid="library-subsection-chart-header"]');
      if (await chartHeader.count()) await chartHeader.click();
    }
    await expect(newChart).toBeVisible({ timeout: 10000 });
    await newChart.click();
    await page.waitForURL(/\/workspace\/dashboard\/.+\/explorer/, { timeout: 15000 });
    await expect(page.locator('[data-testid="explorer-overlay"]')).toBeVisible({ timeout: 20000 });
  });
});
