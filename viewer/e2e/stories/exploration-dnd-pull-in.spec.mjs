/**
 * Story: Exploration DnD pull-in (Explore 2.0 Phase 3a — D9 / D7,
 * 02-architecture.md §4). `ExplorerDndContext` is deleted from the
 * ExplorationWorkbench nesting; the exploration surface mounts under the
 * shell's single `WorkspaceDndContext`, whose router
 * (`routeExplorationDragEnd`) ported the legacy right panel's drop-zone
 * resolution logic verbatim AND adds the new Library payload extension +
 * SQL-editor drop target. Successor to `explorer-dnd.spec.mjs` /
 * `explorer-interaction-dnd.spec.mjs`'s DnD-mechanics half (05-e2e-ledger.md).
 *
 * Three pull-in gestures, all asserted THROUGH THE BACKEND record after the
 * draft debounce settles (never a client-only proxy signal):
 *   1. Library schema table → SQL editor: seeds a brand-new query chip
 *      (`SELECT * FROM <table>`) bound to that table's source.
 *   2. Library schema column → SQL editor: inserts the bare column name at
 *      the Monaco cursor (does NOT create a new query).
 *   3. Library schema column → an insight prop slot (`droppable-property-x`,
 *      post-cutover live via the rebuilt Build rail's
 *      `TracePropsEditor`/`PropertyRow` — Phase 3b retired the standalone
 *      `/explorer` route + `InsightCRUDSection`/legacy `SchemaEditor` this
 *      file originally targeted, S5): serializes a resolved ref underneath
 *      while rendering a resolved pill/text, never raw `?{`/`${` syntax (D8).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationDndPullIn VISIVO_SANDBOX_BACKEND_PORT=8046 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3046 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3046 npx playwright test exploration-dnd-pull-in
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';
import { focusSqlEditor } from '../helpers/explorer.mjs';

// A tall viewport keeps the Build rail's insight properties in view without
// scrolling (mirrors canvas-dnd.spec.mjs's `test.use({ viewport: ... })`):
// dnd-kit's built-in auto-scroll triggers when the pointer lingers near a
// scrollable container's edge, and a target row near the DEFAULT viewport's
// bottom edge was observed to drift ~200px mid-drag as the panel
// auto-scrolled — by the time the drop resolved, the row that started under
// the cursor had moved, and an ADJACENT row (or nothing) was under it
// instead. A generously tall viewport keeps every drop target comfortably
// away from any edge for the whole gesture.
test.use({ viewport: { width: 1280, height: 1600 } });

const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

/**
 * Manual mouse-driven drag, matching the established dnd-kit PointerSensor
 * activation pattern (>8px movement — see `workspace-tabs-shortcuts.spec.mjs`'s
 * `drag-to-reorder tabs with a real cursor`, the reference green DnD story
 * this mirrors, including its "settle at the same final point twice" move).
 * Library rows + the SQL editor / prop slots are plain, unoccluded DOM
 * nodes — no overlay hit-testing workaround needed.
 *
 * Root-caused via a mid-drag DOM inspection (temporary instrumentation, not
 * kept): a drop aimed at the "x" prop row's box center landed on "y" (the
 * next row down) instead. The row's LIVE rect during the drag had shifted
 * ~200px from where `boundingBox()` measured it just before — dnd-kit's
 * built-in auto-scroll was firing because that row sat near the (default,
 * 720px-tall) viewport's bottom edge, scrolling the panel while the pointer
 * lingered nearby. Fixed at the source with a tall viewport (this file's
 * `test.use`), not by chasing the target's position mid-gesture.
 */
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
  // Settle at the exact same final point (mirrors the reference green
  // story's double-move) so dnd-kit's continuous re-measurement resolves
  // against the pointer's RESTING position, not one still mid-interpolation.
  await page.mouse.move(targetX, targetY, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
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

/**
 * The actual chip row locator — NOT `[data-testid^="query-chip-"]` alone.
 * That prefix also matches other real elements (`query-chip-status-dot`,
 * `query-chip-<name>-menu-trigger` on the active chip, and the
 * `query-chip-add` button), so counting it directly over-counts. Only the
 * chip row itself carries `data-active`.
 */
const chips = page => page.locator('[data-testid^="query-chip-"][data-active]');

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

/** Poll the backend exploration record until its draft settles — a hard
 * reload (or a promote) only ever sees what's actually persisted, so this is
 * the meaningful assertion, not the optimistic client-side dirty flag
 * (mirrors exploration-lifecycle.spec.mjs's waitForBackendDraftSql). */
async function waitForBackendDraft(page, id, predicate, timeout = 15000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(predicate(data.draft)).toBe(true);
  }).toPass({ timeout });
}

