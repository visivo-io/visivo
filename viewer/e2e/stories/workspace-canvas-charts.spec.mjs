/**
 * Story: Plotly charts render in the Workspace Canvas lens (VIS-827)
 *
 * Regression guard for VIS-827. The Workspace dashboard canvas lens
 * (`/workspace/dashboard/<name>`, Canvas/preview lens) mounts <DashboardNew>.
 * Embedded chart objects in dashboards fetched from /api/dashboards/ carry
 * their `insights` as un-resolved context-string refs ("${ref(name)}").
 * <DashboardNew>'s resolveItem only normalized string refs into { name }
 * objects for the string-ref chart branch — embedded chart objects were
 * passed through untouched, so Chart.jsx's `chart.insights.map(i => i.name)`
 * yielded `undefined`, no insight data was ever matched, and every chart spun
 * forever. The fix normalizes insight refs for BOTH branches.
 *
 * This story asserts that opening a chart-bearing dashboard in the Workspace
 * Canvas lens renders at least one REAL Plotly chart (a .js-plotly-plot with
 * drawn SVG), not a perpetual loading spinner.
 *
 * Precondition: sandbox running. Defaults to the VIS-827 sandbox ports
 * (:3011 frontend / :8011 backend). Override with VIS827_BASE_URL.
 *   cd <worktree> && VISIVO_SANDBOX_BACKEND_PORT=8011 \
 *     VISIVO_SANDBOX_FRONTEND_PORT=3011 VISIVO_SANDBOX_NAME=vis827 \
 *     bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VIS827_BASE_URL || 'http://localhost:3011';
const DASHBOARD = 'simple-dashboard'; // 7 chart items in the integration project

test.describe('Workspace Canvas lens renders charts (VIS-827)', () => {
  test('Step 1: Canvas lens mounts for a chart-bearing dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    // The dashboard scope + Canvas lens are active.
    await expect(page.getByTestId('workspace-middle-dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('workspace-middle-dashboard-canvas')).toBeVisible({
      timeout: 15000,
    });
  });

  test('Step 2: at least one real Plotly chart renders (not a spinner)', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('workspace-middle-dashboard-canvas')).toBeVisible({
      timeout: 15000,
    });

    // A real Plotly chart draws a .js-plotly-plot node containing an svg.main-svg.
    // Wait for the data pipeline (insight-jobs -> parquet -> DuckDB -> Plotly).
    const plot = page.locator('.js-plotly-plot').first();
    await expect(plot).toBeVisible({ timeout: 30000 });

    // Assert the chart actually drew its plot surface, not just an empty shell.
    const drawn = await page.evaluate(() => {
      const plots = document.querySelectorAll('.js-plotly-plot');
      const svgs = document.querySelectorAll('.js-plotly-plot svg.main-svg');
      const canvases = document.querySelectorAll('.js-plotly-plot canvas');
      return { plots: plots.length, svgs: svgs.length, canvases: canvases.length };
    });
    expect(drawn.plots).toBeGreaterThanOrEqual(1);
    expect(drawn.svgs + drawn.canvases).toBeGreaterThanOrEqual(1);
  });

  test('Step 3: screenshot the rendered canvas for visual verification', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });
    // Settle layout/animation before capturing.
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: 'e2e/stories/__screens__/vis827-workspace-canvas-charts.png',
      fullPage: true,
    });
  });
});
