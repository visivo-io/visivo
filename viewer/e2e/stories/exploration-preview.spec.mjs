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

/** `CenterPanel` is responsive: above its internal 600px width threshold
 * (`NARROW_THRESHOLD` in CenterPanel.jsx) the SQL editor and the live chart
 * preview render side-by-side (`isWide`); below it, a SQL/Chart tab toggle
 * shows only one at a time, defaulting to SQL. At this spec's 1280px
 * viewport, the Library rail + ExplorationBuildRail's combined width push
 * CenterPanel itself under that threshold, so `ExplorerChartPreview` (which
 * hosts `useDraftInsightPreview` — the hook this whole file exercises) never
 * mounts unless the "Chart" tab is explicitly selected. Root-caused via live
 * reproduction against the sandbox (integration-gate fix cycle): the debounced
 * compile-draft call never fires at all with zero network requests and zero
 * console errors, because the component tree that owns it is simply absent
 * from the DOM — not a bug in the draft-preview feature itself, confirmed
 * working end-to-end once this tab is selected. Only a `[data-testid="toggle-
 * chart"]` button exists in narrow mode — a no-op call in wide mode. */
async function ensureChartTabVisible(page) {
  const toggle = page.getByTestId('toggle-chart');
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
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
    await ensureChartTabVisible(page);

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
    await ensureChartTabVisible(page);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    await waitForDraftInsightData(page, insightName);
    // The x pill is a bare `sum(...)` with no GROUP BY, so the compiled
    // query is a scalar aggregate — it ALWAYS returns exactly one row (SQL
    // semantics: SUM over zero matching rows is a row containing NULL, not
    // zero rows). Assert on the aggregated CELL VALUE changing, not the row
    // count — row count is invariant here by construction. Root-caused via
    // live reproduction against the sandbox (integration-gate fix cycle):
    // the original row-count-drops-to-0 assertion was SQL-semantically
    // wrong for a no-GROUP-BY aggregate, not a bug in the preview pipeline.
    const beforeEntry = await page.evaluate(name => {
      const jobs = window.useStore.getState().insightJobs;
      return jobs[`__draft__:${name}`] ?? null;
    }, insightName);
    const valueKey = beforeEntry.props_mapping['props.x'];
    const beforeValue = beforeEntry.data[0]?.[valueKey];
    expect(beforeValue == null).toBe(false); // sum of real rows — not NULL

    // Add a filter interaction that excludes everything (x > 999999999) — an
    // unambiguous, dialect-agnostic way to force the aggregate to run over
    // zero matching rows.
    await page.getByTestId(`insight-add-interaction-${insightName}`).click();
    const typeSelect = page.getByTestId('interaction-type-select-0');
    await typeSelect.click();
    await page.locator('.vis-select__option', { hasText: 'Filter' }).first().click();
    const valueField = page.getByTestId('interaction-value-field-0').locator('[data-testid="ref-textarea-editable"]');
    await valueField.click();
    await page.keyboard.type('1 = 0', { delay: 5 }); // always-false — empties the aggregated set
    await valueField.blur();

    await expect(async () => {
      const afterEntry = await page.evaluate(name => {
        const jobs = window.useStore.getState().insightJobs;
        return jobs[`__draft__:${name}`] ?? null;
      }, insightName);
      expect(afterEntry).not.toBeNull();
      expect(afterEntry.data.length).toBe(1); // still one row — a scalar aggregate
      const afterValue = afterEntry.data[0]?.[valueKey];
      expect(afterValue == null).toBe(true); // SUM over zero matching rows is NULL
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
    //
    // No blur/commit step afterward, and none is safe to wait on: the typed
    // string is a syntactically well-formed single ref, so the instant it
    // completes, PropertyRow's live `pillGrammar.parse` recognizes it and
    // swaps `RefTextArea` for a `<FieldPill>` (PropertyRow.jsx's `showPill`)
    // — mid-keystroke, well before any explicit blur. `onChange` already
    // fires per-keystroke (`RefTextArea.handleInput` -> `serializeAndUpdate`),
    // so the value is live off the store already. Calling `.blur()` on the
    // by-then-unmounted `ref-textarea-editable` node hangs for the full test
    // timeout waiting for a locator that never resolves again — root-caused
    // via live reproduction against the sandbox (integration-gate fix cycle);
    // same race `exploration-build-rail.spec.mjs`'s dangling-ref advisory
    // test already documents and avoids the same way.
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type('${ref(not_yet_promoted_input).value}', { delay: 5 });
    void insightName;
    await ensureChartTabVisible(page);

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
    const defaultQueryName = await page.evaluate(
      () => window.useStore.getState().explorerActiveModelName
    );
    // Rename off the default "model" name to one that's globally UNIQUE to
    // this test run. `Model.name_hash()` (named_model.py) hashes the NAME
    // ALONE, never the SQL — every fresh exploration's first query defaults
    // to "model", so the backend's schema.json cache (written whenever ANY
    // exploration's "model" has ever actually been run, by this test file's
    // OWN earlier tests or any other spec entirely) is keyed on a name every
    // other test shares. Staying on the shared default name made this test
    // flake exactly when run after (elsewhere-run) `SELECT * FROM
    // test_table` queries had already cached a schema for "model" — the
    // compile-draft endpoint found a schema and proceeded, and the client
    // then hit a real DuckDB catalog error instead of the graceful 422.
    // Root-caused via live reproduction against the sandbox (integration-
    // gate fix cycle).
    const queryName = `e2e_never_run_${Date.now()}`;
    await page.evaluate(
      ({ defaultQueryName, queryName }) =>
        window.useStore.getState().renameModelTab(defaultQueryName, queryName),
      { defaultQueryName, queryName }
    );

    // Deliberately DO NOT run the query — the model has no cached rows, so
    // the backend compile-draft endpoint has no schema to resolve `x`
    // against (S2's one known sub-gap).
    await typeSql(page, `SELECT * FROM ${TABLE}`);

    // No blur/commit step afterward — see the sibling "not-yet-promoted
    // input" test above for why that races the pill swap and hangs.
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await xSlot.getByRole('button', { name: 'query string' }).click();
    const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type(`\${ref(${queryName}).x}`, { delay: 5 });
    await ensureChartTabVisible(page);

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
    await ensureChartTabVisible(page);

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
    // insightJobs entry. Root-caused via a live trace (integration-gate fix
    // cycle): this used to hang forever — the "standard runDataVersion/
    // useInsightsData pipeline" this comment originally assumed exists is
    // only wired up on Home.jsx's Dashboard surface (`runDataVersion` is
    // bumped by `useRunPolling`, mounted there and nowhere else); nothing on
    // the Explorer route ever called `useInsightsData` for a freshly-
    // promoted insight, so `insightJobs[name]` never populated no matter how
    // long a caller waited, even though the backend's own run genuinely
    // succeeded in well under a second. Fixed at the source:
    // `ExplorerChartPreview.jsx` now polls for it directly once an insight
    // is promoted (present in `state.insights`) — see its docstring.
    await expect(async () => {
      const realEntry = await page.evaluate(
        name => window.useStore.getState().insightJobs[name],
        insightName
      );
      expect(realEntry?.data).toBeTruthy();
    }).toPass({ timeout: 20000 });
  });

  // Explore 2.0 Phase 5 preview-lane fixes (VIS-1091–1095, absorbed from the
  // Phase 4 delta review) ---------------------------------------------------

  test('VIS-1091: a same-named real insight promoted by a DIFFERENT exploration is never treated as promoted by THIS one', async ({
    page,
  }) => {
    // Exploration A: bind + promote its (default-auto-named) first insight.
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);
    const tableRowA = await expandSourceTable(page);
    const { locator: columnA } = await firstNumericColumn(page, tableRowA);
    const xSlotA = page.locator('[data-testid*="droppable-property-x"]').first();
    await dragAndDrop(page, columnA, xSlotA);
    const insightNameA = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const queryNameA = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: queryNameA },
      { segment: 'insights', name: insightNameA }
    );

    // Exploration B: a FRESH, UNRELATED exploration. `generateUniqueName`
    // scopes auto-naming to each exploration's OWN state, so B's first
    // insight is very likely named identically to A's — assert the
    // collision precondition explicitly rather than assuming it.
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);
    const tableRowB = await expandSourceTable(page);
    const { locator: columnB } = await firstNumericColumn(page, tableRowB);
    const xSlotB = page.locator('[data-testid*="droppable-property-x"]').first();
    await dragAndDrop(page, columnB, xSlotB);
    const insightNameB = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    expect(insightNameB).toBe(insightNameA);

    // The SAME browser session/store still holds A's REAL data under
    // `insightJobs[insightNameA]` (nothing clears it on tab switch) — this
    // is exactly the precondition the bug needed. B must resolve its OWN
    // lane regardless: replicate ExplorerChartPreview.jsx's exact
    // exploration-scoped predicate against the live store.
    await expect(async () => {
      const treatedAsPromoted = await page.evaluate(name => {
        const state = window.useStore.getState();
        const activeId =
          state.workspaceActiveObject?.type === 'exploration'
            ? state.workspaceActiveObject.name
            : null;
        const promoted = state.workspaceExplorations?.byId?.[activeId]?.promoted || [];
        const isRealInsight = (state.insights || []).some(i => i.name === name);
        const isPromotedByThisExploration = promoted.some(
          p => p.type === 'insight' && p.name === name
        );
        return isRealInsight && isPromotedByThisExploration;
      }, insightNameB);
      expect(treatedAsPromoted).toBe(false);
    }).toPass({ timeout: 10000 });

    // B's own draft still renders live, on its own draft-namespaced lane.
    await ensureChartTabVisible(page);
    const data = await waitForDraftInsightData(page, insightNameB);
    expect(Array.isArray(data)).toBe(true);
  });

  test('VIS-1092: an already-promoted insight is never blanked by a sibling DRAFT insight erroring', async ({
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
    await ensureChartTabVisible(page);

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
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName }
    );
    await page.getByTestId('exploration-promote-cancel').click();

    // Wait for the promoted insight's REAL data (the poll bridge) so the
    // chart is genuinely in the "already rendering, promoted" state before
    // introducing the erroring sibling.
    await expect(async () => {
      const real = await page.evaluate(
        name => window.useStore.getState().insightJobs[name],
        insightName
      );
      expect(real?.data).toBeTruthy();
    }).toPass({ timeout: 20000 });
    await expect(page.getByTestId('chart-preview')).toBeVisible({ timeout: 15000 });

    // Add a SECOND insight with a permanently dangling ref — its compile
    // pass will keep erroring.
    await page.getByTestId('right-panel-add-insight').click();
    const insightNames = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames
    );
    const badInsightName = insightNames[insightNames.length - 1];
    const ySlot = page
      .locator(
        `[data-testid="insight-build-section-${badInsightName}"] [data-testid*="droppable-property-y"]`
      )
      .first();
    await ySlot.getByRole('button', { name: 'query string' }).click();
    const editable = ySlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type('${ref(totally_made_up_model_xyz).amount}', { delay: 5 });
    // No blur/commit — see the sibling "not-yet-promoted input" test above
    // for why that races the pill swap and hangs.

    // The bad insight's compile pass fails after the debounce — give it
    // room to settle, then assert the ALREADY-GOOD chart is untouched: never
    // regressed to the whole-chart error/loading screens.
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('chart-preview')).toBeVisible();
    await expect(page.getByTestId('chart-preview-error')).not.toBeVisible();
    await expect(page.getByTestId('chart-preview-loading')).not.toBeVisible();
  });

  test('VIS-1093: the promoted-poll bridge has a bounded lifetime — it surfaces a failure banner instead of spinning forever', async ({
    page,
  }) => {
    test.setTimeout(75000);
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await dragAndDrop(page, column, xSlot);
    await ensureChartTabVisible(page);

    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await waitForDraftInsightData(page, insightName);

    // The promoted-poll bridge's own data-fetch (`/api/insight-jobs/`) must
    // never succeed for the rest of this test. Root-caused via live
    // reproduction against the sandbox (integration-gate fix cycle): the
    // ORIGINAL approach here — promote, then immediately DELETE the
    // promoted Insight object — does NOT reliably reproduce "data can never
    // land". The run-on-save pipeline promote triggers already finishes and
    // writes real output files (per `ExplorerChartPreview.jsx`'s own
    // docstring, "typically finishes in well under a second") well before
    // even a single network round-trip to delete the object can land; a
    // live trace showed the REAL (un-namespaced) `insightJobs` entry
    // arriving with genuine data seconds after the delete request resolved.
    // Deleting the object doesn't delete its already-produced job output.
    // Forcing the fetch itself to fail is the only deterministic way to
    // exercise the bounded-lifetime/failure path — mirrors
    // `exploration-promote-tab-race.spec.mjs`'s `page.route()` precedent for
    // gating a real in-flight request. Installed BEFORE promoting so it's in
    // effect for every attempt the poll bridge makes once it starts.
    await page.route('**/api/insight-jobs/**', route => route.abort('failed'));

    await page.getByTestId('explorer-save-button').click();
    await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('exploration-promote-submit').click();
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName }
    );
    await page.getByTestId('exploration-promote-cancel').click();

    // ~30s (15 x 2s) polling budget, plus margin.
    await expect(page.getByTestId('chart-preview-promoted-poll-failed')).toBeVisible({
      timeout: 45000,
    });
  });

  test('VIS-1095: a dedup-offer slot hand-edited before Apply is skipped, not blindly overwritten', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);

    const tableRow = await expandSourceTable(page);
    const { locator: column } = await firstNumericColumn(page, tableRow);

    const insightA = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    // Insight A (active by default): bind x to a SUM(col) pill. Scoped to
    // A's OWN section testid (never a bare `.first()` across the whole
    // page) — see the "Explore this" comment below for why.
    const xSlotA = page
      .locator(`[data-testid="insight-build-section-${insightA}"] [data-testid*="droppable-property-x"]`)
      .first();
    await dragAndDrop(page, column, xSlotA);
    await expect(xSlotA).toContainText('SUM', { timeout: 10000 });

    // Insight B: a SECOND insight whose OWN x slot gets the IDENTICAL
    // SUM(col) expression (same source column, same drag) — the
    // match-and-replace dedup detector's target. Creating it activates AND
    // EXPANDS it, collapsing A (`ExplorationBuildRail.jsx`'s
    // `isExpanded={name === activeInsightName}` — correct, intentional
    // product behavior: a newly-added insight is focused). `InsightBuildSection.
    // jsx`'s `{isExpanded && (...)}` UNMOUNTS a collapsed section's content
    // entirely — its droppable-property-x/pill-menu-trigger simply leave the
    // DOM, not just CSS-hidden. Root-caused via live reproduction against
    // the sandbox (integration-gate fix cycle): the ORIGINAL test captured
    // `xSlotA` via a bare page-wide `.first()` locator BEFORE B existed;
    // once A collapsed, that lazily-re-evaluated locator silently
    // re-resolved to B's OWN droppable/pill-menu-trigger, so the "Save as
    // metric" flow below ran against B instead of A — the dedup/stale-guard
    // logic itself behaved correctly for whichever insight it actually ran
    // against, this was purely a test locator-scoping bug. Every reference
    // to A's elements below is now scoped to A's own section testid, and A
    // is explicitly re-expanded before being touched again.
    await page.getByTestId('right-panel-add-insight').click();
    const insightNames = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames
    );
    const insightB = insightNames[insightNames.length - 1];
    const xSlotB = page
      .locator(`[data-testid="insight-build-section-${insightB}"] [data-testid*="droppable-property-x"]`)
      .first();
    await dragAndDrop(page, column, xSlotB);
    await expect(xSlotB).toContainText('SUM', { timeout: 10000 });

    // Re-expand A (collapsed the instant B was created/activated above) —
    // its droppable/pill-menu elements are unmounted until it is.
    await page.getByTestId(`insight-toggle-${insightA}`).click();
    await expect(xSlotA).toContainText('SUM', { timeout: 5000 });

    // Promote A's x-slot to a named metric via "Save as metric" — its
    // match-and-replace dedup scan finds B's identical slot and offers a swap.
    await xSlotA.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('pill-menu-save-as-metric').click();
    await expect(page.getByTestId('save-as-metric-prompt')).toBeVisible({ timeout: 5000 });
    const metricName = `e2e_dedup_stale_${Date.now()}`;
    await page.getByTestId('save-as-metric-name-input').fill(metricName);
    await page.getByTestId('save-as-metric-submit').click();
    await expect(page.getByTestId('save-as-metric-prompt')).not.toBeVisible({ timeout: 15000 });
    createdObjects.push({ segment: 'metrics', name: metricName });

    const offerBanner = page.getByTestId('field-swap-offer-banner');
    await expect(offerBanner).toBeVisible({ timeout: 10000 });
    await expect(offerBanner).toContainText(metricName);

    // BEFORE accepting, hand-edit B's slot to something else entirely —
    // simulating the user continuing to work underneath the non-blocking
    // (non-modal) banner.
    const staleGuardValue = '?{${ref(totally_different_model).other_col}}';
    await page.evaluate(
      ({ insightB, staleGuardValue }) => {
        window.useStore.getState().setInsightProp(insightB, 'x', staleGuardValue);
      },
      { insightB, staleGuardValue }
    );

    await offerBanner.getByRole('button', { name: /Update \d+ reference/ }).click();

    // B's slot was NOT overwritten by the stale offer — the manual edit survived.
    const finalValue = await page.evaluate(
      name => window.useStore.getState().explorerInsightStates[name]?.props?.x,
      insightB
    );
    expect(finalValue).toBe(staleGuardValue);

    // A toast informed the user the reference had changed and was skipped.
    await expect(page.getByText(/changed since this offer was made/i)).toBeVisible({ timeout: 5000 });
  });
});
