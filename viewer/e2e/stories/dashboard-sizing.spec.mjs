/**
 * Story: Dashboard sizing (VIS-1458 L1 / L3 / L4 / L5)
 *
 * Measures rendered geometry on /project/sizing-dashboard (fixture:
 * test-projects/integration/sizing_dashboard.visivo.yml) at a wide (1600px) and
 * a narrow (900px, below the /project 1024px stacking breakpoint) viewport.
 *
 *   L1  row 0: a chart in a `compact` row renders a ~256px plot, not 1024px.
 *   L3  row 1: four width-3 KPIs in a `small` row stack to ~160px tiles at
 *       900px (not 4 x 256px); row 2: an [8,4] `large` row stacks to
 *       ~341px + ~171px.
 *   L4  row 3: a nested container with sub-rows `512` (int) and `small`
 *       splits its slot 2:1, not 8:2.
 *   L5  the compile-time guard (`Item.width >= 1`) is covered by pytest; the
 *       viewer fallback is covered by Dashboard.test.jsx.
 *
 * Precondition: sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8031 VISIVO_SANDBOX_FRONTEND_PORT=3031 \
 *     VISIVO_SANDBOX_NAME=vis1458 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3031 npx playwright test e2e/stories/dashboard-sizing.spec.mjs
 */

import { test, expect } from '@playwright/test';

const WIDE = { width: 1600, height: 1000 };
const NARROW = { width: 900, height: 1000 };
const SCREENS = 'e2e/stories/__screens__';
// Row heights carry an 8px chart inset plus sub-pixel/border slack.
const TOLERANCE = 16;

const slotBoxes = async row => {
  const slots = row.locator(':scope > [data-canvas-path]');
  const count = await slots.count();
  const boxes = [];
  for (let i = 0; i < count; i += 1) boxes.push(await slots.nth(i).boundingBox());
  return boxes;
};

const openSizingDashboard = async (page, viewport) => {
  await page.setViewportSize(viewport);
  await page.goto('/project/sizing-dashboard');
  await page.waitForLoadState('networkidle');
  const dashboard = page.getByTestId('dashboard_sizing-dashboard');
  await expect(dashboard).toBeVisible({ timeout: 15000 });
  // All 10 fixture charts have plotted (no Loading placeholders left) before we measure.
  await expect(dashboard.locator('.js-plotly-plot')).toHaveCount(10, { timeout: 30000 });
  return dashboard;
};

test.describe('Dashboard sizing (VIS-1458)', () => {
  test('wide: compact chart row is ~256px, KPI row is 256px, nested int sub-row splits 2:1', async ({
    page,
  }) => {
    await openSizingDashboard(page, WIDE);

    // L1 — compact row with a chart.
    const compactRow = page.getByTestId('dashboard-row-0');
    const compactBox = await compactRow.boundingBox();
    expect(compactBox.height).toBeGreaterThan(256 - TOLERANCE);
    expect(compactBox.height).toBeLessThan(256 + TOLERANCE);

    // Control: a small row keeps its 256px grid height side-by-side.
    const kpiRow = page.getByTestId('dashboard-row-1');
    const kpiBox = await kpiRow.boundingBox();
    expect(Math.abs(kpiBox.height - 256)).toBeLessThanOrEqual(2);
    const kpis = await slotBoxes(kpiRow);
    expect(kpis).toHaveLength(4);
    // All four share one Y band (side-by-side).
    expect(new Set(kpis.map(b => Math.round(b.y))).size).toBe(1);

    // L4 — nested container in row 3: sub-rows [512 (int), small].
    const nestedRows = page.getByTestId('dashboard-row-3').getByTestId('dashboard-nested-subrow');
    await expect(nestedRows).toHaveCount(2);
    const sub0 = await nestedRows.nth(0).boundingBox();
    const sub1 = await nestedRows.nth(1).boundingBox();
    const ratio = sub0.height / sub1.height;
    // Weight 4 : weight 2 (was 8 : 2 = 4 when the int fell through to 8).
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
    // 512px slot split 2:1 -> ~341px and ~171px.
    expect(Math.abs(sub0.height - 341)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(sub1.height - 171)).toBeLessThanOrEqual(TOLERANCE);

    await page.screenshot({ path: `${SCREENS}/vis1458-sizing-wide.png`, fullPage: true });
  });

  test('narrow (900px): stacked items take their width share of the row height', async ({
    page,
  }) => {
    await openSizingDashboard(page, NARROW);

    // L1 — compact chart row stays ~256px when stacked too.
    const compactBox = await page.getByTestId('dashboard-row-0').boundingBox();
    expect(compactBox.height).toBeGreaterThan(256 - TOLERANCE);
    expect(compactBox.height).toBeLessThan(256 + TOLERANCE);

    // L3 — [3,3,3,3] small row: four stacked tiles at the 160px floor, NOT 256px each.
    const kpiRow = page.getByTestId('dashboard-row-1');
    const kpis = await slotBoxes(kpiRow);
    expect(kpis).toHaveLength(4);
    // Stacked: strictly increasing Y.
    for (let i = 1; i < kpis.length; i += 1) {
      expect(kpis[i].y).toBeGreaterThanOrEqual(kpis[i - 1].y + kpis[i - 1].height - 2);
    }
    for (const box of kpis) {
      expect(box.height, `KPI tile height ${box.height}`).toBeLessThan(160 + TOLERANCE);
      expect(box.height).toBeGreaterThan(160 - TOLERANCE);
    }
    const kpiBox = await kpiRow.boundingBox();
    expect(kpiBox.height).toBeLessThan(4 * 160 + 4 * TOLERANCE);

    // L3 — [8,4] large row: 512 * 8/12 = 341 and 512 * 4/12 = 171.
    const splitRow = page.getByTestId('dashboard-row-2');
    const split = await slotBoxes(splitRow);
    expect(split).toHaveLength(2);
    expect(Math.abs(split[0].height - 341)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(split[1].height - 171)).toBeLessThanOrEqual(TOLERANCE);
    expect(split[1].y).toBeGreaterThanOrEqual(split[0].y + split[0].height - 2);

    await page.screenshot({ path: `${SCREENS}/vis1458-sizing-narrow.png`, fullPage: true });
  });
});
