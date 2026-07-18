/**
 * Story: Exploration live draft preview (Explore 2.0 Phase 4 — S2's resolved
 * design, VIS-1026's ExplorerChartPreview half). Replaces the dead
 * `context_objects` compute (B6) `ExplorerChartPreview` used to build —
 * `useChartPreviewJob` never read it, so unsaved drafts showed NO live
 * preview at all. `useDraftInsightPreview` now debounce-compiles the draft
 * via `POST /api/insight-compile-draft/` and runs the result client-side
 * (DuckDB-WASM) against the SQL/results lane's already-loaded model rows.
 *
 *   1. A draft chart/insight renders LIVE (a real Plotly chart), before any
 *      Save to Project — proven via the synthetic `insightJobs['__draft__:…']`
 *      entry Chart.jsx reads (S2 Q1), not a screenshot/pixel comparison.
 *   2. Editing an interaction (filter) re-compiles and changes the rendered
 *      ROW DATA — asserted via the store's `insightJobs` entry directly
 *      (never a frontend string/SVG diff, `feedback_backend_diffing.md`'s
 *      spirit applied to preview state too). This is a STRONGER bar than the
 *      4 `explorer-interaction-*.spec.mjs` acceptance-bar files, which (per
 *      S2's research memo) never asserted a data change at all.
 *   3. A draft referencing a NOT-YET-PROMOTED input shows the explicit
 *      "input not yet promoted" state — never a silent drop (02 §6).
 *   4. A never-run scratch model's column ref shows the graceful "run the
 *      query first" state (S2's one known sub-gap), not a generic error.
 *   5. Promoting switches the chart to the real (main-run) data lane.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationPreview VISIVO_SANDBOX_BACKEND_PORT=8050 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3050 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3050 npx playwright test exploration-preview
 *
 * Mutates real backend records (explorations AND, for the promote-switches-
 * lanes test, a promoted insight/model/chart) — runs in the serial
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

/** Poll the store for the draft-namespaced synthetic insightJobs entry
 * (`useDraftInsightPreview`'s `draftInsightKey`) rather than trying to
 * observe the debounce timing directly. */
async function waitForDraftInsightData(page, insightName, timeout = 20000) {
  await expect(async () => {
    const data = await page.evaluate(name => {
      const jobs = window.useStore.getState().insightJobs;
      const entry = jobs[`__draft__:${name}`];
      return entry?.data ?? null;
    }, insightName);
    expect(data).not.toBeNull();
  }).toPass({ timeout });
  return page.evaluate(name => window.useStore.getState().insightJobs[`__draft__:${name}`].data, insightName);
}

test.describe('Exploration live draft preview (Explore 2.0 Phase 4 — S2)', () => {
  let idsBeforeTest = [];
  const createdObjects = [];

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
    for (const { segment, name } of createdObjects.splice(0)) {
      await page.request.delete(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`).catch(() => {});
    }
  });

  test('a draft chart renders LIVE before any save, via the synthetic draft-namespaced insightJobs entry', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, xSlot);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const data = await waitForDraftInsightData(page, insightName);
    expect(Array.isArray(data)).toBe(true);

    // The chart actually rendered, live — never saved yet.
    await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 15000 });
  });

  test('editing an interaction re-compiles and changes the previewed ROW DATA (stronger than the existing pill/widget-only interaction specs)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, xSlot);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const beforeData = await waitForDraftInsightData(page, insightName);

    // Add a filter interaction that excludes everything (x > 999999999) — an
    // unambiguous, dialect-agnostic way to force a DIFFERENT row count.
    await page.getByTestId(`insight-add-interaction-${insightName}`).click();
    const typeSelect = page.getByTestId('interaction-type-select-0');
    await typeSelect.click();
    await page.locator('.vis-select__option', { hasText: 'Filter' }).first().click();
    const valueField = page.getByTestId('interaction-value-field-0').locator('[data-testid="ref-textarea-editable"]');
    await valueField.click();
    await page.keyboard.type('1 = 0', { delay: 5 }); // always-false — empties the result
    await valueField.blur();

    await expect(async () => {
      const afterData = await page.evaluate(name => {
        const jobs = window.useStore.getState().insightJobs;
        return jobs[`__draft__:${name}`]?.data ?? null;
      }, insightName);
      expect(afterData).not.toBeNull();
      expect(afterData.length).not.toBe(beforeData.length);
      expect(afterData.length).toBe(0);
    }).toPass({ timeout: 20000 });
  });

  test('a draft referencing a not-yet-promoted input shows the explicit state — never a silent drop', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    // Type a ref to an input that has never been promoted anywhere — the
    // config-fallback path (usePreviewInputDependencies) picks this up from
    // the RAW props text regardless of whether it ever compiles.
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type('${ref(not_yet_promoted_input).value}', { delay: 5 });
    await editable.blur();
    void insightName;

    await expect(page.getByTestId('chart-preview-unresolved-inputs')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('chart-preview-unresolved-inputs')).toContainText(
      'not_yet_promoted_input'
    );
  });

  test('a never-run scratch model column ref shows the graceful "run the query first" state', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    // Deliberately DO NOT run the query — the model has no cached rows, so
    // the backend compile-draft endpoint has no schema to resolve `x`
    // against (S2's one known sub-gap).
    await typeSql(page, `SELECT * FROM ${TABLE}`);

    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type(`\${ref(${queryName}).x}`, { delay: 5 });
    await editable.blur();

    await expect(page.getByTestId('chart-preview-run-first')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('chart-preview-run-first')).toContainText(queryName);
    void id;
  });

  test('promoting switches the chart from the draft-namespaced key to the real (main-run) data lane', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await dragAndDrop(page, column, xSlot);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await waitForDraftInsightData(page, insightName);
    await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push({ segment: 'models', name: queryName }, { segment: 'insights', name: insightName });

    // The run-on-save pipeline eventually populates the REAL (un-namespaced)
    // insightJobs entry — the standard runDataVersion/useInsightsData pipeline
    // (02 §6) taking over automatically once the object is published.
    await expect(async () => {
      const realEntry = await page.evaluate(
        name => window.useStore.getState().insightJobs[name],
        insightName
      );
      expect(realEntry?.data).toBeTruthy();
    }).toPass({ timeout: 30000 });
  });
});
