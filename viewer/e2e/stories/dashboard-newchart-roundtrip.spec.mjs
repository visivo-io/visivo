/**
 * Story: Dashboard round-trip completion — "+ New Chart" → promote →
 * "Place in <dashboard>" (Explore 2.0 Phase 5 — VIS-1068, 01-ux-spec.md §5,
 * 02-architecture.md §5).
 *
 *   1. The Library's "+ New" → Chart, scoped to an open dashboard tab, mints
 *      an exploration carrying `return_to: {dashboard}` and opens its tab.
 *   2. After a promote that includes a chart, the success state offers
 *      "Place in <dashboard>". Accepting places the promoted chart into the
 *      dashboard (via the existing placeChartInDashboardSlot canvas-add
 *      path), consumes return_to (server nulls it), and navigates to the
 *      dashboard tab — asserted through the BACKEND (never a frontend string
 *      comparison), including after a reload.
 *   3. A hard reload BETWEEN opening the intent-carrying exploration and
 *      promoting must preserve the intent (return_to survives — it's
 *      persisted on the record and re-fetched from the backend on every
 *      Workspace mount, never a local-only snapshot).
 *   4. Declining the offer ALSO consumes return_to (explicit choice, no
 *      accretion of orphaned placement intents) — the chart is NOT placed.
 *
 * Precondition: sandbox running (integration project — has ≥1 real
 * dashboard, e.g. `simple-dashboard`), e.g.
 *   VISIVO_SANDBOX_NAME=dashboardRoundtrip VISIVO_SANDBOX_BACKEND_PORT=8053 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3053 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3053 npx playwright test dashboard-newchart-roundtrip
 *
 * Mutates real backend records (explorations, models, insights, charts, AND
 * a real dashboard's config) — runs in the serial `exploration-mutations`
 * playwright project (playwright.config.mjs), never `parallel`.
 */

import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';

test.use({ viewport: { width: 1280, height: 1600 } });

const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

