/**
 * Story: Exploration Build rail (Explore 2.0 Phase 3b — VIS-1059, D8/D10).
 *
 * The RightRail `exploration` branch, rebuilt onto `TracePropsEditor`/
 * `FieldGroupList` (`InsightBuildSection`/`ChartBuildSection`/
 * `ExplorationBuildRail`, replacing `InsightCRUDSection`/`ChartCRUDSection`/
 * `ExplorerRightPanel`). Covers 03-delivery-plan.md's Phase 3b gate:
 *
 *   1. Rail CRUD — Add Insight stacks a new section; Chart always renders
 *      above the Insight sections.
 *   2. Type-switch cache — TracePropsEditor's own preserveTraceProps carries
 *      x/y across a scatter -> bar -> scatter round trip.
 *   3. Drop targets on TracePropsEditor fields render D8 typed ref pills —
 *      never raw `?{`/`${` syntax.
 *   4. Advisory red-ring on a bad in-draft ref is NON-BLOCKING (Save stays
 *      enabled; the draft keeps rendering).
 *   5. Slice affordance (SliceBadge/SliceMenu) is untouched by the rebuild.
 *
 * `pill-aggregation.spec.mjs` covers the D10 preset-toggle/MEDIAN-gating/
 * opaque-round-trip half of the grammar; this file is about the Build
 * rail's CRUD shell + DnD retrofit.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationBuildRail VISIVO_SANDBOX_BACKEND_PORT=8047 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3047 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3047 npx playwright test exploration-build-rail
 *
 * Mutates real backend exploration records — runs in the serial
 * `exploration-mutations` playwright project (playwright.config.mjs), not
 * `parallel`.
 */

import { test, expect } from '@playwright/test';

// Tall viewport (mirrors exploration-dnd-pull-in.spec.mjs's rationale): keeps
// every Build-rail drop target comfortably away from a scrollable edge for
// the whole drag gesture, avoiding dnd-kit auto-scroll drift.
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

/** Pick an option from the brand `<Select>` (react-select, not a native
 * `<select>` — canvas-metric-preview.spec.mjs's established pattern). */
async function pickSelectOption(page, testId, optionLabel) {
  const container = page.getByTestId(testId);
  await container.click();
  await container.getByRole('combobox').fill(optionLabel);
  const option = page
    .locator('.vis-select__option', { hasText: new RegExp(`^${optionLabel}$`, 'i') })
    .first();
  await option.waitFor({ timeout: 5000 });
  await option.click();
}

/** Manual mouse-driven drag, matching exploration-dnd-pull-in.spec.mjs. */
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

