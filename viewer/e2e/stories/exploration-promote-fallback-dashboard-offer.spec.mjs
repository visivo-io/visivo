/**
 * Story: the post-promote "add to a dashboard" offer, reached the way the
 * adversarial UX audit's auditor actually walked the surface (Explore 2.0
 * Phase 6c-T1 — ux-audit.md's "post-promote offers never appear" finding,
 * ⚠ conflicts-with-e2e, promote-roundtrip #9).
 *
 * `dashboard-newchart-roundtrip.spec.mjs` already proves the
 * `return_to`-driven "Place in <dashboard>" offer works — but ONLY through
 * ONE specific entry point: the Library's "+ New" -> Chart button, used
 * while a dashboard tab happens to be open. The audit's auditor (and
 * `promote-roundtrip`'s own narrative) never went anywhere near a dashboard
 * tab — they went Explorer home -> source tile -> query -> chart -> "Save
 * to Project", the single most common path through this surface, and it
 * never offered ANY next step toward a dashboard. This story reproduces
 * EXACTLY that ordinary flow (no dashboard ever opened, no `return_to`
 * ever armed) and asserts the fix: `ExplorationPromoteModal`'s new
 * fallback offer (`exploration-promote-fallback-dashboard-offer`), which
 * reuses the same `placeChartInDashboardSlot` plumbing the return_to-driven
 * offer does.
 *
 * Also covers W6 (Dashboard Building v1 — "Post-promote always offers a
 * destination, including a brand-new dashboard"): the ZERO-dashboard
 * first-run case, manufactured in-test by HIDING the project's existing
 * dashboards from the viewer's list fetch (`page.route`) before the app
 * loads — never by deleting them, so this file's blast radius on the shared
 * sandbox stays "one appended row" rather than "the whole dashboard
 * collection, restored only if afterEach gets to run".
 *
 * Precondition: sandbox running (integration project — has ≥1 real
 * dashboard), e.g.
 *   VISIVO_SANDBOX_NAME=fallbackOffer VISIVO_SANDBOX_BACKEND_PORT=8055 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3055 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3055 npx playwright test exploration-promote-fallback-dashboard-offer
 *
 * Mutates real backend records (explorations, models, insights, charts, AND
 * a real dashboard's config) — runs in the serial `exploration-mutations`
 * playwright project (playwright.config.mjs), never `parallel`. See the
 * DOUBLE-REGISTRATION RULE note in playwright.config.mjs: this filename
 * must appear in BOTH `exploration-mutations`'s `testMatch` AND
 * `parallel`'s `testIgnore`.
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

/** Pick an option from the brand `<Select>` (react-select, not a native
 * `<select>` — exploration-build-rail.spec.mjs's established pattern). The
 * dashboard-picker Select here is `isSearchable={false}` (a handful of
 * options at most), so this skips the type-to-filter step that pattern
 * uses for a searchable instance. */
async function pickSelectOption(page, testId, optionLabel) {
  const container = page.getByTestId(testId);
  await container.click();
  const option = page
    .locator('.vis-select__option', { hasText: new RegExp(`^${optionLabel}$`, 'i') })
    .first();
  await option.waitFor({ timeout: 5000 });
  await option.click();
}

