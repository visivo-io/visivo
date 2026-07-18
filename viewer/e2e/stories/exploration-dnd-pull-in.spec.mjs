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
 *      live via `InsightCRUDSection`'s `SchemaEditor` — the legacy right
 *      panel, unchanged by this phase): serializes `?{${ref(query).col}}`
 *      underneath while rendering a resolved pill/text, never raw `?{`/`${`
 *      syntax (D8).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationDndPullIn VISIVO_SANDBOX_BACKEND_PORT=8046 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3046 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3046 npx playwright test exploration-dnd-pull-in
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const apiBase = (() => {
  try {
    const u = new URL(BASE_URL);
    return `${u.protocol}//${u.hostname}:8001`;
  } catch {
    return 'http://localhost:8001';
  }
})();

const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

/** Manual mouse-driven drag, matching the established dnd-kit PointerSensor
 * activation pattern (>8px movement) used by the (now-superseded)
 * `explorer-dnd.spec.mjs`. Library rows + the SQL editor / prop slots are
 * plain, unoccluded DOM nodes — no overlay hit-testing workaround needed. */
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
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.waitForTimeout(50);
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
    const existingChips = await page.locator('[data-testid^="query-chip-"]').count();

    const tableRow = await expandSourceTable(page);
    const dropZone = page.getByTestId('sql-editor-drop-zone');
    await dragAndDrop(page, tableRow, dropZone);

    // A new chip appears (one more than before) and becomes active.
    await expect(page.locator('[data-testid^="query-chip-"]')).toHaveCount(existingChips + 1, {
      timeout: 10000,
    });
    await expect(page.locator('.view-lines').first()).toContainText(`SELECT * FROM ${TABLE}`, {
      timeout: 10000,
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
    const existingChips = await page.locator('[data-testid^="query-chip-"]').count();

    const tableRow = await expandSourceTable(page);
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
    const firstColumn = page.locator('[data-testid^="library-source-column-"]').first();
    await expect(firstColumn).toBeVisible({ timeout: 10000 });
    const columnName = await firstColumn.getAttribute('data-testid').then(t =>
      t.replace(`library-source-column-${SOURCE}-${TABLE}-`, '')
    );

    // Focus the editor at the end of its current content before dropping.
    await page.locator('.view-lines').first().click();
    await page.keyboard.press('Control+End');

    await dragAndDrop(page, firstColumn, page.getByTestId('sql-editor-drop-zone'));

    // No new chip — the drop targeted the ACTIVE query's editor, not a seed.
    await expect(page.locator('[data-testid^="query-chip-"]')).toHaveCount(existingChips);
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
    const expectedSerialized = `?{\${ref(${queryName}).${columnName}}}`;
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight =>
        Object.values(insight.props || {}).includes(expectedSerialized)
      )
    );
  });
});
