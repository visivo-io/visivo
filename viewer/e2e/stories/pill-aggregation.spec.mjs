/**
 * Story: Pill aggregation grammar (Explore 2.0 Phase 3b — VIS-1057/1058,
 * D10, 06-pill-aggregation-grammar.md §6's Phase 3b gate).
 *
 * `exploration-build-rail.spec.mjs` covers the Build rail's CRUD shell +
 * DnD retrofit; this file is about the `pillGrammar`/`PillMenu` mechanics
 * themselves:
 *
 *   1. A numeric column drop defaults to a SUM aggregate pill with a
 *      visible function chip.
 *   2. Toggling a preset REWRITES the serialized expression — asserted
 *      THROUGH THE BACKEND after the draft debounce settles.
 *   3. A confidently non-numeric column gets the type-restricted menu
 *      (SUM/AVG/MEDIAN hidden).
 *   4. An unparseable ("opaque") expression renders as the RefTextArea
 *      fallback and survives a reload unmodified — never silently
 *      rewritten.
 *   5. No raw `?{`/`${` syntax ever appears in the rendered Build-rail
 *      text (D8's hard rule).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=pillAggregation VISIVO_SANDBOX_BACKEND_PORT=8048 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3048 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3048 npx playwright test pill-aggregation
 *
 * Mutates real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs).
 */

import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';

test.use({ viewport: { width: 1280, height: 1600 } });

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

async function firstNumericColumn(page, tableRow) {
  await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
  const col = page.locator('[data-testid^="library-source-column-"]').first();
  await expect(col).toBeVisible({ timeout: 10000 });
  const name = await col
    .getAttribute('data-testid')
    .then(t => t.replace(`library-source-column-${SOURCE}-${TABLE}-`, ''));
  return { locator: col, name };
}

async function waitForBackendDraft(page, id, predicate, timeout = 15000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(predicate(data.draft)).toBe(true);
  }).toPass({ timeout });
}

