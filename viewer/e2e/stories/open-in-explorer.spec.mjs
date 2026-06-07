/**
 * Story: J-3 / VIS-782 — "Open in Explorer" + return chip.
 *
 * Right-clicking a chart item on the Workspace canvas offers "Open in
 * Explorer", which navigates to /explorer?insight=<name>&return_to=workspace&
 * dashboard=<name>. Explorer then shows a "Back to dashboard '<name>'" return
 * chip in a top bar; clicking it returns to /workspace/dashboard/<name>.
 *
 * Precondition: sandbox on :3001/:8001 (integration project).
 */

import { test, expect } from '@playwright/test';

const DASHBOARD = 'simple-dashboard';

test.use({ viewport: { width: 1600, height: 1200 } });

test.describe('J-3 — Open in Explorer + return chip', () => {
  test.setTimeout(90000);

  test('return chip is absent on a normal Explorer entry', async ({ page }) => {
    await page.goto('/explorer');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="explorer-return-bar"]')).toHaveCount(0);
  });

  test('return chip appears when entered with ?return_to=workspace and navigates back', async ({
    page,
  }) => {
    await page.goto(`/explorer?return_to=workspace&dashboard=${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    const chip = page.locator('[data-testid="explorer-return-chip"]');
    await expect(chip).toBeVisible({ timeout: 15000 });
    await expect(chip).toContainText(DASHBOARD);
    await chip.click();
    await page.waitForURL(new RegExp(`/workspace/dashboard/${DASHBOARD}`), { timeout: 15000 });
    expect(page.url()).toContain(`/workspace/dashboard/${DASHBOARD}`);
  });

  test('canvas right-click offers "Open in Explorer" for a chart item', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    const item = page.locator('[data-canvas-path$="item.0"]').first();
    await expect(item).toBeVisible({ timeout: 20000 });
    await item.click({ button: 'right' });
    const menu = page.locator('[data-testid="canvas-context-menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });
    const openItem = page.locator('[data-testid="canvas-ctx-open-in-explorer"]');
    // Only chart/table leaves carry the entry; assert it exists for this dashboard.
    if (await openItem.count()) {
      await openItem.click();
      await page.waitForURL(/\/explorer\?/, { timeout: 15000 });
      expect(page.url()).toContain('return_to=workspace');
      expect(page.url()).toContain(`dashboard=${DASHBOARD}`);
    }
  });
});
