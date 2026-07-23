/**
 * Story: Save as metric (Explore 2.0 Phase 4 — 06-pill-aggregation-grammar.md
 * §4/§8). `pill-aggregation.spec.mjs` covers the Phase 3b preset-toggle half
 * of the grammar (dimension ↔ SUM/AVG/…); this file covers the Phase 4
 * DURABLE half — promoting an aggregate pill to a named, project-global
 * Metric:
 *
 *   1. The flow: an aggregate pill's "Save as metric…" opens a name prompt
 *      pre-filled with `<query>_<col>_<agg>` (06 §4); submitting creates a
 *      REAL Metric — born BOUND to its parent model (closes B12 for this
 *      flow) — and the slot swaps to a `[Σ name]` metric-ref pill, asserted
 *      through the backend `/api/metrics/` endpoint.
 *   2. Name collision hard-blocks with an inline error (metric names are
 *      project-global) — the prompt stays open, editable, no duplicate is
 *      ever created.
 *   3. Match-and-replace dedup (06 §8, Lightdash-adopted): another slot with
 *      the IDENTICAL expression gets an explicit, one-click swap OFFER —
 *      never applied silently. Declining leaves it untouched; accepting
 *      swaps it too.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=saveAsMetric VISIVO_SANDBOX_BACKEND_PORT=8051 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3051 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3051 npx playwright test save-as-metric
 *
 * Mutates real backend records (explorations AND promoted metrics) — runs in
 * the serial `exploration-mutations` playwright project (playwright.config.mjs).
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';

test.use({ viewport: { width: 1280, height: 1600 } });

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

  const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
  // Conditional, not unconditional: the dedup tests call this a SECOND time
  // within the SAME exploration (a fresh drag for the sibling insight's y
  // slot) — the source row is already expanded from the first call, and an
  // unconditional click would COLLAPSE it instead, hiding `tableRow` and
  // hanging the next locator. Root-caused via live reproduction against the
  // sandbox (integration-gate fix cycle). Mirrors the `sourceBody` check
  // just above.
  if (!(await tableRow.isVisible().catch(() => false))) {
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
  }
  await expect(tableRow).toBeVisible({ timeout: 15000 });
  return tableRow;
}

async function firstNumericColumn(page, tableRow) {
  const col = page.locator('[data-testid^="library-source-column-"]').first();
  // Same conditional-toggle reasoning as `expandSourceTable` above: a second
  // call within the same test would otherwise collapse the already-expanded
  // column list.
  if (!(await col.isVisible().catch(() => false))) {
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
  }
  await expect(col).toBeVisible({ timeout: 10000 });
  const name = await col
    .getAttribute('data-testid')
    .then(t => t.replace(`library-source-column-${SOURCE}-${TABLE}-`, ''));
  return { locator: col, name };
}

/** Drop a numeric column onto `slotTestIdFragment` (e.g. "x" or "y"),
 * landing a default SUM pill (06 §3 v1 heuristic). */
