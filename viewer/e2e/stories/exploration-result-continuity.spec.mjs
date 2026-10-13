/**
 * Story: exploration results survive a tab switch.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=resultContinuity VISIVO_SANDBOX_BACKEND_PORT=8061 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3061 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3061 npx playwright test exploration-result-continuity
 *
 * Mutates backend exploration records, so it runs in the serial `exploration-mutations`
 * playwright project: this filename must be in its `testMatch` and in `parallel`'s `testIgnore`.
 */

import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';
import { BASE_URL, API } from '../helpers/sandbox.mjs';

const TABLE = 'test_table';

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
  // The auto-create-model-tab effect lands asynchronously on a cold load; typing before
  // it does is silently dropped.
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  return new URL(page.url()).pathname.split('/').pop();
}

/** Back to Explorer Home, so a second exploration can be minted. */
async function backToHome(page) {
  await page.getByTestId('workspace-view-switcher-explorer').click();
  await expect(page.getByTestId('explorer-home-gallery')).toBeVisible({ timeout: 30000 });
}

async function activateTab(page, id) {
  await page.getByTestId(`workspace-tab-select-exploration:${id}`).click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(
    explorationId => window.location.pathname.endsWith(explorationId),
    id,
    { timeout: 10000 }
  );
}

const resultsGrid = page => page.getByTestId('explorer-results-grid');
const emptyResults = page => page.getByTestId('empty-results');

// Rows are virtualised into absolutely-positioned divs, so DataTable's footer count is the row signal.
const rowCountLabel = page => resultsGrid(page).getByText(/total rows/);

test.describe('Exploration results survive a tab switch (M27)', () => {
  // Mints two explorations and runs a real query job; the 30s default is tight.
  test.describe.configure({ timeout: 90000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfterTest = await listExplorationIds(page);
    for (const id of idsAfterTest.filter(id => !idsBeforeTest.includes(id))) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('run a query, park the tab, come back — same rows, no re-run', async ({ page }) => {
    await gotoExplorerHome(page);
    const idA = await newExploration(page);

    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);
    await expect(resultsGrid(page)).toBeVisible({ timeout: 20000 });
    const rowsBefore = await rowCountLabel(page).textContent();
    expect(rowsBefore).toMatch(/^[1-9]/); // real rows landed, not an empty result

    await backToHome(page);
    const idB = await newExploration(page);
    expect(idB).not.toBe(idA);

    // Count query jobs started from here on; a silent re-run must not pass this test.
    const startedJobs = [];
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('/api/model-query-jobs/')) {
        startedJobs.push(req.url());
      }
    });

    await activateTab(page, idA);

    await expect(resultsGrid(page)).toBeVisible({ timeout: 20000 });
    await expect(rowCountLabel(page)).toHaveText(rowsBefore, { timeout: 10000 });
    expect(startedJobs).toEqual([]);
  });

  test('edit the SQL first, and coming back asks you to run it — it does not show the old rows', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const idA = await newExploration(page);

    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);
    await expect(resultsGrid(page)).toBeVisible({ timeout: 20000 });

    await typeSql(page, `SELECT 1 AS untried FROM ${TABLE}`);

    await backToHome(page);
    await newExploration(page);
    await activateTab(page, idA);

    await expect(emptyResults(page)).toBeVisible({ timeout: 20000 });
    await expect(resultsGrid(page)).toHaveCount(0);
  });

  test('a sibling exploration is never shown the rows', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const sql = `SELECT * FROM ${TABLE}`;
    await typeSql(page, sql);
    await runQuery(page);
    await expect(resultsGrid(page)).toBeVisible({ timeout: 20000 });

    await backToHome(page);
    await newExploration(page);

    // Type the same SQL without running it: an empty buffer switches caching off, so
    // only a matching query makes this an isolation check on explorationId.
    await typeSql(page, sql);

    await expect(emptyResults(page)).toBeVisible({ timeout: 20000 });
    await expect(resultsGrid(page)).toHaveCount(0);
  });
});
