/**
 * Story: Computed columns on the exploration surface (P5-D6 ledger gap
 * closure, e2e-gap-review.md "Final delta pass").
 *
 * 05-e2e-ledger.md verdicts `explorer-computed-columns.spec.mjs` (US-5/6/7/8:
 * add/remove metric AND dimension computed columns via the popover,
 * invalid-expression validation) PORT — `AddComputedColumnPopover` +
 * `useExplorerDuckDB` are explicitly "carried forward (restyled, not
 * rewritten)" per 02-architecture.md §9. That capability has solid UNIT
 * coverage (`AddComputedColumnPopover.test.jsx`, `useExplorerDuckDB.test.js`,
 * `DataSectionToolbar.test.jsx`) but zero end-to-end successor anywhere in
 * the final suite — this file closes that residual gap with a real,
 * sandbox-backed pass through the actual UI.
 *
 * Precondition: sandbox running (integration project) on the standard
 * :3001/:8001 ports (`bash scripts/sandbox.sh start`).
 *
 * Read-only against the exploration's DRAFT DuckDB grid (computed columns
 * are a client-side, ephemeral concept until promote — 02-architecture.md's
 * "computed-column promote -> metric/dimension born bound" is a SEPARATE,
 * already-tested flow in exploration-promote.spec.mjs) — this file asserts
 * DOM/grid state, matching the unit tests' own treatment of this surface,
 * not a backend exploration draft shape.
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) — mints a real exploration record via the shared
 * `.visivo/explorations/` repository, same isolation need as every other
 * exploration-mutating spec.
 */
import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const API = BASE_URL.replace(':3001', ':8001');

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

test.describe('Exploration computed columns (P5-D6 ledger gap closure)', () => {
  test.describe.configure({ timeout: 60000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('US-5/6: adding a metric-shaped (aggregate) computed column shows it as a pill and in the results grid', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, 'SELECT 1 AS a, 2 AS b');
    await runQuery(page);

    await expect(page.getByTestId('data-section-toolbar')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('add-computed-column-btn').click();
    await expect(page.getByTestId('add-computed-column-popover')).toBeVisible();

    await page.getByTestId('computed-col-name').fill('total_ab');
    await page.getByTestId('computed-col-expression').fill('SUM(a + b)');

    // Debounced (750ms) client-side validation.
    await expect(page.getByTestId('validation-result')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('detected-type-badge')).toHaveText('Metric', { timeout: 5000 });

    await page.getByTestId('add-btn').click();

    await expect(page.getByTestId('computed-pill-total_ab')).toBeVisible({ timeout: 10000 });
    // P6-D12 (e2e-gap-review.md "Phase 6 delta pass") — the new column must
    // actually appear as data in the RESULTS GRID, not just as a toolbar
    // pill — the whole point of a computed column. A page-wide `getByText`
    // is satisfied by the pill above (DataSectionToolbar.jsx renders
    // `label={col.name}` — the literal text "total_ab" — as its own visible
    // node), so this test would still pass even if the column never
    // materialized in the grid at all. Scope the locator to
    // `explorer-results-grid` (the grid container, excluding the toolbar) so
    // this is a genuine, discriminating check on the grid's own content.
    await expect(
      page.getByTestId('explorer-results-grid').getByText('total_ab', { exact: false }).first()
    ).toBeVisible();
  });

  test('US-5/6: adding a dimension-shaped (non-aggregate) computed column detects "Dimension"', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, "SELECT 'x' AS a, 'y' AS b");
    await runQuery(page);

    await expect(page.getByTestId('data-section-toolbar')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('add-computed-column-btn').click();
    await page.getByTestId('computed-col-name').fill('combined_label');
    await page.getByTestId('computed-col-expression').fill('a || b');

    await expect(page.getByTestId('validation-result')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('detected-type-badge')).toHaveText('Dimension', { timeout: 5000 });

    await page.getByTestId('add-btn').click();
    await expect(page.getByTestId('computed-pill-combined_label')).toBeVisible({ timeout: 10000 });
  });

  test('US-8: an invalid expression surfaces an inline validation error instead of silently accepting it', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, 'SELECT 1 AS a');
    await runQuery(page);

    await expect(page.getByTestId('data-section-toolbar')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('add-computed-column-btn').click();
    await page.getByTestId('computed-col-name').fill('bad_col');
    // Malformed SQL — unbalanced parens / nonexistent function.
    await page.getByTestId('computed-col-expression').fill('NOT_A_REAL_FUNCTION(a');

    const result = page.getByTestId('validation-result');
    await expect(result).toBeVisible({ timeout: 5000 });
    await expect(result).not.toHaveClass(/text-green-600/);
    await expect(page.getByTestId('detected-type-badge')).not.toBeVisible();
  });

  test('US-7: removing a computed column clears its pill', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, 'SELECT 1 AS a');
    await runQuery(page);

    await expect(page.getByTestId('data-section-toolbar')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('add-computed-column-btn').click();
    await page.getByTestId('computed-col-name').fill('doubled_a');
    await page.getByTestId('computed-col-expression').fill('a * 2');
    await expect(page.getByTestId('validation-result')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('add-btn').click();

    const pill = page.getByTestId('computed-pill-doubled_a');
    await expect(pill).toBeVisible({ timeout: 10000 });

    await pill.getByTestId('pill-remove').click();
    await expect(pill).not.toBeVisible();
  });
});
