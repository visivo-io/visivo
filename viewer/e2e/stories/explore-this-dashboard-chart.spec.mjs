/**
 * Story: "Explore this" from a dashboard chart's context menu (Explore 2.0
 * Phase 6c-T5 — ux-audit.md "No 'Explore this' from a dashboard chart's
 * context menu", ⚠ conflicts-with-e2e).
 *
 * The audit's auditor called this "the highest-intent moment for
 * exploration" — looking at a rendered chart on a dashboard — and found the
 * item context menu offered only Open / Open in new tab / Wrap in container
 * / Add item to row, with no path into the Explorer at all.
 * `workspace-tabs-context-menu.spec.mjs` already proves the canvas
 * right-click menu's Open/Open-in-new-tab actions work for a chart leaf —
 * this story drives the SAME real right-click gesture on the SAME dashboard
 * item and asserts the new "Explore this" action it gained.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=exploreThisDashChart VISIVO_SANDBOX_BACKEND_PORT=8058 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3058 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3058 npx playwright test explore-this-dashboard-chart
 *
 * Mints real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`. See the DOUBLE-REGISTRATION RULE note in
 * playwright.config.mjs: this filename must appear in BOTH
 * `exploration-mutations`'s `testMatch` and `parallel`'s `testIgnore`.
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const apiBase = (() => {
  try {
    const u = new URL(BASE_URL);
    return `${u.protocol}//${u.hostname}:8001`;
  } catch {
    return 'http://localhost:8001';
  }
})();
const WAIT = 20000;

// A real dashboard + its first item — a chart — in the integration test
// project (test-projects/integration/project.visivo.yml, "simple-dashboard").
const DASHBOARD = 'simple-dashboard';
const CHART = 'a-very-fibonacci-waterfall';

async function gotoWorkspace(page, path = '/workspace') {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 15000 });
}

test.describe('"Explore this" from a dashboard chart context menu (Phase 6c-T5)', () => {
  test.setTimeout(90000);

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

  test('right-clicking the chart item offers "Explore this", and using it mints a real, seeded exploration', async ({
    page,
  }) => {
    await gotoWorkspace(page, `/workspace/dashboard/${DASHBOARD}`);
    await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
    const item = page.locator('[data-canvas-path="row.0.item.0"]').first();
    await expect(item).toBeVisible({ timeout: WAIT });

    // Same real-cursor right-click `workspace-tabs-context-menu.spec.mjs`
    // already proves reaches this canvas item's context menu — the overlay
    // sits on top of a live Plotly chart, hence `force`.
    await item.hover({ force: true });
    await item.click({ button: 'right', force: true });
    const menu = page.getByTestId('canvas-context-menu');
    await expect(menu).toBeVisible();

    const exploreThis = page.getByTestId('canvas-ctx-explore-this');
    await expect(exploreThis).toBeVisible();
    await exploreThis.click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationId = new URL(page.url()).pathname.split('/').pop();

    const exploration = await (
      await page.request.get(`${apiBase}/api/explorations/${explorationId}/`)
    ).json();
    expect(exploration.seeded_from).toMatchObject({ type: 'chart', name: CHART });
    // Phase 6c-T5 naming coherence.
    expect(exploration.name).toBe(`${CHART} exploration`);

    // The seed carries the chart's REAL insights/layout, not an empty
    // scaffold — this is a hashable seed (chart), so it clears the "real
    // content" bar immediately and shows up in the Home gallery right away
    // (unlike a bare source-tile seed).
    await page.goto(`${BASE_URL}/workspace/exploration`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`exploration-card-${explorationId}-name`)).toBeVisible({
      timeout: WAIT,
    });
  });

  test('a container item (not a leaf chart) never offers "Explore this"', async ({ page }) => {
    await gotoWorkspace(page, `/workspace/dashboard/${DASHBOARD}`);
    await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
    // row.0.item.0 is the chart leaf under test above; the dashboard row
    // itself (not an item) is a legitimate right-click target with no
    // explorer subject at all.
    const row = page.locator('[data-canvas-path="row.0"]').first();
    await expect(row).toBeVisible({ timeout: WAIT });
    await row.hover({ force: true, position: { x: 4, y: 4 } });
    await row.click({ button: 'right', force: true, position: { x: 4, y: 4 } });
    const menu = page.getByTestId('canvas-context-menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('canvas-ctx-explore-this')).toHaveCount(0);
  });
});