async function dragAndDrop(page, sourceLocator, targetLocator) {
  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();
  expect(sourceBox && targetBox, 'both drag endpoints have a box').toBeTruthy();

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.move(targetX, targetY, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function getRealDashboardName(page) {
  const res = await page.request.get(`${apiBase}/api/dashboards/`);
  expect(res.ok()).toBe(true);
  const { dashboards } = await res.json();
  expect(dashboards.length).toBeGreaterThan(0);
  return dashboards[0].name;
}

async function openDashboardCanvas(page, name) {
  await page.goto(`${BASE_URL}/workspace/dashboard/${name}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId(`dashboard_${name}`)).toBeVisible({ timeout: 30000 });
}

/** The Library's "+ New" → Chart, scoped to the currently-open dashboard tab
 * — mints an exploration carrying `return_to: {dashboard}` and opens its tab
 * (Library.jsx's `handleCreate`'s `typeKey === 'chart' && scope.dashboardName`
 * branch). */
async function newChartFromLibrary(page) {
  await page.getByTestId('library-new-object-button').click();
  await expect(page.getByTestId('library-new-object-menu')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('library-new-object-chart').click();

  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

async function expandSourceTable(page) {
  const sourceHeader = page.getByTestId('library-subsection-source-header');
  const sourceBody = page.getByTestId('library-subsection-source-body');
  if (!(await sourceBody.isVisible().catch(() => false))) await sourceHeader.click();
  await expect(sourceBody).toBeVisible({ timeout: 5000 });

  await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
  const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
  await expect(tableRow).toBeVisible({ timeout: 15000 });
  return tableRow;
}

async function firstNumericColumn(page, tableRow) {
  await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
  const col = page.locator('[data-testid^="library-source-column-"]').first();
  await expect(col).toBeVisible({ timeout: 10000 });
  return col;
}

/** Bind the active insight's x prop to a real numeric column, running the
 * active query first — buildPromoteChecklist drops the whole model tier
 * without SQL (see exploration-promote.spec.mjs's identical helper). */
async function bindXSlotToNumericColumn(page) {
  await typeSql(page, `SELECT * FROM ${TABLE}`);
  await runQuery(page);
  const tableRow = await expandSourceTable(page);
  const column = await firstNumericColumn(page, tableRow);
  const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
  await expect(xSlot).toBeVisible({ timeout: 15000 });
  await dragAndDrop(page, column, xSlot);
  await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
}

async function promoteEverything(page) {
  await page.getByTestId('explorer-save-button').click();
  await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('exploration-promote-submit').click();
  await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
}

async function fetchExploration(page, id) {
  const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

async function fetchDashboard(page, name) {
  const res = await page.request.get(`${apiBase}/api/dashboards/${encodeURIComponent(name)}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

function dashboardReferencesChart(dashboard, chartName) {
  const rows = dashboard?.config?.rows || [];
  return rows.some(row =>
    (row.items || []).some(item => (item.chart || '').includes(chartName))
  );
}

test.describe('Dashboard round-trip completion (Explore 2.0 Phase 5 — VIS-1068)', () => {
  test.describe.configure({ timeout: 90000 });

  let idsBeforeTest = [];
  const createdObjects = [];

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
    for (const { segment, name } of createdObjects.splice(0)) {
      await page.request.delete(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`).catch(() => {});
    }
    // Root-caused via live reproduction against the sandbox (integration-gate
    // fix cycle): the happy-path and hard-reload tests place the promoted
    // chart into a REAL, SHARED dashboard (`placeChartInDashboardSlot`
    // appends a brand-new row via its cache-level `saveDashboard`, per
    // 04-bug-inventory.md D12's "first free slot" fallback). Deleting the
    // chart above removes the object but NOT that dashboard row, leaving a
    // permanently dangling `${ref(<deleted chart>)}` item cached on the
    // dashboard — every subsequent test in the WHOLE gate run that resolves
    // the full project DAG (e.g. `/api/insight-compile-draft/`'s
    // `build_draft_overlay` -> `project.dag()`, which eagerly dereferences
    // every ref in the project, not just the ones relevant to the insight
    // being compiled) then 400s on an item that has nothing to do with it.
    // This is exactly what corrupted the live sandbox and cascaded into
    // `exploration-preview.spec.mjs`'s entire preview-lane cluster across
    // an unrelated spec file. Discarding this story's own cached-but-never-
    // published edits (mirrors `canvas-editing.spec.mjs` /
    // `validation-as-save.spec.mjs`'s existing `/api/commit/discard/`
    // cleanup precedent) reverts the dashboard back to its published state,
    // undoing the placement along with everything else this test cached.
    await page.request.post(`${apiBase}/api/commit/discard/`).catch(() => {});
  });

  test('happy path: promote → "Place in <dashboard>" → chart lands in the dashboard, return_to consumed', async ({
    page,
  }) => {
    const dashboardName = await getRealDashboardName(page);
    await openDashboardCanvas(page, dashboardName);

    const id = await newChartFromLibrary(page);
    await expect(async () => {
      const exploration = await fetchExploration(page, id);
      expect(exploration.return_to?.dashboard).toBe(dashboardName);
    }).toPass({ timeout: 15000 });

    await bindXSlotToNumericColumn(page);
    const chartName = `e2e_roundtrip_chart_${Date.now()}`;
    const nameInput = page.getByTestId('chart-name-input');
    await nameInput.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(chartName, { delay: 5 });
    await nameInput.blur();

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await promoteEverything(page);
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    const placeOffer = page.getByTestId('exploration-promote-return-to-offer');
    await expect(placeOffer).toBeVisible({ timeout: 10000 });
    await expect(placeOffer).toContainText(chartName);
    await expect(placeOffer).toContainText(dashboardName);

    await page.getByTestId('exploration-promote-place-in-dashboard').click();

    // Navigates to the dashboard tab.
    await expect(page.getByTestId(`dashboard_${dashboardName}`)).toBeVisible({ timeout: 20000 });

    // Asserted through the BACKEND after a reload — never a frontend string
    // comparison (feedback_backend_diffing.md).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      const dashboard = await fetchDashboard(page, dashboardName);
      expect(dashboardReferencesChart(dashboard, chartName)).toBe(true);
    }).toPass({ timeout: 20000 });

    await expect(async () => {
      const exploration = await fetchExploration(page, id);
      expect(exploration.return_to).toBeNull();
    }).toPass({ timeout: 15000 });
  });

  test('a hard reload between opening the intent-carrying exploration and promoting preserves return_to', async ({
    page,
  }) => {
    const dashboardName = await getRealDashboardName(page);
    await openDashboardCanvas(page, dashboardName);

    const id = await newChartFromLibrary(page);
    await expect(async () => {
      const exploration = await fetchExploration(page, id);
      expect(exploration.return_to?.dashboard).toBe(dashboardName);
    }).toPass({ timeout: 15000 });

    // Reload BEFORE ever promoting — return_to is persisted on the record
    // and re-fetched from the backend on every Workspace mount, never a
    // local-only (e.g. in-memory or localStorage) snapshot.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

    const exploration = await fetchExploration(page, id);
    expect(exploration.return_to?.dashboard).toBe(dashboardName);

    await bindXSlotToNumericColumn(page);
    const chartName = `e2e_roundtrip_reload_chart_${Date.now()}`;
    const nameInput = page.getByTestId('chart-name-input');
    await nameInput.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(chartName, { delay: 5 });
    await nameInput.blur();

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await promoteEverything(page);
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    // The offer still appears post-reload — the intent was never lost.
    await expect(page.getByTestId('exploration-promote-return-to-offer')).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId('exploration-promote-place-in-dashboard').click();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      const dashboard = await fetchDashboard(page, dashboardName);
      expect(dashboardReferencesChart(dashboard, chartName)).toBe(true);
    }).toPass({ timeout: 20000 });
  });

  test('declining the offer ALSO consumes return_to (explicit choice, no accretion) — the chart is never placed', async ({
    page,
  }) => {
    const dashboardName = await getRealDashboardName(page);
    await openDashboardCanvas(page, dashboardName);

    const id = await newChartFromLibrary(page);
    await bindXSlotToNumericColumn(page);
    const chartName = `e2e_roundtrip_decline_chart_${Date.now()}`;
    const nameInput = page.getByTestId('chart-name-input');
    await nameInput.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(chartName, { delay: 5 });
    await nameInput.blur();

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await promoteEverything(page);
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    await expect(page.getByTestId('exploration-promote-return-to-offer')).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId('exploration-promote-decline-placement').click();

    // The offer disappears (return_to is now null, reactively) — the modal
    // itself stays open (decline is not a promote-modal dismissal).
    await expect(page.getByTestId('exploration-promote-return-to-offer')).not.toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible();

    await expect(async () => {
      const exploration = await fetchExploration(page, id);
      expect(exploration.return_to).toBeNull();
    }).toPass({ timeout: 15000 });

    // The chart was published (it's still a normal promote), but never
    // placed into the dashboard.
    const dashboard = await fetchDashboard(page, dashboardName);
    expect(dashboardReferencesChart(dashboard, chartName)).toBe(false);
  });

  // e2e-gap-review.md P5-D3 [MEDIUM · CONFIRMED_GAP]: `dashboardExists`
  // (ExplorationPromoteModal.jsx) disables "Place in <dashboard>" with a
  // tooltip once the return_to target is gone — but no test ever minted a
  // real return_to, then actually removed the target dashboard, then reached
  // promote success to observe the disabled state. This test drives exactly
  // that, backend-asserted throughout.
  //
  // The target is a THROWAWAY, never-committed draft dashboard (created via
  // the backend save-to-cache endpoint the app's own "+ New Dashboard" flow
  // uses) rather than the shared `simple-dashboard` fixture every other test
  // in this file reads — deleting a SHARED fixture mid-suite would corrupt
  // concurrently-running specs against the same sandbox. Honest note: no
  // live in-app UI currently exposes deleting a dashboard — grep confirms
  // `DashboardEditForm.jsx` (the only component with a "Delete dashboard"
  // affordance) is never rendered anywhere outside its own tests; the
  // Workspace's Right Rail edit view for a dashboard (`RightRailEditPanel.jsx`)
  // only supports row-level edits. This test drives the deletion through the
  // same backend endpoint `deleteDashboard()` (dashboardStore.js) would call
  // if that UI existed, which is the closest honest equivalent available today.
  test('a dashboard deleted before promote disables "Place in <name>" with a tooltip; "Not now" still cleanly consumes return_to', async ({
    page,
  }) => {
    const throwawayDashboard = `e2e_p5d3_throwaway_${Date.now()}`;
    // A genuinely zero-row dashboard renders `project-canvas` at 0 height in
    // this layout (a real, if unrelated, CSS quirk root-caused via live
    // reproduction against the sandbox) — seed one empty row so the canvas
    // has real size, matching every real (non-empty) dashboard the other
    // tests in this file use.
    const createRes = await page.request.post(
      `${apiBase}/api/dashboards/${encodeURIComponent(throwawayDashboard)}/`,
      { data: { name: throwawayDashboard, type: 'internal', rows: [{ height: 'medium', items: [] }] } }
    );
    expect(createRes.ok()).toBe(true);

    await openDashboardCanvas(page, throwawayDashboard);

    const id = await newChartFromLibrary(page);
    await expect(async () => {
      const exploration = await fetchExploration(page, id);
      expect(exploration.return_to?.dashboard).toBe(throwawayDashboard);
    }).toPass({ timeout: 15000 });

    // Delete the target dashboard NOW, before promoting — see the file-level
    // note above on why this goes through the backend endpoint directly.
    // Never having been committed, this fully removes it from
    // `/api/dashboards/` (mark-for-deletion on a purely-cached, never-
    // published draft drops it from the listing entirely — see
    // dashboard_manager.py's `get_all_dashboards_with_status`), rather than
    // leaving a "deleted" stub entry a name-only lookup could still match.
    const deleteRes = await page.request.delete(
      `${apiBase}/api/dashboards/${encodeURIComponent(throwawayDashboard)}/delete/`
    );
    expect(deleteRes.ok()).toBe(true);

    // Reload so the client's `dashboards` store state (fetched once at
    // Workspace mount) genuinely reflects the deletion — mirrors the "hard
    // reload between opening the intent-carrying exploration and promoting"
    // test above, which already proves a reload here is safe for return_to.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

    await bindXSlotToNumericColumn(page);
    const chartName = `e2e_p5d3_chart_${Date.now()}`;
    const nameInput = page.getByTestId('chart-name-input');
    await nameInput.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(chartName, { delay: 5 });
    await nameInput.blur();

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await promoteEverything(page);
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    // The offer still renders (return_to is still set on the exploration
    // record — deleting the dashboard never touches it), but "Place in
    // <name>" is disabled with the explanatory tooltip once `dashboardExists`
    // correctly resolves false.
    const placeOffer = page.getByTestId('exploration-promote-return-to-offer');
    await expect(placeOffer).toBeVisible({ timeout: 10000 });
    const placeButton = page.getByTestId('exploration-promote-place-in-dashboard');
    await expect(placeButton).toBeDisabled();
    await expect(placeButton).toHaveAttribute('title', `"${throwawayDashboard}" no longer exists`);

    // "Not now" still cleanly consumes return_to even though the dashboard
    // is gone — the decline path never depended on the target existing.
    await page.getByTestId('exploration-promote-decline-placement').click();
    await expect(placeOffer).not.toBeVisible({ timeout: 10000 });

    await expect(async () => {
      const exploration = await fetchExploration(page, id);
      expect(exploration.return_to).toBeNull();
    }).toPass({ timeout: 15000 });
  });
});
