/**
 * Story: The "Explore this" flywheel loop (Explore 2.0 Phase 5 — VIS-1067
 * context-menu entry points + VIS-1069 Semantic Layer reciprocals,
 * 01-ux-spec.md §5, 02-architecture.md).
 *
 * Closes the full round trip in one flow:
 *
 *   1. "Explore this" from a real MODEL's Library row context menu mints a
 *      NEW exploration pre-wired with a query against that model
 *      (`seeded_from: {type:'model', name}`, `buildExplorationSeedState`).
 *   2. A computed column marked as a metric, promoted via "Save to Project",
 *      publishes a real Metric — the promote success state offers
 *      "View in Semantic Layer".
 *   3. Accepting sets the one-shot `workspaceSemanticLayerFocusIntent`,
 *      navigates to the Semantic Layer, and the ERD consumes (self-clears)
 *      the intent to focus the metric's parent model node.
 *   4. Clicking the metric's own field pill on the ERD ("Explore this" back-
 *      link) mints YET ANOTHER exploration, seeded from that metric.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=exploreThisFlywheel VISIVO_SANDBOX_BACKEND_PORT=8052 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3052 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3052 npx playwright test explore-this-flywheel
 *
 * Mutates real backend records (explorations, models, metrics) — runs in the
 * serial `exploration-mutations` playwright project (playwright.config.mjs),
 * never `parallel`.
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

const TABLE = 'test_table';

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

async function waitForObjectPublished(page, segment, name, timeout = 20000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`);
    expect(res.ok()).toBe(true);
  }).toPass({ timeout });
}

async function fetchExploration(page, id) {
  const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe('The "Explore this" flywheel loop (Explore 2.0 Phase 5)', () => {
  test.describe.configure({ timeout: 90000 });

  let idsBeforeTest = [];
  const createdObjects = []; // {segment, name} — best-effort cleanup

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

  test('seed from model → promote a metric → View in Semantic Layer focuses the node → Explore this from the ERD back', async ({
    page,
  }) => {
    // --- Step 0: publish a real MODEL to seed from (via the normal promote
    // path — the same one exploration-promote.spec.mjs already proves works).
    await gotoExplorerHome(page);
    await newExploration(page);
    const defaultQueryName = await page.evaluate(
      () => window.useStore.getState().explorerActiveModelName
    );
    const modelName = `e2e_flywheel_model_${Date.now()}`;
    await page.evaluate(
      ({ defaultQueryName, modelName }) =>
        window.useStore.getState().renameModelTab(defaultQueryName, modelName),
      { defaultQueryName, modelName }
    );
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`promote-row-model-${modelName}-checkbox`)).toBeChecked();
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push({ segment: 'models', name: modelName });
    await waitForObjectPublished(page, 'models', modelName);

    // --- Step 1: "Explore this" from the model's Library row. ---
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.useStore.getState().fetchModels?.());

    const modelHeader = page.getByTestId('library-subsection-model-header');
    const modelBody = page.getByTestId('library-subsection-model-body');
    if (!(await modelBody.isVisible().catch(() => false))) await modelHeader.click();
    const modelRow = page.getByTestId(`library-row-model-${modelName}`);
    await expect(modelRow).toBeVisible({ timeout: 15000 });
    await modelRow.click({ button: 'right' });
    const modelCtxMenu = page.getByTestId(`library-row-model-${modelName}-context-menu`);
    await expect(modelCtxMenu).toBeVisible({ timeout: 5000 });
    await modelCtxMenu.getByText('Explore this').click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationId2 = new URL(page.url()).pathname.split('/').pop();

    // Seed provenance + the pre-wired query. `buildExplorationSeedState`'s
    // "model" branch reuses the model's OWN literal SQL (never a
    // `${ref(model)}` context-string expression) — the scratch SQL editor's
    // execution pipeline (`useModelQueryJob` -> `/api/model-query-jobs/`)
    // sends the query text VERBATIM to the source with zero ref-resolution,
    // so an unresolved `${ref(...)}` reaches DuckDB and fails to parse.
    // Root-caused via live reproduction against the sandbox (integration-
    // gate fix cycle): the model's own SQL (`SELECT * FROM ${TABLE}`) is
    // exactly what the model was published with in Step 0 above, so
    // asserting it contains the real table name proves the seed is both
    // genuinely runnable AND tied to this model — `seeded_from` is the
    // provenance record, not the query text.
    await expect(async () => {
      const exploration = await fetchExploration(page, explorationId2);
      // 6c-T1 added `content_signature` to SeedRef (staleness drift detection),
      // so the shape is no longer exactly these two keys — assert the
      // identity fields exactly AND that the signature was captured.
      expect(exploration.seeded_from).toMatchObject({ type: 'model', name: modelName });
      expect(typeof exploration.seeded_from.content_signature).toBe('string');
      expect(exploration.seeded_from.content_signature.length).toBeGreaterThan(0);
      expect((exploration.draft.queries || [])[0]?.sql || '').toContain(TABLE);
    }).toPass({ timeout: 15000 });

    // --- Step 2: run the seeded query, add a computed METRIC column, promote it. ---
    await runQuery(page);
    const firstColumn = page.locator('[data-testid^="draggable-col-"]').first();
    await expect(firstColumn).toBeVisible({ timeout: 15000 });
    const colName = await firstColumn
      .getAttribute('data-testid')
      .then(t => t.replace('draggable-col-', ''));

    await page.getByTestId('add-computed-column-btn').click();
    const metricName = `e2e_flywheel_metric_${Date.now()}`;
    await page.getByTestId('computed-col-name').fill(metricName);
    await page.getByTestId('computed-col-expression').fill(`SUM(${colName})`);
    await expect(page.getByTestId('detected-type-badge')).toContainText('Metric', { timeout: 10000 });
    await page.getByTestId('add-btn').click();

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`promote-row-metric-${metricName}-checkbox`)).toBeChecked({
      timeout: 10000,
    });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: 'query_1' }, // the seeded scratch query itself also promotes
      { segment: 'metrics', name: metricName }
    );
    await waitForObjectPublished(page, 'metrics', metricName);

    // --- Step 3: "View in Semantic Layer" offer appears; accepting focuses the node. ---
    const semanticLayerOffer = page.getByTestId('exploration-promote-semantic-layer-offer');
    await expect(semanticLayerOffer).toBeVisible({ timeout: 10000 });
    await expect(semanticLayerOffer).toContainText(metricName);
    await page.getByTestId('exploration-promote-view-in-semantic-layer').click();

    await expect(page.getByTestId('semantic-layer-erd')).toBeVisible({ timeout: 20000 });
    const metricPill = page.getByTestId(`erd-metric-pill-${metricName}`);
    await expect(metricPill).toBeVisible({ timeout: 15000 });
    // The one-shot focus intent self-clears once the ERD consumes it.
    await expect(async () => {
      const intent = await page.evaluate(
        () => window.useStore.getState().workspaceSemanticLayerFocusIntent
      );
      expect(intent).toBeNull();
    }).toPass({ timeout: 10000 });

    // --- Step 4: "Explore this" back-link from the ERD pill closes the loop. ---
    await metricPill.click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationId3 = new URL(page.url()).pathname.split('/').pop();

    await expect(async () => {
      const exploration = await fetchExploration(page, explorationId3);
      // 6c-T1 added `content_signature` to SeedRef (staleness drift detection),
      // so the shape is no longer exactly these two keys — assert the
      // identity fields exactly AND that the signature was captured.
      expect(exploration.seeded_from).toMatchObject({ type: 'metric', name: metricName });
      // 6c-T1's drift detection deliberately does NOT hash metric/dimension
      // seeds (explorationStaleness.js's SIGNATURE_TYPES): a metric has no
      // standalone content — it lives inside its model's config — so its
      // signature is null BY DESIGN rather than guessed at. Asserted so the
      // contract is documented, not silently assumed.
      expect(exploration.seeded_from.content_signature).toBeNull();
    }).toPass({ timeout: 15000 });

    // The two round-trip explorations are genuinely distinct records.
    expect(explorationId3).not.toBe(explorationId2);
  });
});