async function getRealDashboardName(page) {
  const res = await page.request.get(`${apiBase}/api/dashboards/`);
  expect(res.ok()).toBe(true);
  const { dashboards } = await res.json();
  expect(dashboards.length).toBeGreaterThan(0);
  return dashboards[0].name;
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

/** The AUDIT'S OWN entry point — a source tile on Explorer home — never a
 * dashboard-scoped "+ New Chart" click. This is the whole point of this
 * spec: no `return_to` is ever armed anywhere in this flow. */
async function startFromSourceTile(page) {
  const tile = page.getByTestId(`explorer-home-source-tile-${SOURCE}`);
  await expect(tile).toBeVisible({ timeout: 20000 });
  await tile.click();
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

/** Rename the draft chart via its name input (select-all + type + blur). */
async function nameChart(page, chartName) {
  const nameInput = page.getByTestId('chart-name-input');
  await nameInput.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.type(chartName, { delay: 5 });
  await nameInput.blur();
}

async function fetchDashboard(page, name) {
  const res = await page.request.get(`${apiBase}/api/dashboards/${encodeURIComponent(name)}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

function dashboardReferencesChart(dashboard, chartName) {
  const rows = dashboard?.config?.rows || [];
  return rows.some(row => (row.items || []).some(item => (item.chart || '').includes(chartName)));
}

test.describe('Post-promote fallback dashboard offer, reached through the ordinary Save-to-Project flow', () => {
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
    // Same dangling-dashboard-row cleanup precedent as
    // dashboard-newchart-roundtrip.spec.mjs's afterEach — the placement
    // below appends a real row to a SHARED dashboard.
    await page.request.post(`${apiBase}/api/commit/discard/`).catch(() => {});
  });

  test('promoting from a plain source-tile-started exploration (no dashboard ever opened) offers to add the chart to a dashboard', async ({
    page,
  }) => {
    const dashboardName = await getRealDashboardName(page);

    // The audit's actual walkthrough: land on Explorer home, click a source
    // tile — NEVER a dashboard canvas, NEVER the Library's dashboard-scoped
    // "+ New Chart" button. `return_to` is never armed anywhere in this test.
    await gotoExplorerHome(page);
    const id = await startFromSourceTile(page);

    const exploration = await (await page.request.get(`${apiBase}/api/explorations/${id}/`)).json();
    expect(exploration.return_to).toBeFalsy();

    await bindXSlotToNumericColumn(page);
    const chartName = `e2e_fallback_offer_chart_${Date.now()}`;
    await nameChart(page, chartName);

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    // The return_to-specific offer never appears (no return_to was ever
    // armed) — but the fallback DOES, closing the audit's "the round-trip
    // to a dashboard cannot even begin from here" gap.
    await expect(page.getByTestId('exploration-promote-return-to-offer')).not.toBeVisible();
    const fallbackOffer = page.getByTestId('exploration-promote-fallback-dashboard-offer');
    await expect(fallbackOffer).toBeVisible({ timeout: 10000 });
    await expect(fallbackOffer).toContainText(chartName);

    await pickSelectOption(page, 'exploration-promote-fallback-dashboard-select', dashboardName);
    await page.getByTestId('exploration-promote-fallback-place').click();

    // Navigates to the dashboard tab.
    await expect(page.getByTestId(`dashboard_${dashboardName}`)).toBeVisible({ timeout: 20000 });

    // Backend-asserted after a reload — never a frontend string comparison
    // (feedback_backend_diffing.md).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      const dashboard = await fetchDashboard(page, dashboardName);
      expect(dashboardReferencesChart(dashboard, chartName)).toBe(true);
    }).toPass({ timeout: 20000 });
  });

  // W6 (Dashboard Building v1 — "Post-promote always offers a destination,
  // including a brand-new dashboard"): the FIRST-RUN case. A project with
  // ZERO dashboards used to auto-close the modal on a clean chart promote
  // (`showFallbackDashboardOffer` required `dashboards.length > 0`), so the
  // one working exit ramp from Explorer to a dashboard never fired for
  // exactly the user who needs it most — every field-test tester. Now the
  // offer renders with a "New dashboard…" default; accepting creates a
  // dashboard through the standard inline-create path and FILLS the born
  // row's existing empty slot (#621) — never appends a second row.
  test('ZERO dashboards: promote offers "New dashboard…", creates one, and fills its born slot with the chart', async ({
    page,
  }) => {
    // Manufacture the first-run state BEFORE the app loads — WITHOUT mutating
    // the shared project. An earlier version of this test soft-deleted every
    // dashboard in the sandbox and leaned on afterEach's best-effort
    // `commit/discard` to put them back: that escalated this file's blast
    // radius from "appends one row to a shared dashboard" to "tombstones the
    // whole dashboard collection", and a worker crash, a timeout before
    // afterEach, or a 500 on the discard would leave every later spec in the
    // serial `exploration-mutations` project (and this file's own first test,
    // on retry) running against a dashboard-less project.
    //
    // Hiding them from the VIEWER's list fetch produces exactly the state
    // under test — `dashboards` is empty in the store, which is all
    // `ExplorationPromoteModal` reads — while leaving the backend untouched.
    const listRes = await page.request.get(`${apiBase}/api/dashboards/`);
    expect(listRes.ok()).toBe(true);
    const preexisting = new Set((await listRes.json()).dashboards.map(d => d.name));
    // The created dashboard is named by `generateUniqueName('new-dashboard',
    // <the names the VIEWER can see>)`, so a hidden real dashboard called
    // `new-dashboard*` could be overwritten by the create. Fail loudly here
    // rather than silently clobbering a fixture.
    expect(
      [...preexisting].filter(name => name.startsWith('new-dashboard')),
      'no fixture dashboard may share the created dashboard\'s name prefix'
    ).toEqual([]);
    // Matches the LIST endpoint only (with or without a `?project_id=` query);
    // the per-dashboard save/delete routes live under
    // `/api/dashboards/<name>/` and are deliberately left alone.
    await page.route(
      url => url.pathname === '/api/dashboards/',
      async route => {
        if (route.request().method() !== 'GET') return route.fallback();
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({
          response,
          json: {
            ...body,
            dashboards: (body.dashboards || []).filter(d => !preexisting.has(d.name)),
          },
        });
      }
    );

    // The same ordinary flow as the test above — Explorer home, source tile,
    // query, chart, Save to project. No dashboard exists anywhere.
    await gotoExplorerHome(page);
    await startFromSourceTile(page);
    await bindXSlotToNumericColumn(page);
    const chartName = `e2e_zero_dash_chart_${Date.now()}`;
    await nameChart(page, chartName);

    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    // The modal did NOT auto-close as a "clean success with nothing to act
    // on" — the offer renders, and with zero dashboards its select defaults
    // to the "New dashboard…" sentinel (no picking needed).
    const fallbackOffer = page.getByTestId('exploration-promote-fallback-dashboard-offer');
    await expect(fallbackOffer).toBeVisible({ timeout: 10000 });
    await expect(fallbackOffer).toContainText(chartName);
    await expect(fallbackOffer).toContainText('New dashboard…');

    await page.getByTestId('exploration-promote-fallback-place').click();

    // A dashboard now exists that didn't a moment ago; register it for
    // cleanup and confirm its tab opened. Identified as "not one of the
    // dashboards that existed before this test", which holds whether or not
    // the route filter above applies to `page.request`.
    let createdDashboardName;
    await expect(async () => {
      const res = await page.request.get(`${apiBase}/api/dashboards/`);
      expect(res.ok()).toBe(true);
      const { dashboards } = await res.json();
      const created = dashboards.filter(d => !preexisting.has(d.name));
      expect(created).toHaveLength(1);
      createdDashboardName = created[0].name;
    }).toPass({ timeout: 20000 });
    createdObjects.push({ segment: 'dashboards', name: createdDashboardName });
    await expect(page.getByTestId(`dashboard_${createdDashboardName}`)).toBeVisible({
      timeout: 20000,
    });

    // Backend-asserted (feedback_backend_diffing.md): the chart FILLED the
    // born row's existing empty slot — exactly one row holding exactly one
    // item, and that item IS the chart. Never a second row appended below an
    // empty placeholder row.
    const dashboard = await fetchDashboard(page, createdDashboardName);
    const rows = dashboard?.config?.rows || [];
    expect(rows).toHaveLength(1);
    expect(rows[0].items).toHaveLength(1);
    expect(rows[0].items[0].chart || '').toContain(chartName);
  });

  test('the fallback offer never appears when nothing was promoted this run', async ({ page }) => {
    await gotoExplorerHome(page);
    const id = await startFromSourceTile(page);
    // No query typed, nothing run, nothing to save — open Save to Project
    // directly.
    //
    // Phase 6c-T5 (VIS-1102) fixed the bug this test used to route around:
    // an untouched source-tile exploration (empty SQL, the auto-created
    // scaffold insight with no bindings, a chart referencing only that
    // scaffold) used to be offered for saving anyway — the checklist listed
    // the seeded query/insight/chart regardless of whether the user had
    // authored anything (`promoteChecklist.js`'s pre-fix behavior). A
    // "gate correction" landed on this test in the interim claiming the
    // checklist can never be empty here — re-verified live against the
    // merged tree (:3072, both this fix and the Wave-1 merge applied) and
    // that claim no longer holds: a fresh source-tile exploration's
    // Save-to-Project modal reads "No changes to save." with a disabled
    // Promote button, exactly as this fix intends. Asserting the precise
    // empty state (not just "dismiss via Cancel") is the stronger test for
    // what's actually being gated.
    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No changes to save.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('exploration-promote-submit')).toBeDisabled();
    await page.getByTestId('exploration-promote-cancel').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeHidden({ timeout: 10000 });
    // Nothing was promoted this run -> no fallback dashboard offer anywhere.
    expect(await page.getByTestId('exploration-promote-fallback-dashboard-offer').count()).toBe(0);
    await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
  });
});
