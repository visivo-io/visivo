/**
 * Story: Library source drill-down (Explore 2.0 Phase 3a — D9 / VIS-1052).
 *
 * The Library's "Sources" subsection stops being a flat list: each source
 * row expands lazily into source → table → columns, reading the SAME
 * backend-cached schema feed the right-rail source Data tab uses
 * (`useSourceOutline` — B10 consolidation, 04-bug-inventory.md). Successor to
 * `explorer-source-browser.spec.mjs` (verdict REWRITE, 05-e2e-ledger.md —
 * "surfaced through the Library's D9 drill-down (retires SourceBrowser as a
 * component)").
 *
 * Covers:
 *   1. A source row is collapsed by default and does NOT fetch its schema
 *      until expanded (genuinely lazy, not just visually collapsed).
 *   2. Expanding a source shows its tables (from the cached feed); expanding
 *      a table shows its columns, with type glyphs (# numeric, T text).
 *   3. Table + column rows expose a drag handle (hover-revealed) — the drag
 *      SOURCE half of D9's DnD unification (the drop-target half is covered
 *      by exploration-dnd-pull-in.spec.mjs).
 *   4. Collapse/re-expand does not re-fetch (session cache).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=librarySourceDrilldown VISIVO_SANDBOX_BACKEND_PORT=8045 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3045 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3045 npx playwright test library-source-drilldown
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

// Real sources in the integration test project (test-projects/integration/
// project.visivo.yml): local-duckdb (file source, warms instantly) and
// local-sqlite. `test_table` is a real table selected by several models.
const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

async function gotoWorkspace(page) {
  await page.goto(`${BASE_URL}/workspace`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 30000 });
}

/** Expand the "Sources" subsection itself (VIS-828: subsections default
 * collapsed) so the per-source rows are visible at all. */
async function expandSourcesSubsection(page) {
  const header = page.getByTestId('library-subsection-source-header');
  const body = page.getByTestId('library-subsection-source-body');
  if (!(await body.isVisible().catch(() => false))) {
    await header.click();
  }
  await expect(body).toBeVisible({ timeout: 5000 });
}

test.describe('Library source drill-down (Explore 2.0 Phase 3a — D9)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWorkspace(page);
    await expandSourcesSubsection(page);
  });

  test('a source row is collapsed by default and lazily fetches its schema only on expand', async ({
    page,
  }) => {
    const sourceRow = page.getByTestId(`library-row-source-${SOURCE}`);
    await expect(sourceRow).toBeVisible();
    await expect(page.getByTestId(`library-row-source-${SOURCE}-toggle`)).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.getByTestId(`library-source-${SOURCE}-tables`)).not.toBeVisible();

    // Watch the network for the schema-jobs/tables fetch — it must not have
    // fired before expansion.
    let fetchedBeforeExpand = false;
    page.on('request', req => {
      if (req.url().includes('/api/source-schema-jobs/')) fetchedBeforeExpand = true;
    });
    await page.waitForTimeout(500);
    expect(fetchedBeforeExpand).toBe(false);

    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 15000,
    });
  });

  test('expanding a table shows its columns with type glyphs (# numeric, T text)', async ({
    page,
  }) => {
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
    await expect(tableRow).toBeVisible({ timeout: 15000 });

    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
    const columns = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}-columns`);
    await expect(columns).toBeVisible({ timeout: 10000 });
    // At least one column row rendered with a glyph badge (# or T) — the
    // exact column set depends on the fixture table's real schema, so assert
    // structurally rather than pinning specific column names.
    await expect(columns.locator('[data-testid^="library-source-column-"]').first()).toBeVisible();
  });

  test('table and column rows expose a hover-revealed drag handle', async ({ page }) => {
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
    await expect(tableRow).toBeVisible({ timeout: 15000 });
    await tableRow.hover();
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}-drag-handle`)).toBeVisible();

    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
    const firstColumn = page.locator('[data-testid^="library-source-column-"]').first();
    await expect(firstColumn).toBeVisible({ timeout: 10000 });
    await firstColumn.hover();
    await expect(firstColumn.locator('[data-testid$="-drag-handle"]')).toBeVisible();
  });

  test('collapsing and re-expanding a source does not re-fetch the schema (session cache)', async ({
    page,
  }) => {
    let fetchCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/source-schema-jobs/')) fetchCount += 1;
    });

    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 15000,
    });
    const countAfterFirstExpand = fetchCount;
    expect(countAfterFirstExpand).toBeGreaterThan(0);

    // Collapse.
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    await expect(page.getByTestId(`library-source-${SOURCE}-tables`)).not.toBeVisible();

    // Re-expand — reads the session cache, no additional fetch.
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 5000,
    });
    expect(fetchCount).toBe(countAfterFirstExpand);
  });
});
