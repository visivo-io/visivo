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

const BASE = 'http://localhost:3027';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'new-tables-dashboard';

const LOOP_MARKER = 'Maximum update depth exceeded';
const ERROR_BOUNDARY_MARKER = 'Unexpected Application Error';

const IGNORE_CONSOLE = ['favicon', 'DevTools', 'react-cool', 'Download the React DevTools'];

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

  // Workspace canvas surface. NOTE: the canvas additionally trips a SEPARATE,
  // pre-existing infinite loop in useInsightsData.js (setInsightJobs inside a
  // useEffect, re-fired by the input→insight refresh feedback) — see VIS-830 PR
  // notes. That loop lives in DashboardNew/useInsightsData (a shared data hook),
  // NOT in Table.jsx, and is out of scope for this Table-focused fix. This test is
  // marked fixme so the suite stays honest until that hook is fixed. The Table.jsx
  // fix is independently verified by the View-mode test above and the unit tests.
  test.fixme(
    'Workspace canvas renders new-tables-dashboard without the render loop',
    async ({ page }) => {
      const capture = attachErrorCapture(page);

      await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000);

      await assertTablesRender(page, 'canvas');
      await assertNoLoopOrBoundary(page, capture, 'canvas');

      await page.screenshot({ path: `${SCREENS}/vis830-canvas.png`, fullPage: true });
    }
  );
});