test.describe('Exploration DnD pull-in (Explore 2.0 Phase 3a — D9)', () => {
  let idsBeforeTest = [];

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
  });

  test('Library table → SQL editor seeds a new query chip bound to that table + source', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const existingChips = await chips(page).count();

    const tableRow = await expandSourceTable(page);
    const dropZone = page.getByTestId('sql-editor-drop-zone');
    await dragAndDrop(page, tableRow, dropZone);

    // A new chip appears (one more than before) and becomes active.
    await expect(chips(page)).toHaveCount(existingChips + 1, {
      timeout: 10000,
    });
    await expect(page.locator('.view-lines').first()).toContainText(`SELECT * FROM ${TABLE}`, {
      timeout: 10000,
    });

    // Wait for the client-side debounced sync to settle (mirrors
    // exploration-lifecycle.spec.mjs's dirty-dot check) BEFORE polling the
    // backend — a generous timeout absorbs a cold sandbox's first-request
    // warm-up cost (observed when this is the first test to hit the backend
    // in a fresh run: the debounce itself is the same ~1.6s always, but the
    // very first `/api/explorations/` round-trip in a run can take
    // noticeably longer). Polling the backend directly with only a flat
    // timeout raced that warm-up instead of waiting it out.
    await expect(page.getByTestId(`workspace-tab-dirty-exploration:${id}`)).not.toBeVisible({
      timeout: 25000,
    });
    await waitForBackendDraft(page, id, draft =>
      (draft.queries || []).some(q => (q.sql || '').includes(`SELECT * FROM ${TABLE}`))
    );
  });

  test('Library column → SQL editor inserts the bare column name at the cursor (no new query)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const existingChips = await chips(page).count();

    const tableRow = await expandSourceTable(page);
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
    const firstColumn = page.locator('[data-testid^="library-source-column-"]').first();
    await expect(firstColumn).toBeVisible({ timeout: 10000 });
    const columnName = await firstColumn.getAttribute('data-testid').then(t =>
      t.replace(`library-source-column-${SOURCE}-${TABLE}-`, '')
    );

    // Focus the editor at the end of its current content before dropping.
    await focusSqlEditor(page);
    await page.keyboard.press('Control+End');

    await dragAndDrop(page, firstColumn, page.getByTestId('sql-editor-drop-zone'));

    // No new chip — the drop targeted the ACTIVE query's editor, not a seed.
    await expect(chips(page)).toHaveCount(existingChips);
    await expect(page.locator('.view-lines').first()).toContainText(columnName, { timeout: 10000 });
  });

  test('Library column → an insight prop slot serializes ?{${ref(query).col}} underneath, rendering a resolved pill/text (D8) — asserted through the backend', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    const tableRow = await expandSourceTable(page);
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
    const firstColumn = page.locator('[data-testid^="library-source-column-"]').first();
    await expect(firstColumn).toBeVisible({ timeout: 10000 });
    const columnName = await firstColumn.getAttribute('data-testid').then(t =>
      t.replace(`library-source-column-${SOURCE}-${TABLE}-`, '')
    );

    const xPropSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xPropSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, firstColumn, xPropSlot);

    // D8: the Build rail never shows raw ref syntax — the prop slot renders
    // a resolved pill/text (RefTextArea's existing behavior), not `?{`/`${`.
    await expect(xPropSlot).not.toContainText('?{');
    await expect(xPropSlot).not.toContainText('${');
    await expect(xPropSlot).toContainText(columnName);

    // The real assertion: the SERIALIZED value underneath, through the
    // backend record after the draft debounce settles.
    //
    // Integration-gate note (Explore 2.0 Phase 3b, D10 upgrade — intentional,
    // not a regression): this file predates the pill-aggregation grammar
    // (06-pill-aggregation-grammar.md), so it originally expected a bare ref
    // here. `test_table`'s two columns (X, Y) are both BIGINT, and
    // `InsightBuildSection.handleDropField`'s v1 drop-default heuristic (06
    // §3) now wraps any "confidently numeric" source-column drop in `sum(...)`
    // — the exact behavior `pill-aggregation.spec.mjs`'s first test asserts
    // directly. `firstColumn` here has no non-numeric alternative in this
    // fixture table, so the fix is updating the expectation to match D10's
    // real default rather than picking around it.
    const expectedSerialized = `?{sum(\${ref(${queryName}).${columnName}})}`;
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight =>
        Object.values(insight.props || {}).includes(expectedSerialized)
      )
    );
  });

  // e2e-gap-review.md #27 [LOW·PARTIAL]: a query chip created via Library
  // drag-and-drop, then immediately renamed before its own draft-sync
  // round-trip lands, is never proven to serialize correctly under the
  // RENAMED name. Chains the DnD-seeded chip creation directly into an
  // immediate rename — faster than the ~1.6s live-sync + backend-POST
  // window this file's other tests deliberately wait out — and verifies the
  // FINAL persisted draft through the backend, not just the DOM.
  test('a chip created via Library DnD, renamed before its own draft-sync settles, persists under the RENAMED name with its DnD-derived SQL intact', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const existingChips = await chips(page).count();

    const tableRow = await expandSourceTable(page);
    const dropZone = page.getByTestId('sql-editor-drop-zone');
    await dragAndDrop(page, tableRow, dropZone);

    await expect(chips(page)).toHaveCount(existingChips + 1, { timeout: 10000 });
    const seededName = await page.evaluate(
      () => window.useStore.getState().explorerActiveModelName
    );
    await expect(page.locator('.view-lines').first()).toContainText(`SELECT * FROM ${TABLE}`, {
      timeout: 10000,
    });

    // Rename IMMEDIATELY — no wait for the dirty dot, no backend poll first —
    // before the DnD-seeded chip's own draft-sync round trip has any chance
    // to settle.
    await page.getByTestId(`query-chip-${seededName}-menu-trigger`).click();
    await page.getByTestId(`query-chip-${seededName}-rename-action`).click();
    const input = page.getByTestId(`query-chip-${seededName}-rename-input`);
    await input.fill('orders_from_dnd');
    await input.press('Enter');

    await expect(page.getByTestId('query-chip-orders_from_dnd')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(`query-chip-${seededName}`)).not.toBeVisible();

    // The FINAL persisted draft reflects the RENAMED chip, carrying the
    // DnD-derived SQL — not a race between the DnD-creation's own draft-sync
    // and the rename's effect on the same `explorerModelTabs` slice.
    await waitForBackendDraft(page, id, draft =>
      (draft.queries || []).some(
        q => q.name === 'orders_from_dnd' && (q.sql || '').includes(`SELECT * FROM ${TABLE}`)
      )
    );
    await waitForBackendDraft(
      page,
      id,
      draft => !(draft.queries || []).some(q => q.name === seededName)
    );
  });
});
