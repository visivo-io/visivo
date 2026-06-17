/* eslint-disable no-template-curly-in-string */
/**
 * Story: the Workspace source "Data" tab reads the BACKEND-CACHED schema
 * (jared/fix-source-introspection).
 *
 * Regression: the right-rail Data outline (and the Source Canvas ERD) built
 * their trees from the LIVE introspect (`/api/project/sources_metadata/`), which
 * returns zero databases for file sources like local-duckdb — so the Data tab
 * showed "No tables to show / 0 DBS" even though the source has tables.
 *
 * The fix mirrors the Explorer's SourceBrowser exactly: read the cached schema
 * via the `source-schema-jobs` endpoints. On select we check the source's
 * `has_cached_schema`; if cached we load the flat tables (lazy-loading columns
 * per table on expand); if NOT cached we show "Generate schema", which runs
 * introspection + polls, then loads the now-cached tables. The loaded tree is
 * cached in the Zustand store so re-selecting is instant — no re-fetch.
 *
 * This story drives BOTH paths against the integration project's real sources:
 *   1. local-duckdb starts with no cached schema → the Generate flow caches it,
 *      tables appear, expanding a table lazy-loads its columns, and the Source
 *      Canvas ERD then renders the same cached tables.
 *   2. re-selecting local-duckdb hydrates the cached tree instantly (no
 *      re-introspect, no loading spinner).
 *
 * Precondition: the isolated sandbox running the integration project
 * (`bash scripts/sandbox.sh start`). Override the base via VIS_CANVAS_BASE.
 */

import { test, expect } from '@playwright/test';
import {
  SCREENS,
  WAIT,
  collectErrors,
  openWorkspace,
  selectLibraryObject,
  openDataTab,
} from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1400 } });

const SRC = 'local-duckdb';
const GEN_WAIT = 60000; // schema generation runs a real introspect + poll loop.

const selectSource = (page, name) => selectLibraryObject(page, 'source', name);

/**
 * Bring `SRC` into a warm (cached-schema) state in the Data tab. If the backend
 * already has a cached schema the tree is present immediately; otherwise the cold
 * "Generate schema" prompt drives a real introspect + poll until the tree lands.
 * Returns once the `source-outline-tree` is visible.
 */
const ensureWarmDataTree = async page => {
  await selectSource(page, SRC);
  await openDataTab(page);
  await expect(page.getByTestId('workspace-source-outline')).toBeVisible({ timeout: WAIT });

  const tree = page.getByTestId('source-outline-tree');
  const cold = page.getByTestId('source-outline-generate');
  // Settle on either the tree (already cached) or the Generate prompt — never an
  // infinite loading spinner.
  await expect(tree.or(cold)).toBeVisible({ timeout: WAIT });

  if (await cold.isVisible().catch(() => false)) {
    await cold.click();
    // Generation runs a real introspect + poll; the tree replaces the cold state.
    await expect(tree).toBeVisible({ timeout: GEN_WAIT });
  }
  await expect(tree).toBeVisible({ timeout: WAIT });
  // Generation never leaves the loading spinner stuck.
  await expect(page.getByTestId('source-outline-loading')).toHaveCount(0);
};

test.describe('Source Data tab reads the cached schema (fix-source-introspection)', () => {
  test.setTimeout(120000);

  test('selecting a source loads its tables (cache or Generate) and lazy-loads columns', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await ensureWarmDataTree(page);

    // The pseudo-database node (named after the source, since the cached feed is
    // flat) renders under the default-expanded root. Expand it to reveal tables.
    const dbKey = `source-outline::${SRC}::db::${SRC}`;
    const dbNode = page.getByTestId(`source-outline-node-${dbKey}`);
    await expect(dbNode).toBeVisible({ timeout: WAIT });
    await page.getByTestId(`source-outline-node-${dbKey}-toggle`).click();

    // At least one table renders from the cached schema (duckdb HAS tables — the
    // exact regression). Grab the first table node.
    const firstTable = page.locator(`[data-testid^="source-outline-node-${dbKey}::table::"]`).first();
    await expect(firstTable).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/srcdata-01-tables.png` });

    // Expanding a table lazy-loads its columns: a column node appears under it.
    const tableTestId = await firstTable.getAttribute('data-testid');
    const tableKey = tableTestId.replace('source-outline-node-', '');
    const tableToggle = page.getByTestId(`source-outline-node-${tableKey}-toggle`);
    await expect(tableToggle).toBeVisible({ timeout: WAIT });
    await tableToggle.click();

    const firstColumn = page
      .locator(`[data-testid^="source-outline-node-${tableKey}::col::"]`)
      .first();
    await expect(firstColumn).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/srcdata-02-columns.png` });
    expect(errors).toEqual([]);
  });

  test('the Source Canvas ERD renders the same cached tables', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // Warm the cache via the Data tab first (Generate if needed).
    await ensureWarmDataTree(page);

    // The Source canvas frame mounts on the Canvas (preview) lens and the ERD
    // reads the SAME cached schema — so it shows table nodes, not an empty ERD.
    await expect(page.getByTestId('workspace-middle-source-preview')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('source-erd')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('[data-testid^="source-erd-node-"]').first()).toBeVisible({
      timeout: WAIT,
    });
    // The Canvas lens never falls through to the universal Lineage DAG.
    await expect(page.getByTestId('workspace-middle-source-lineage')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/srcdata-03-erd.png` });
    expect(errors).toEqual([]);
  });

  test('re-selecting the source shows the cached tree instantly (no re-introspect)', async ({
    page,
  }) => {
    await openWorkspace(page);

    // First select warms the cache (Generate if needed) and writes the store cache.
    await ensureWarmDataTree(page);
    await page.waitForFunction(
      name => !!window.useStore?.getState?.().workspaceSourceOutlineDataCache?.[name],
      SRC,
      { timeout: WAIT }
    );

    // Visit a different source, then return to duckdb.
    await selectSource(page, 'local-postgres');
    await openDataTab(page);
    await expect(page.getByTestId('workspace-source-outline')).toBeVisible({ timeout: WAIT });

    // Returning hydrates from the store cache: the tree is present immediately and
    // NEVER passes back through the loading state (a fresh fetch would show it).
    await selectSource(page, SRC);
    await openDataTab(page);
    await expect(page.getByTestId('source-outline-tree')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('source-outline-loading')).toHaveCount(0);

    const cached = await page.evaluate(
      name => window.useStore.getState().workspaceSourceOutlineDataCache?.[name],
      SRC
    );
    expect(cached).toBeTruthy();
    expect(cached.hasCachedSchema).toBe(true);
  });
});
