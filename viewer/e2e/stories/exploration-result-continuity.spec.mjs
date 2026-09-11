/**
 * Story: exploration results survive a tab switch (M27, tier 1).
 *
 * THE BUG the field test reported: run a query, glance at another
 * exploration, come back — the grid is empty and every query has to be run
 * again. `ExplorationPane` parks the legacy `explorerStore` singleton on
 * deactivate and rehydrates it from the persisted draft on activate, and that
 * draft deliberately carries no `queryResult` (it is meant to stay a small
 * JSON document, `explorerStore.js`'s snapshot docstring). So the rows were
 * simply gone.
 *
 * THE FIX: `viewer/src/stores/explorationResultCache.js` — a page-lifetime,
 * bounded LRU keyed by exploration + query chip + source + the SQL that
 * actually ran. `CenterPanel` writes on run completion; `useModelTabPrefill`
 * reads on mount and hands the rows back through `setModelQueryResult`.
 *
 * The three tests below are the three claims that matter, and two of them are
 * refusals:
 *
 *   1. Come back and the rows are there — with NO new query job started. The
 *      network assertion is the real one: "the grid has rows" could also be
 *      satisfied by silently re-running, which is the very cost this exists
 *      to remove.
 *   2. Edit the SQL first, and coming back shows the run-your-query state
 *      rather than rows that answer a question the user has stopped asking.
 *   3. A sibling exploration never sees them — asserted with the SAME SQL
 *      typed into the sibling's chip, so every part of the cache key matches
 *      except the exploration. Left with the sibling's default empty buffer
 *      the assertion is vacuous: an empty query switches caching off outright,
 *      so the grid would be empty whether or not the key isolates.
 *
 * Tier 2 (surviving a hard RELOAD, via a parquet twin under `target/`) is
 * deliberately out of scope and unasserted here — see the cache module's
 * docstring for why that half needs a product decision first.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=resultContinuity VISIVO_SANDBOX_BACKEND_PORT=8061 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3061 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3061 npx playwright test exploration-result-continuity
 *
 * Mints/mutates real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), never
 * `parallel`. See the DOUBLE-REGISTRATION RULE note in playwright.config.mjs:
 * this filename must appear in BOTH `exploration-mutations`'s `testMatch` and
 * `parallel`'s `testIgnore`.
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
  // `useExplorerWorkbenchInit`'s "auto-create a model tab when empty" effect
  // lands asynchronously on a cold load; typing before it does silently
  // vanishes (`setActiveModelSql` no-ops with no active model).
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

// The grid virtualises its rows into absolutely-positioned divs (no <tbody>),
// so the honest "how much data is on screen" signal is DataTable's own footer
// count rather than a DOM row tally.
const rowCountLabel = page => resultsGrid(page).getByText(/total rows/);

test.describe('Exploration results survive a tab switch (M27)', () => {
  // Multi-step: mint two explorations, run a real query job, switch twice.
  // The 30s global default is tight for that once this project's
  // combined-load contention with `parallel` is in play.
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

    // Park A by activating a second exploration, exactly as a user reading
    // something else would.
    await backToHome(page);
    const idB = await newExploration(page);
    expect(idB).not.toBe(idA);

    // Count query jobs started from HERE on. A silent re-run would satisfy
    // "the grid has rows" just as well as a cache hit does — and it is the
    // cost this whole feature exists to remove, so it is what gets asserted.
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

    // The query changes. These rows now answer a question the user has
    // stopped asking, and nothing on screen would say so.
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

    // TYPE THE SAME SQL, and do not run it. This is what makes the test an
    // isolation test rather than a coincidence: a brand-new exploration's
    // auto-created chip starts with an EMPTY buffer, and
    // `explorationResultCacheKey` returns null for empty sql — so caching is
    // off for that tab no matter what the key is made of, and an empty grid
    // would prove nothing. With the same SQL in the buffer, the sibling's
    // chip carries the same generic name against the same source running the
    // same text, and every component of the key MATCHES except
    // `explorationId`. `useModelTabPrefill` reads on the keystroke, so if the
    // exploration were ever dropped from the key this grid would fill with
    // the other document's rows — which is the failure that must be
    // impossible.
    await typeSql(page, sql);

    await expect(emptyResults(page)).toBeVisible({ timeout: 20000 });
    await expect(resultsGrid(page)).toHaveCount(0);
  });
});