test.describe('Exploration Build rail (Explore 2.0 Phase 3b)', () => {
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

  test('Add Insight stacks a new section; Chart section always renders above the Insight sections', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const rail = page.getByTestId('exploration-build-rail');
    await expect(rail).toBeVisible({ timeout: 15000 });
    const before = await rail.locator('[data-testid^="insight-build-section-"]').count();

    await page.getByTestId('right-panel-add-insight').click();
    await expect(rail.locator('[data-testid^="insight-build-section-"]')).toHaveCount(
      before + 1,
      { timeout: 10000 }
    );

    const chartBox = await rail.getByTestId('chart-build-section').boundingBox();
    const firstInsightBox = await rail
      .locator('[data-testid^="insight-build-section-"]')
      .first()
      .boundingBox();
    expect(chartBox.y).toBeLessThan(firstInsightBox.y);
  });

  test('drop targets on TracePropsEditor fields render D8 typed pills — never raw ?{ syntax', async ({
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

    // Numeric source-schema column -> SUM pill by default (06 §3 v1 heuristic).
    await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
    await expect(xSlot).toContainText('SUM');
    await expect(xSlot).not.toContainText('?{');
    await expect(xSlot).not.toContainText('${');

    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(insight =>
        Object.values(insight.props || {}).includes(`?{sum(\${ref(${queryName}).${columnName}})}`)
      )
    );
  });

  test('type-switch cache: x/y props survive a scatter -> bar -> scatter round trip', async ({
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
    const xText = await xSlot.textContent();

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const typeSelectTestId = `insight-type-select-${insightName}`;
    await pickSelectOption(page, typeSelectTestId, 'Bar');
    await expect(page.getByTestId(typeSelectTestId)).toContainText('Bar', { timeout: 5000 });

    await pickSelectOption(page, typeSelectTestId, 'Scatter / Line');
    await expect(page.getByTestId(typeSelectTestId)).toContainText('Scatter', { timeout: 5000 });

    // The x slot's pill survives the round trip unchanged.
    await expect(xSlot).toHaveText(xText, { timeout: 10000 });
  });

  test('advisory ref-target validation is a non-blocking red hint — Save stays enabled, the draft keeps rendering', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });

    // The slot starts in STATIC mode (the schema's oneOf offers a plain
    // static fallback alongside the query-string form, and nothing has been
    // dropped/typed yet) — switch to query mode via the toggle so RefTextArea
    // mounts. Advisory validation (checkRefTargets) is LIVE off the store
    // value — no blur/commit step needed, and none is safe to wait on here:
    // `${ref(does_not_exist_anywhere).amount}` is syntactically a perfectly
    // well-formed single-ref (pillGrammar doesn't validate real EXISTENCE,
    // only shape), so the instant the full string lands, PropertyRow
    // recognizes it as a 'dimension' pill and swaps AWAY from RefTextArea —
    // the advisory error is what flags that the pill points nowhere. Typing
    // char-by-char and then trying to re-query the (by-then-unmounted)
    // RefTextArea node would be racy.
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await expect(editable).toBeFocused();
    await page.keyboard.type('${ref(does_not_exist_anywhere).amount}', { delay: 10 });

    // The advisory error renders (non-blocking red text below the field) —
    // whether the slot now displays as a recognized D8 pill (this body DOES
    // match the plain dimension shape) or stays RefTextArea is immaterial;
    // `error` renders in either branch (PropertyRow.jsx).
    await expect(page.getByTestId('property-error-x')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('property-error-x')).toContainText('does_not_exist_anywhere');

    // Save to Project stays enabled — the advisory never gates the draft.
    await expect(page.getByTestId('explorer-save-button')).toBeEnabled();
  });

  test('slice affordance (SliceBadge/SliceMenu) is untouched by the pill rebuild', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    // Switch to an indicator so `value` is a scalar-only slot (B13's
    // established fixture for this affordance, per
    // explorer-indicator-slice-authoring.spec.mjs).
    await pickSelectOption(page, `insight-type-select-${insightName}`, 'Indicator');

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const valueSlot = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, valueSlot);

    // A numeric column drops as a SUM pill (D10 default) — the scalar-only
    // slice-default banner still fires alongside the NEW pill widget,
    // proving SliceBadge/SliceMenu compose with PillMenu rather than being
    // replaced by it (05-e2e-ledger.md orchestrator resolution #2).
    await expect(page.getByTestId('slice-banner')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('slice-banner-first').click();
    const badge = page.getByTestId('slice-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText('First (0)');

    await badge.click();
    await expect(page.getByTestId('slice-menu')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('slice-option-range')).toBeDisabled();
    await expect(page.getByTestId('slice-option-all')).toBeDisabled();
  });

  // e2e-gap-review.md D4 [MEDIUM, Phase 3b delta]: toggling a PillMenu
  // preset on a slot that already carries an authored slice is untested —
  // `handleSelectPreset` -> `handleQueryChange` re-wraps the NEW aggregate
  // body with the CURRENT `slice` closure value (PropertyRow.jsx), so `[0]`
  // should survive an aggregate-function rewrite, but nothing asserts the
  // resulting persisted value, nor that SliceBadge still reads correctly
  // afterward. Extends the slice-on-drop test above with a SUM -> AVG
  // preset toggle on the SAME pill.
  test('toggling a preset (SUM -> AVG) on a slot with an authored slice preserves the slice, both in the persisted value and in SliceBadge', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(
      () => window.useStore.getState().explorerActiveModelName
    );

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    await pickSelectOption(page, `insight-type-select-${insightName}`, 'Indicator');

    const tableRow = await expandSourceTable(page);
    const { locator: column, name: columnName } = await firstNumericColumn(page, tableRow);
    const valueSlot = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, column, valueSlot);

    // The scalar-only slot auto-applies the default slice on drop (same
    // fixture as the test above).
    await expect(page.getByTestId('slice-banner')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('slice-banner-first').click();
    const badge = page.getByTestId('slice-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText('First (0)');

    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(
        insight => insight.props?.value === `?{sum(\${ref(${queryName}).${columnName}})}[0]`
      )
    );

    // Toggle the SAME pill's preset SUM -> AVG.
    await valueSlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('pill-menu-preset-avg').click();

    await expect(valueSlot).toContainText('AVG');
    await expect(valueSlot).not.toContainText('SUM');

    // The slice survives the aggregate-function rewrite in the persisted
    // value...
    await waitForBackendDraft(page, id, draft =>
      (draft.insights || []).some(
        insight => insight.props?.value === `?{avg(\${ref(${queryName}).${columnName}})}[0]`
      )
    );
    // ...and SliceBadge still reads correctly afterward — never reset/blanked
    // by the pill's own label/type change underneath it.
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('First (0)');
  });
});