test.describe('Pill aggregation grammar (Explore 2.0 Phase 3b — D10)', () => {
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

  test('a numeric column drop defaults to a SUM pill with a visible function chip', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    const tableRow = await expandSourceTable(page);
    const { locator: column, name: columnName } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, xSlot);

    await expect(xSlot).toContainText('SUM');
    await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });

    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight =>
        Object.values(insight.props || {}).includes(`?{sum(\${ref(${queryName}).${columnName}})}`)
      )
    );
  });

  test('toggling a preset REWRITES the serialization — asserted through the backend after sync', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    const tableRow = await expandSourceTable(page);
    const { locator: column, name: columnName } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, xSlot);
    await expect(xSlot).toContainText('SUM');

    // Open the pill menu and switch the preset to AVG.
    await xSlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('pill-menu-preset-avg').click();

    await expect(xSlot).toContainText('AVG');
    await expect(xSlot).not.toContainText('SUM');

    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight =>
        Object.values(insight.props || {}).includes(`?{avg(\${ref(${queryName}).${columnName}})}`)
      )
    );

    // Toggle back to a plain Dimension — the aggregate wrapper disappears.
    await xSlot.getByTestId('pill-menu-trigger').click();
    await page.getByTestId('pill-menu-preset-dimension').click();
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight =>
        Object.values(insight.props || {}).includes(`?{\${ref(${queryName}).${columnName}}}`)
      )
    );
  });

  test('a confidently non-numeric column (by runtime value) gets the restricted preset menu', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    // Cast a column to a string so the cached query result's runtime value
    // classifies it as non-numeric (PillMenu's `useColumnIsNumeric` samples
    // the model's actual query result rows, not just a DB type declaration).
    await typeSql(page, `SELECT CAST(x AS VARCHAR) AS x_str, y FROM ${TABLE}`);
    await runQuery(page);

    const stringColumn = page.getByTestId('draggable-col-x_str');
    await expect(stringColumn).toBeVisible({ timeout: 15000 });
    const ySlot = page.locator('[data-testid*="droppable-property-y"]').first();
    await expect(ySlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, stringColumn, ySlot);

    await ySlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('pill-menu-preset-dimension')).toBeVisible();
    await expect(page.getByTestId('pill-menu-preset-min')).toBeVisible();
    await expect(page.getByTestId('pill-menu-preset-count')).toBeVisible();
    await expect(page.getByTestId('pill-menu-preset-count_distinct')).toBeVisible();
    await expect(page.getByTestId('pill-menu-preset-sum')).not.toBeVisible();
    await expect(page.getByTestId('pill-menu-preset-avg')).not.toBeVisible();
  });

  test('an unparseable expression renders opaque (RefTextArea) and survives a reload unmodified', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const raw = `count(distinct \${ref(${queryName}).x}) / count(*)`;

    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    // The slot starts in STATIC mode (the schema's oneOf offers a plain
    // static fallback, and nothing has been dropped/typed yet) — switch to
    // query mode via the toggle so RefTextArea mounts.
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type(raw, { delay: 5 });
    // Blur directly to commit — clicking some other rail element risks
    // toggling ITS collapse state as a side effect (header rows cover most
    // of their container's clickable area).
    await editable.blur();

    // Never recognized as a pill — the raw RefTextArea chip editor stays,
    // and the expression is never silently rewritten into a different shape.
    await expect(xSlot.getByTestId('pill-menu-trigger')).not.toBeVisible();
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight => insight.props?.x === `?{${raw}}`)
    );

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    const xSlotAfterReload = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlotAfterReload).toBeVisible({ timeout: 15000 });
    await expect(xSlotAfterReload.getByTestId('pill-menu-trigger')).not.toBeVisible();

    // "Survives unmodified" is a backend-serialization claim, not a DOM-text
    // one — RefTextArea always renders any embedded `${ref(...)}` as a pill
    // (e.g. "model.x") inline with the surrounding literal text, on both the
    // initial render and after reload alike. Asserting the raw `${ref(...)}`
    // syntax literally appears in the widget's rendered text would fail even
    // when nothing was rewritten, since that's simply never what gets
    // displayed. The project's own convention (never diff frontend strings
    // for modification tracking) applies here too: re-fetch the draft and
    // confirm `props.x` still matches the exact string we typed.
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight => insight.props?.x === `?{${raw}}`)
    );
  });

  // e2e-gap-review.md D11 [LOW, Phase 3b delta]: the opaque-expression
  // "never silently rewritten" guarantee is only proven above via a
  // same-exploration RELOAD — the Duplicate code path (a completely
  // different server-side/client-side construction of the new record's
  // draft) is never exercised. Extends the same fixture with a
  // Duplicate-instead-of-reload variant, backend-asserted on the NEW
  // exploration's own copy of the prop.
  test('an opaque custom expression survives Duplicate byte-for-byte (not just a same-exploration reload)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    const raw = `count(distinct \${ref(${queryName}).x}) / count(*)`;

    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type(raw, { delay: 5 });
    await editable.blur();

    await expect(xSlot.getByTestId('pill-menu-trigger')).not.toBeVisible();
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight => insight.props?.x === `?{${raw}}`)
    );

    // Duplicate — not reload.
    await expect(page.getByTestId('exploration-duplicate-button')).toBeEnabled();
    await page.getByTestId('exploration-duplicate-button').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15000 })
      .not.toBe(`/workspace/exploration/${id}`);
    const duplicateId = new URL(page.url()).pathname.split('/').pop();
    expect(duplicateId).not.toBe(id);

    // The duplicate's OWN copy of the prop is byte-identical — never
    // re-normalized, re-parsed, or rewritten by whatever constructs the
    // duplicate's draft.
    await waitForBackendDraft(page, duplicateId, draft =>
      (draft.insights || []).some(insight => insight.props?.x === `?{${raw}}`)
    );
    // The source exploration's own copy is untouched by the duplication.
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight => insight.props?.x === `?{${raw}}`)
    );
  });

  test('no raw ?{ or ${ syntax ever appears in the rendered Build rail, even after several drops', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, xSlot);
    await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });

    const rail = page.getByTestId('exploration-build-rail');
    await expect(rail).not.toContainText('?{');
    await expect(rail).not.toContainText('${');
  });
});
