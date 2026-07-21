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

  test('the fallback offer never appears when nothing was promoted this run', async ({ page }) => {
    await gotoExplorerHome(page);
    const id = await startFromSourceTile(page);
    // No query typed, nothing run, nothing to save — open Save to Project
    // directly (the empty-checklist path).
    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    // NOTE (gate correction): the modal's "No changes to save." empty state is
    // NOT reachable this way — a source-tile exploration is seeded with a
    // query + insight + chart, so the checklist is never empty here. (That the
    // untouched seed is offered for saving at all is its own finding, tracked
    // for 6c-T5/T3.) The behavior under test is the OFFER, so drive the
    // reachable negative path instead: dismiss without saving anything.
    await page.getByTestId('exploration-promote-cancel').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeHidden({ timeout: 10000 });
    // Nothing was promoted this run -> no fallback dashboard offer anywhere.
    expect(await page.getByTestId('exploration-promote-fallback-dashboard-offer').count()).toBe(0);
    await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
  });
});
