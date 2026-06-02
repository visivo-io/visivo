/**
 * Story: Table render-loop regression (VIS-830)
 *
 * Opening `new-tables-dashboard` used to crash the route with React's
 * "Maximum update depth exceeded" infinite-render loop. The loop originated in
 * Table.jsx: a setState-inside-useEffect (deps [dataName, sourceData]) re-fired on
 * every fresh `sourceData` ref, and the columns/data it produced were handed to
 * material-react-table on every render, driving MRT's internal columnOrder-sync
 * effect (`setColumnOrder`) into a runaway loop. React Router's ErrorBoundary then
 * replaced the whole route with a full-page "Unexpected Application Error!".
 *
 * The fix (Table.jsx) derives columns/tableData via useMemo (no setState-in-effect),
 * keeps them referentially stable for unchanged data, and stops feeding MRT the
 * churning column set for data-ref tables (those render via PivotableTable).
 *
 * Visivo tables render as DIV-based grids (DataTable / PivotableTable), NOT HTML
 * <table> elements — so we detect them via their grid affordances ("total rows",
 * "Columns (n/n)", "Rows:" pagination).
 *
 * Precondition: vis830 sandbox running on :3027/:8027 with data generated
 *   (visivo run in test-projects/integration so target/main/insights/*.json exist):
 *   VISIVO_SANDBOX_BACKEND_PORT=8027 VISIVO_SANDBOX_FRONTEND_PORT=3027 \
 *   VISIVO_SANDBOX_NAME=vis830 bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';

// Defaults to the VIS-830 sandbox (3027); override for the VIS-831 sandbox via
// VIS_RENDER_LOOP_BASE (e.g. http://localhost:3028 for the vis831 sandbox).
const BASE = process.env.VIS_RENDER_LOOP_BASE || 'http://localhost:3027';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'new-tables-dashboard';

const LOOP_MARKER = 'Maximum update depth exceeded';
const ERROR_BOUNDARY_MARKER = 'Unexpected Application Error';

const IGNORE_CONSOLE = [
  'favicon',
  'DevTools',
  'react-cool',
  'Download the React DevTools',
  // Pre-existing, unrelated backend 404 for source-schema introspection in the
  // integration project (not a render loop / not in scope for VIS-831).
  'source-schema-jobs',
  'Failed to load resource',
];

function attachErrorCapture(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message || String(err)));
  return { consoleErrors, pageErrors };
}

async function assertNoLoopOrBoundary(page, { consoleErrors, pageErrors }, label) {
  const all = [...consoleErrors, ...pageErrors];
  expect(
    all.filter(e => e.includes(LOOP_MARKER)),
    `${label}: render-loop ("${LOOP_MARKER}") detected`
  ).toHaveLength(0);

  const bodyText = (await page.locator('body').innerText()) || '';
  expect(bodyText.includes(ERROR_BOUNDARY_MARKER), `${label}: full-page error boundary`).toBe(
    false
  );
  expect(bodyText.includes(LOOP_MARKER), `${label}: loop text on page`).toBe(false);

  const realConsoleErrors = consoleErrors.filter(
    e => !IGNORE_CONSOLE.some(ignore => e.includes(ignore))
  );
  expect(realConsoleErrors, `${label}: unexpected console errors`).toHaveLength(0);
}

async function assertTablesRender(page, label) {
  // DataTable / PivotableTable render a div-grid with a "total rows" footer and a
  // "Columns (n/n)" indicator. Wait for at least one to appear with content.
  const totalRows = page.getByText(/total rows/i).first();
  await expect(totalRows, `${label}: no table grid rendered`).toBeVisible({ timeout: 25000 });

  const bodyText = (await page.locator('body').innerText()) || '';
  expect(/total rows/i.test(bodyText), `${label}: expected a data-row footer`).toBe(true);
  expect(/Columns \(\d+\/\d+\)/.test(bodyText), `${label}: expected a column count`).toBe(true);
}

test.describe('VIS-830 Table render-loop', () => {
  // View mode (/project) is the surface fixed by the Table.jsx change. It renders the
  // model-data table and the input-driven insight-backed table cleanly (the two
  // tables most implicated in the original loop), with no error boundary.
  test('View mode (/project) renders new-tables-dashboard without the render loop', async ({
    page,
  }) => {
    const capture = attachErrorCapture(page);

    await page.goto(`${BASE}/project/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    // Let input-driven insight jobs settle — the loop, if present, fires here.
    await page.waitForTimeout(4000);

    await assertTablesRender(page, 'project');
    await assertNoLoopOrBoundary(page, capture, 'project');

    await page.screenshot({ path: `${SCREENS}/vis830-project.png`, fullPage: true });
  });

  // Workspace canvas surface. This previously tripped a SEPARATE infinite loop in
  // useInsightsData.js (setInsightJobs inside a useEffect, re-fired by the
  // input→insight feedback): the query was keyed on a store-derived
  // pending/resolved boolean that the query result wrote back, so each store
  // write flipped the key, swapped react-query cache buckets, and re-fired the
  // effect indefinitely. VIS-831 fixes that hook (key only on monotonic input
  // values + structural-equality store-write guard).
  //
  // The canvas renders table grids lazily (viewport-gated) and has a separate,
  // unrelated "charts/tables stuck loading on canvas" investigation (VIS-827),
  // so this test asserts the VIS-831 scope: no render loop / no error boundary,
  // the dashboard surface renders (markdown + the input widget), and the
  // input-driven insight resolves its data in the store and re-runs when the
  // input value genuinely changes.
  test('Workspace canvas renders new-tables-dashboard without the render loop', async ({
    page,
  }) => {
    const capture = attachErrorCapture(page);

    await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    // Let input-driven insight jobs settle — the loop, if present, fires here.
    await page.waitForTimeout(4000);

    await assertNoLoopOrBoundary(page, capture, 'canvas');

    // The dashboard surface rendered: markdown heading + the input control.
    const bodyText = (await page.locator('body').innerText()) || '';
    expect(/New Table Features/i.test(bodyText), 'canvas: dashboard markdown rendered').toBe(true);
    expect(/Min X Value/i.test(bodyText), 'canvas: input widget rendered').toBe(true);

    // The input-driven insight resolved its data (not stuck pending) AND re-runs
    // when the input value genuinely changes — proving the input still drives the
    // insight after the loop fix.
    const refresh = await page.evaluate(async () => {
      const store = window.useStore;
      const NAME = 'filter-nonaggregate-input-test-insight';
      const lenOf = () => {
        const d = (store.getState().insightJobs || {})[NAME]?.data;
        return Array.isArray(d) ? d.length : d;
      };
      const before = lenOf();
      store.getState().setInputJobValue('min_x_value', '5', 'single-select');
      await new Promise(r => setTimeout(r, 2000));
      const after = lenOf();
      return { before, after };
    });

    expect(refresh.before, 'canvas: insight resolved before input change').toBeGreaterThan(0);
    expect(refresh.after, 'canvas: insight re-ran on input change').toBeGreaterThan(0);
    expect(refresh.after, 'canvas: input change altered the result row count').not.toBe(
      refresh.before
    );

    // Still no loop after the input-driven refetch.
    await assertNoLoopOrBoundary(page, capture, 'canvas-after-input');

    await page.screenshot({ path: `${SCREENS}/vis831-canvas.png`, fullPage: true });
  });

  // Explorer no-regression: the shared useInsightsData hook also powers Explorer's
  // insight rendering. Confirm Explorer mounts cleanly (no loop / no boundary).
  test('Explorer renders without the render loop (no-regression)', async ({ page }) => {
    const capture = attachErrorCapture(page);

    await page.goto(`${BASE}/explorer`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await assertNoLoopOrBoundary(page, capture, 'explorer');
    await page.screenshot({ path: `${SCREENS}/vis831-explorer.png`, fullPage: true });
  });
});
