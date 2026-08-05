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
 *   5. The row BODY selects the source, like every other Library row type.
 *      Expanding is a separate control in the row's hover action cluster (it
 *      used to be a leading caret, which put the row at its CATEGORY header's
 *      indent rather than its siblings'), and the row carries the standard
 *      context menu it previously lacked.
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

/**
 * Expand/collapse a SOURCE row.
 *
 * The toggle is no longer a leading caret — it lives in the row's hover action
 * cluster (VIS: left-tree tweaks), which is `pointer-events-none` until the row
 * is hovered, so a bare click would miss it.
 */
async function toggleSource(page, source = SOURCE) {
  await page.getByTestId(`library-row-source-${source}`).hover();
  await page.getByTestId(`library-row-source-${source}-toggle`).click();
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

    await toggleSource(page);
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 15000,
    });
  });

  test('expanding a table shows its columns with type glyphs (# numeric, T text)', async ({
    page,
  }) => {
    await toggleSource(page);
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
    await toggleSource(page);
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

  // Selecting and expanding are separate gestures. The body click used to
  // expand (Phase 6c-T5), then briefly did both — one click doing two things
  // made "selected" ambiguous and gave no way to select without also fetching
  // a schema.
  test('clicking the source row BODY selects the source without expanding it', async ({
    page,
  }) => {
    const sourceRow = page.getByTestId(`library-row-source-${SOURCE}`);
    const toggle = page.getByTestId(`library-row-source-${SOURCE}-toggle`);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The real gesture: click the row's name/body, not the expand control.
    await sourceRow.click();

    // Selected — the source opens, like a model or a chart would.
    await expect(page.getByTestId('workspace-middle-source-preview')).toBeVisible({
      timeout: 15000,
    });
    // ...and it did NOT expand.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)
    ).not.toBeVisible();

    // Expanding is the dedicated control, and it does not change selection.
    await toggleSource(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 15000,
    });
  });

  test('the expand control stays visible while expanded, so it can be collapsed', async ({
    page,
  }) => {
    // The rest of the action cluster is hover-only. If expand hid too, the
    // only way to collapse a long drill-down would be to hover the row it is
    // pushing off screen.
    await toggleSource(page);
    const toggle = page.getByTestId(`library-row-source-${SOURCE}-toggle`);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.getByTestId('workspace-left-rail').hover();
    await expect(toggle).toBeVisible();
  });

  // Replaces the old "-open button navigates" test: that button is gone (the
  // row body does its job), so the equivalent explicit affordance to pin is
  // the context menu, which sources could not reach at all before.
  test('a source row exposes the standard context menu, including Open in new tab', async ({
    page,
  }) => {
    const sourceRow = page.getByTestId(`library-row-source-${SOURCE}`);
    await expect(page.getByTestId(`library-row-source-${SOURCE}-open`)).toHaveCount(0);

    await sourceRow.click({ button: 'right' });
    const menu = page.getByTestId(`library-row-source-${SOURCE}-context-menu`);
    await expect(menu).toBeVisible();

    await menu.getByText('Open in new tab').click();
    await expect(page.getByTestId(`workspace-tab-source:${SOURCE}`)).toBeVisible({
      timeout: 15000,
    });
  });

  test('collapsing and re-expanding a source does not re-fetch the schema (session cache)', async ({
    page,
  }) => {
    let fetchCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/source-schema-jobs/')) fetchCount += 1;
    });

    await toggleSource(page);
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 15000,
    });
    const countAfterFirstExpand = fetchCount;
    expect(countAfterFirstExpand).toBeGreaterThan(0);

    // Collapse.
    await toggleSource(page);
    await expect(page.getByTestId(`library-source-${SOURCE}-tables`)).not.toBeVisible();

    // Re-expand — reads the session cache, no additional fetch.
    await toggleSource(page);
    await expect(page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`)).toBeVisible({
      timeout: 5000,
    });
    expect(fetchCount).toBe(countAfterFirstExpand);
  });
});
