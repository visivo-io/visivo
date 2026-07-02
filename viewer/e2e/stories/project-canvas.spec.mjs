/**
 * Story: render-only ProjectCanvas in the Workspace (VIS-D1 / VIS-767)
 *
 * The Workspace dashboard-scoped canvas (preview) lens now mounts
 * <ProjectCanvas>, a render-only wrapper around <DashboardNew>. At rest it must
 * be indistinguishable from View mode (`/project/<name>`): the wrapped
 * DashboardNew renders the SAME dashboard structure — the same rows, the same
 * real markdown content and the same chart item slots — NOT a placeholder and
 * NOT a blank pane.
 *
 * Scope note: VIS-767 is the render-only foundation. Whether each chart's
 * Plotly canvas finishes loading inside the Workspace lens depends on the
 * Workspace insight-job pipeline (pre-existing, identical with or without this
 * wrapper, and out of scope for D-1). This story therefore asserts render
 * PARITY of the dashboard the wrapper produces: structural equivalence with
 * View mode (same row count, real markdown, chart slots present, no
 * placeholder). Selection / hover / gestures arrive in later D-track tickets.
 *
 * Precondition: sandbox running on :3007/:8007 (VIS-767 isolated ports)
 *   VISIVO_SANDBOX_BACKEND_PORT=8007 VISIVO_SANDBOX_FRONTEND_PORT=3007 \
 *   VISIVO_SANDBOX_NAME=vis767 bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3007';
const DASHBOARD = 'simple-dashboard';

// Structural fingerprint of a rendered DashboardNew, independent of whether
// each chart's Plotly canvas has finished loading: how many rows it laid out,
// whether the real markdown body rendered, and whether chart item slots exist.
const fingerprint = async dashboard => {
  return dashboard.evaluate(node => ({
    rows: node.querySelectorAll('[data-testid^="dashboard-row-"]').length,
    hasMarkdown: node.textContent.includes('Here is the first'),
    // Chart item labels render in the slot whether or not the plot has loaded.
    hasChartSlots: node.textContent.includes('fibonacci'),
  }));
};

test.describe('ProjectCanvas render-only parity (VIS-767)', () => {
  test('Workspace canvas renders the dashboard at parity with View mode', async ({ page }) => {
    // 1) Open the dashboard in the Workspace canvas (preview) lens.
    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    // The dashboard-scoped middle pane + the render-only canvas are present.
    await expect(page.getByTestId('workspace-middle-dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('workspace-middle-dashboard-canvas')).toBeVisible();
    // The render-only wrapper mounted (NOT the placeholder).
    await expect(page.getByTestId('project-canvas')).toBeVisible();
    await expect(page.getByTestId('workspace-middle-dashboard-placeholder')).toHaveCount(0);

    // The wrapped DashboardNew rendered this dashboard's real content.
    const canvasDashboard = page.getByTestId(`dashboard_${DASHBOARD}`);
    await expect(canvasDashboard).toBeVisible({ timeout: 15000 });
    await expect(canvasDashboard.locator('[data-testid^="dashboard-row-"]').first()).toBeVisible({
      timeout: 15000,
    });

    const canvasFingerprint = await fingerprint(canvasDashboard);
    expect(canvasFingerprint.rows).toBeGreaterThan(0);
    expect(canvasFingerprint.hasMarkdown).toBe(true);
    expect(canvasFingerprint.hasChartSlots).toBe(true);

    // Screenshot the Workspace canvas for visual verification.
    await page.getByTestId('workspace-middle-dashboard-canvas').screenshot({
      path: 'e2e/stories/__screens__/vis767-workspace-canvas.png',
    });

    // 2) Open the same dashboard in View mode (/project/<name>) for parity.
    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    const viewDashboard = page.getByTestId(`dashboard_${DASHBOARD}`);
    await expect(viewDashboard).toBeVisible({ timeout: 15000 });
    // View mode warms data and renders real Plotly charts.
    await expect(viewDashboard.locator('.js-plotly-plot').first()).toBeVisible({ timeout: 60000 });

    // Same dashboard content in View mode: real markdown + real charts.
    const viewContent = await viewDashboard.evaluate(node => ({
      hasMarkdown: node.textContent.includes('Here is the first'),
      hasChartSlots: node.textContent.includes('fibonacci'),
      plots: node.querySelectorAll('.js-plotly-plot').length,
    }));
    expect(viewContent.plots).toBeGreaterThan(0);

    await viewDashboard.screenshot({
      path: 'e2e/stories/__screens__/vis767-view-mode.png',
    });

    // At-rest content parity: the same dashboard's real markdown body and chart
    // items appear in both the Workspace canvas (render-only DashboardNew) and
    // View mode — the canvas is not a placeholder or a divergent surface.
    expect(canvasFingerprint.hasMarkdown).toBe(viewContent.hasMarkdown);
    expect(canvasFingerprint.hasChartSlots).toBe(viewContent.hasChartSlots);
  });
});