async function bindSlotToNumericColumn(page, slotTestIdFragment) {
  const tableRow = await expandSourceTable(page);
  const { locator: column, name: columnName } = await firstNumericColumn(page, tableRow);
  const slot = page.locator(`[data-testid*="droppable-property-${slotTestIdFragment}"]`).first();
  await expect(slot).toBeVisible({ timeout: 15000 });
  await dragAndDrop(page, column, slot);
  await expect(slot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
  return { slot, columnName };
}

/** Read a draft insight's raw prop value straight from the store. Used for
 * the dedup-offer assertions instead of the DOM: `ExplorationBuildRail`
 * only ever expands ONE insight section at a time
 * (`isExpanded={name === activeInsightName}`), so by the time the offer
 * banner (rendered inside the PROMOTING insight's OWN section, since
 * `handleSubmitSaveAsMetric`/`dedupOffers` are `InsightBuildSection`-local
 * state) is interactable, the SIBLING insight whose slot the offer targets
 * is necessarily collapsed and its DOM content unobservable. Root-caused via
 * live reproduction against the sandbox (integration-gate fix cycle). A
 * store-state read is a strictly more direct check anyway — it verifies the
 * actual data, not a rendering side effect of which accordion panel happens
 * to be open. */
async function readInsightProp(page, insightName, propKey) {
  return page.evaluate(
    ({ insightName, propKey }) =>
      window.useStore.getState().explorerInsightStates[insightName]?.props?.[propKey],
    { insightName, propKey }
  );
}

async function waitForMetricPublished(page, name, timeout = 20000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/metrics/${encodeURIComponent(name)}/`);
    expect(res.ok()).toBe(true);
  }).toPass({ timeout });
}

async function fetchMetric(page, name) {
  const res = await page.request.get(`${apiBase}/api/metrics/${encodeURIComponent(name)}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe('Save as metric (Explore 2.0 Phase 4 — 06 §4/§8)', () => {
  let idsBeforeTest = [];
  const createdMetrics = [];

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
    for (const name of createdMetrics.splice(0)) {
      await page.request.delete(`${apiBase}/api/metrics/${encodeURIComponent(name)}/`).catch(() => {});
    }
  });

  test('the flow: name prompt pre-filled, submit creates a real, born-bound Metric, and the slot swaps to a metric-ref pill', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    const { slot: xSlot, columnName } = await bindSlotToNumericColumn(page, 'x');
    await expect(xSlot).toContainText('SUM');

    await xSlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('pill-menu-save-as-metric')).toBeEnabled();
    await page.getByTestId('pill-menu-save-as-metric').click();

    await expect(page.getByTestId('save-as-metric-prompt')).toBeVisible({ timeout: 5000 });
    const suggestedName = `${queryName}_${columnName}_sum`;
    await expect(page.getByTestId('save-as-metric-name-input')).toHaveValue(suggestedName);

    await page.getByTestId('save-as-metric-submit').click();
    await expect(page.getByTestId('save-as-metric-prompt')).not.toBeVisible({ timeout: 15000 });
    createdMetrics.push(suggestedName);

    // Born bound to its parent model (closes B12 for this flow).
    await waitForMetricPublished(page, suggestedName);
    const metric = await fetchMetric(page, suggestedName);
    expect(metric.config?.parentModel ?? metric.parentModel).toContain(queryName);
    expect((metric.config?.expression || '').toLowerCase()).toContain('sum');

    // Slot swap: the pill now reads the metric name, not "SUM".
    await expect(xSlot).toContainText(suggestedName);
    await expect(xSlot).not.toContainText('?{');
  });

  test('a name collision hard-blocks with an inline error — the prompt stays open and editable, never a duplicate', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const { slot: xSlot } = await bindSlotToNumericColumn(page, 'x');
    await xSlot.getByTestId('pill-menu-trigger').click();
    await page.getByTestId('pill-menu-save-as-metric').click();

    const collisionName = `e2e_saveasmetric_collision_${Date.now()}`;
    // Pre-create a metric under that name directly via the API so the
    // collision is deterministic, independent of the suggested-name logic.
    await page.request.post(`${apiBase}/api/metrics/${encodeURIComponent(collisionName)}/`, {
      data: { expression: 'COUNT(*)' },
    });
    createdMetrics.push(collisionName);
    // The collision check (`saveAsMetricFlow.js`) reads the frontend's OWN
    // cached `state.metrics`, which a raw `page.request.post` never
    // refreshes — without this, the client-side check sees a stale list,
    // misses the collision, and falls through to the backend's plain
    // upsert-by-name save, which just overwrites the pre-created metric
    // instead of failing — no error ever renders. Root-caused via live
    // reproduction against the sandbox (integration-gate fix cycle).
    await page.evaluate(() => window.useStore.getState().fetchMetrics());

    const nameInput = page.getByTestId('save-as-metric-name-input');
    await nameInput.fill(collisionName);
    await page.getByTestId('save-as-metric-submit').click();

    await expect(page.getByTestId('save-as-metric-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('save-as-metric-error')).toContainText('already exists');
    // Still open, still editable — the flow isn't lost.
    await expect(page.getByTestId('save-as-metric-prompt')).toBeVisible();
    await expect(nameInput).toBeEnabled();

    // Rename and retry succeeds.
    const retryName = `${collisionName}_retry`;
    await nameInput.fill(retryName);
    await page.getByTestId('save-as-metric-submit').click();
    await expect(page.getByTestId('save-as-metric-prompt')).not.toBeVisible({ timeout: 15000 });
    createdMetrics.push(retryName);
    await waitForMetricPublished(page, retryName);
  });

  test('match-and-replace dedup: a sibling slot with the IDENTICAL expression gets an explicit swap OFFER, never a silent apply', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    // Two insights, both aggregating the SAME column with the SAME preset.
    const { slot: xSlot, columnName } = await bindSlotToNumericColumn(page, 'x');
    const firstInsightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await page.getByTestId('right-panel-add-insight').click();
    // Phase 6c-T5 (ux-audit.md "'+ Add Insight' creates a blank insight instead
    // of letting you pick an existing one"): the button now opens a picker
    // (existing insights + "New blank insight"); these specs want the OLD
    // "always create a fresh blank insight" behavior, so drive the new
    // secondary action explicitly.
    await page.getByTestId('add-insight-menu-create-new').click();
    const insightNames = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames
    );
    const secondInsightName = insightNames[insightNames.length - 1];
    // No toggle click needed: `createInsight` (explorerStore.js) sets the
    // new insight as the ACTIVE one, and `ExplorationBuildRail` expands a
    // section iff `name === activeInsightName` — it's already open.
    // Root-caused via live reproduction against the sandbox (integration-
    // gate fix cycle): clicking `insight-toggle-${secondInsightName}`
    // COLLAPSED the already-open section instead of opening it.
    const secondYSlot = page
      .locator(
        `[data-testid="insight-build-section-${secondInsightName}"] [data-testid*="droppable-property-y"]`
      )
      .first();
    const tableRow = await expandSourceTable(page);
    const { locator: sameColumn } = await firstNumericColumn(page, tableRow);
    await dragAndDrop(page, sameColumn, secondYSlot);
    await expect(secondYSlot).toContainText('SUM');

    // Adding the second insight made IT active, which collapsed the first
    // insight's section (`isExpanded={name === activeInsightName}` in
    // ExplorationBuildRail.jsx) — `xSlot`'s `pill-menu-trigger` is inside
    // that now-hidden section (`{isExpanded && (...)}` in
    // InsightBuildSection.jsx) and never becomes visible without
    // re-expanding it first. Root-caused via live reproduction against the
    // sandbox (integration-gate fix cycle).
    await page.getByTestId(`insight-toggle-${firstInsightName}`).click();

    // Save the FIRST slot as a metric.
    await xSlot.getByTestId('pill-menu-trigger').click();
    await page.getByTestId('pill-menu-save-as-metric').click();
    const metricName = `e2e_dedup_${columnName}_${Date.now()}`;
    await page.getByTestId('save-as-metric-name-input').fill(metricName);
    await page.getByTestId('save-as-metric-submit').click();
    await expect(page.getByTestId('save-as-metric-prompt')).not.toBeVisible({ timeout: 15000 });
    createdMetrics.push(metricName);
    await waitForMetricPublished(page, metricName);

    // The SECOND (matching) slot gets an explicit offer — never silently swapped.
    await expect(page.getByTestId('field-swap-offer-banner')).toBeVisible({ timeout: 15000 });
    const offer = page.getByTestId(`field-swap-offer-${metricName}`);
    await expect(offer).toBeVisible();
    // Untouched until the user acts — the second insight's section is
    // collapsed right now (see `readInsightProp`'s docstring), so check the
    // store directly rather than the DOM.
    expect(await readInsightProp(page, secondInsightName, 'y')).toContain('sum(');

    await offer.getByTestId(`field-swap-offer-${metricName}-apply`).click();
    await expect
      .poll(async () => readInsightProp(page, secondInsightName, 'y'), { timeout: 10000 })
      .toContain(metricName);
    await expect(page.getByTestId('field-swap-offer-banner')).not.toBeVisible();

    // Confirm the swap ALSO reflects in the DOM once its section is visible.
    await page.getByTestId(`insight-toggle-${secondInsightName}`).click();
    await expect(secondYSlot).toContainText(metricName);
  });

  test('declining a dedup offer leaves the sibling slot untouched', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const { slot: xSlot, columnName } = await bindSlotToNumericColumn(page, 'x');
    const firstInsightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await page.getByTestId('right-panel-add-insight').click();
    // Phase 6c-T5 (ux-audit.md "'+ Add Insight' creates a blank insight instead
    // of letting you pick an existing one"): the button now opens a picker
    // (existing insights + "New blank insight"); these specs want the OLD
    // "always create a fresh blank insight" behavior, so drive the new
    // secondary action explicitly.
    await page.getByTestId('add-insight-menu-create-new').click();
    const insightNames = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames
    );
    const secondInsightName = insightNames[insightNames.length - 1];
    // No toggle click needed: `createInsight` (explorerStore.js) sets the
    // new insight as the ACTIVE one, and `ExplorationBuildRail` expands a
    // section iff `name === activeInsightName` — it's already open.
    // Root-caused via live reproduction against the sandbox (integration-
    // gate fix cycle): clicking `insight-toggle-${secondInsightName}`
    // COLLAPSED the already-open section instead of opening it.
    const secondYSlot = page
      .locator(
        `[data-testid="insight-build-section-${secondInsightName}"] [data-testid*="droppable-property-y"]`
      )
      .first();
    const tableRow = await expandSourceTable(page);
    const { locator: sameColumn } = await firstNumericColumn(page, tableRow);
    await dragAndDrop(page, sameColumn, secondYSlot);

    // Re-expand the first insight's section — see the sibling dedup test
    // above for why adding the second insight collapsed it.
    await page.getByTestId(`insight-toggle-${firstInsightName}`).click();
    await xSlot.getByTestId('pill-menu-trigger').click();
    await page.getByTestId('pill-menu-save-as-metric').click();
    const metricName = `e2e_dedup_decline_${columnName}_${Date.now()}`;
    await page.getByTestId('save-as-metric-name-input').fill(metricName);
    await page.getByTestId('save-as-metric-submit').click();
    await expect(page.getByTestId('save-as-metric-prompt')).not.toBeVisible({ timeout: 15000 });
    createdMetrics.push(metricName);

    const offer = page.getByTestId(`field-swap-offer-${metricName}`);
    await expect(offer).toBeVisible({ timeout: 15000 });
    await offer.getByTestId(`field-swap-offer-${metricName}-dismiss`).click();

    await expect(page.getByTestId('field-swap-offer-banner')).not.toBeVisible();
    // The second insight's section is collapsed right now (see
    // `readInsightProp`'s docstring) — check the store directly, then
    // confirm the DOM agrees once its section is visible.
    const yProp = await readInsightProp(page, secondInsightName, 'y');
    expect(yProp).toContain('sum(');
    expect(yProp).not.toContain(metricName);
    await page.getByTestId(`insight-toggle-${secondInsightName}`).click();
    await expect(secondYSlot).toContainText('SUM');
    await expect(secondYSlot).not.toContainText(metricName);
  });

  test('"Save as metric…" stays disabled for a dimension (non-aggregate) pill', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await dragAndDrop(page, column, xSlot);
    await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });

    // Toggle to plain Dimension (no aggregation).
    await xSlot.getByTestId('pill-menu-trigger').click();
    await page.getByTestId('pill-menu-preset-dimension').click();

    await xSlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu-save-as-metric')).toBeDisabled();
  });
});
