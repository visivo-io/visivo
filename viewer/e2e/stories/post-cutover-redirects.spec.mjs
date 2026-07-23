/**
 * Story: Explore 2.0 Phase 3b cutover redirects (VIS-1060,
 * 01-ux-spec.md §5, 02-architecture.md §5).
 *
 *   1. `/explorer` is a permanent redirect to `/workspace/exploration`.
 *   2. TopNav's "Explorer" pill links straight to `/workspace/exploration`
 *      (no redirect hop).
 *   3. `/workspace/dashboard/:dashboardName/explorer` (the old
 *      ExplorerOverlay round-trip route) mints a fresh exploration
 *      carrying a `return_to` placement intent and redirects into it.
 *
 * Precondition: sandbox running (integration project — has ≥1 real
 * dashboard, e.g. `simple-dashboard`), e.g.
 *   VISIVO_SANDBOX_NAME=postCutoverRedirects VISIVO_SANDBOX_BACKEND_PORT=8049 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3049 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3049 npx playwright test post-cutover-redirects
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';

test.describe('Explore 2.0 Phase 3b cutover redirects', () => {
  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    idsBeforeTest = res && res.ok() ? (await res.json()).map(e => e.id) : [];
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    const idsAfter = res && res.ok() ? (await res.json()).map(e => e.id) : [];
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('/explorer permanently redirects to /workspace/exploration', async ({ page }) => {
    await page.goto(`${BASE_URL}/explorer`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(`${BASE_URL}/workspace/exploration`);
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
    // The old standalone 3-panel bundle is gone entirely.
    await expect(page.getByTestId('explorer-page')).not.toBeVisible();
  });

  test('TopNav\'s Explorer pill links straight to /workspace/exploration (no redirect hop)', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    const explorerLink = page.locator('a[href="/workspace/exploration"]').first();
    await expect(explorerLink).toBeVisible({ timeout: 15000 });
    await explorerLink.click();
    await expect(page).toHaveURL(`${BASE_URL}/workspace/exploration`);
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
  });

  test('the dashboard-scoped explorer route mints a fresh exploration carrying return_to and redirects into it', async ({
    page,
  }) => {
    // Discover a real dashboard name from the running project rather than
    // hardcoding one that might not exist in every sandbox seed.
    // `/api/dashboards/` responds `{ dashboards: [...] }`, not a bare array.
    const res = await page.request.get(`${apiBase}/api/dashboards/`);
    expect(res.ok()).toBe(true);
    const { dashboards } = await res.json();
    expect(dashboards.length).toBeGreaterThan(0);
    const dashboardName = dashboards[0].name;

    await page.goto(`${BASE_URL}/workspace/dashboard/${dashboardName}/explorer`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/workspace\/exploration\/exp_/, { timeout: 20000 });
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

    const id = new URL(page.url()).pathname.split('/').pop();
    const explorationRes = await page.request.get(`${apiBase}/api/explorations/${id}/`);
    expect(explorationRes.ok()).toBe(true);
    const exploration = await explorationRes.json();
    expect(exploration.return_to?.dashboard).toBe(dashboardName);
  });
});
