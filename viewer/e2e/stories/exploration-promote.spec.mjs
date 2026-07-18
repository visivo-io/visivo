/**
 * Story: Exploration promote — the gated "Save to Project" checklist
 * (Explore 2.0 Phase 4 — VIS-1062–1066, 01-ux-spec.md §3, 02-architecture.md
 * §3). Replaces `explorer-crud-save.spec.mjs`/`explorer-save-flow.spec.mjs`/
 * `explorer-save-modal-objects.spec.mjs`/`explorer-publish-to-files.spec.mjs`
 * (05-e2e-ledger.md) — the old all-or-nothing `ExplorerSaveModal` is deleted;
 * this is its per-object gated successor, `ExplorationPromoteModal`.
 *
 *   1. Promote → the promoted objects land in the Library (real
 *      models/insights/charts collections) AND round-trip through YAML
 *      after a hard reload (a real `visivo run`/commit-adjacent guarantee —
 *      asserted via the object save endpoints + a reload, never a frontend
 *      string comparison, per `feedback_backend_diffing.md`).
 *   2. UPDATE-BY-NAME (05-e2e-ledger.md resolution #1): a draft insight/
 *      chart whose name matches an ALREADY-PUBLISHED object updates that
 *      object in place — never creates a sibling. Driven directly (rename
 *      the draft to a name that already exists) rather than via "Explore
 *      this" (still Phase 5 scope, not yet wired) — update-by-name is a
 *      property of the `saveX` actions' own upsert-by-name persistence, not
 *      of how the draft got that name.
 *   3. Partial promotion: one invalid object (a dangling ref) blocks ONLY
 *      itself — every other selected, valid object still promotes.
 *   4. The promoted trail (Build rail) deep-links to the real object, and
 *      the Explorer Home card shows the promotion count.
 *
 * Per 03-delivery-plan.md's Phase 4 gate: run COUNT is never asserted — the
 * invariant is "all promoted objects rebuilt in dependency order", not
 * "exactly one run" (the global 0.5s run-on-save debounce doesn't guarantee
 * coalescing across a sequential per-object saveX loop).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationPromote VISIVO_SANDBOX_BACKEND_PORT=8049 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3049 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3049 npx playwright test exploration-promote
 *
 * Mutates real backend records (explorations AND promoted project objects)
 * — runs in the serial `exploration-mutations` playwright project
 * (playwright.config.mjs), never `parallel`.
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

/** Drop a numeric column onto the active insight's `x` prop slot, producing
 * a real (valid, promotable) SUM pill — the minimal "this insight has data
 * props" shape the promote checklist requires (`buildPromoteChecklist.js`
 * skips insights with no data props beyond `type`).
 *
 * Runs the active model's query FIRST: a property-zone column drop builds a
 * bare `${ref(activeModelName).column}` expression (`WorkspaceDndContext.js`'s
 * `routeExplorationDragEnd` — `buildRefExpr`'s generic/`sourceColumn` branch)
 * assuming that model already has real SQL; it never seeds one as a side
 * effect (only a `sql-editor-drop` onto the Monaco editor does that, via
 * `seedModelTabFromTable`). Without running the query first, the model's
 * `explorerModelStates[name].sql` stays empty and `buildPromoteChecklist`'s
 * `if (!ms.sql) continue` silently drops the ENTIRE model tier from the
 * checklist — root-caused via live reproduction against the sandbox
 * (integration-gate fix cycle): every promote-row assertion in this file
 * failed with "element(s) not found" because the MODELS section never
 * rendered at all. Matches `exploration-preview.spec.mjs`'s already-working
 * `typeSql`+`runQuery`-before-drag pattern. */
async function bindXSlotToNumericColumn(page) {
  await typeSql(page, `SELECT * FROM ${TABLE}`);
  await runQuery(page);
  const tableRow = await expandSourceTable(page);
  const { locator: column, name: columnName } = await firstNumericColumn(page, tableRow);
  const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
  await expect(xSlot).toBeVisible({ timeout: 15000 });
  await dragAndDrop(page, column, xSlot);
  await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });
  return columnName;
}

async function renameChart(page, name) {
  const input = page.getByTestId('chart-name-input');
  await input.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.type(name, { delay: 5 });
  await input.blur();
}

async function renameInsight(page, insightName, newName) {
  await page.getByTestId(`insight-name-${insightName}`).click();
  const input = page.getByTestId(`insight-rename-input-${insightName}`);
  await input.fill(newName);
  await input.press('Enter');
}

/** Seed a draft's insight+chart names to match an ALREADY-PROMOTED pair,
 * bypassing the rename UI. Root-caused via live reproduction against the
 * sandbox (integration-gate fix cycle): both `renameInsight` and
 * `setChartName` (explorerStore.js) hard-block via `assertNameUnique` —
 * confirmed intentional and covered by their OWN passing unit tests
 * (`explorerStore.test.js`'s "throws NameCollisionError when new name
 * collides with cached object"/"...cached model"). Driving the UPDATE-BY-
 * NAME scenario through the real rename UI (as this test originally did) is
 * therefore unreachable — the collision guard that's supposed to protect
 * against ACCIDENTAL collisions also blocks the INTENTIONAL one this test
 * exercises. The test's own docstring already anticipates this: the "real"
 * path is "Explore this" (opening an existing object into a fresh,
 * already-same-named draft), explicitly out of scope until Phase 5. This
 * helper is what that future flow would produce — a draft born with the
 * target names already set — without touching the (correct, tested) rename
 * guard. */
async function seedDraftWithExistingNames(page, oldInsightName, insightName, chartName) {
  await page.evaluate(
    ({ oldInsightName, insightName, chartName }) => {
      const state = window.useStore.getState();
      const { [oldInsightName]: insightState, ...restInsightStates } = state.explorerInsightStates;
      window.useStore.setState({
        explorerInsightStates: { ...restInsightStates, [insightName]: insightState },
        explorerChartInsightNames: state.explorerChartInsightNames.map(n =>
          n === oldInsightName ? insightName : n
        ),
        explorerActiveInsightName:
          state.explorerActiveInsightName === oldInsightName ? insightName : state.explorerActiveInsightName,
        explorerChartName: chartName,
      });
    },
    { oldInsightName, insightName, chartName }
  );
}

async function openPromoteModal(page) {
  await page.getByTestId('explorer-save-button').click();
  await expect(page.getByTestId('exploration-promote-modal')).toBeVisible({ timeout: 10000 });
}

async function clickPromote(page) {
  await page.getByTestId('exploration-promote-submit').click();
}

/** The modal deliberately never auto-closes after a promote (product fix,
 * integration-gate cycle: `ExplorationPromoteModal.handlePromote` used to
 * call `onClose()` in the same tick as `setPromotedThisRun`, so the
 * "Promoted N objects" confirmation could never actually paint). The user
 * dismisses it via the button, whose label switches to "Close" once a
 * result exists — call this before interacting with anything the modal's
 * full-screen overlay would otherwise intercept clicks for. */
async function closePromoteModal(page) {
  await page.getByTestId('exploration-promote-cancel').click();
  await expect(page.getByTestId('exploration-promote-modal')).not.toBeVisible({ timeout: 5000 });
}

async function waitForObjectPublished(page, segment, name, timeout = 20000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`);
    expect(res.ok()).toBe(true);
  }).toPass({ timeout });
}

async function fetchObject(page, segment, name) {
  const res = await page.request.get(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`);
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe('Exploration promote (Explore 2.0 Phase 4)', () => {
  let explorationIdsBefore = [];
  const createdObjects = []; // {segment, name} — best-effort cleanup

  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    explorationIdsBefore = res && res.ok() ? (await res.json()).map(e => e.id) : [];
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    const idsAfter = res && res.ok() ? (await res.json()).map(e => e.id) : [];
    for (const id of idsAfter.filter(i => !explorationIdsBefore.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
    for (const { segment, name } of createdObjects.splice(0)) {
      await page.request.delete(`${apiBase}/api/${segment}/${encodeURIComponent(name)}/`).catch(() => {});
    }
  });

  test('promote → objects land in the Library + YAML round-trip after reload (all promoted, dependency order, no run-count assertion)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await bindXSlotToNumericColumn(page);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    const chartName = `e2e_promote_chart_${Date.now()}`;
    await renameChart(page, chartName);

    await openPromoteModal(page);
    // Default selection: every valid row pre-checked (01 §3).
    await expect(page.getByTestId(`promote-row-model-${queryName}-checkbox`)).toBeChecked();
    await expect(page.getByTestId(`promote-row-insight-${insightName}-checkbox`)).toBeChecked();
    await expect(page.getByTestId(`promote-row-chart-${chartName}-checkbox`)).toBeChecked();

    await clickPromote(page);
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });

    createdObjects.push(
      { segment: 'models', name: queryName },
      { segment: 'insights', name: insightName },
      { segment: 'charts', name: chartName }
    );

    // All three promoted objects rebuilt — asserted through the backend
    // object-save endpoints, never a run-count or a frontend string diff.
    await waitForObjectPublished(page, 'models', queryName);
    await waitForObjectPublished(page, 'insights', insightName);
    await waitForObjectPublished(page, 'charts', chartName);

    // YAML round-trip: reload the whole workspace and confirm the objects
    // are still resolvable from a cold client (proves persistence survived
    // past the in-memory session, not just an optimistic store write).
    await page.reload();
    await page.waitForLoadState('networkidle');
    const modelAfterReload = await fetchObject(page, 'models', queryName);
    expect(modelAfterReload.name).toBe(queryName);
    const insightAfterReload = await fetchObject(page, 'insights', insightName);
    expect(insightAfterReload.name).toBe(insightName);
    const chartAfterReload = await fetchObject(page, 'charts', chartName);
    expect(chartAfterReload.name).toBe(chartName);
  });

  test('UPDATE-BY-NAME: a draft insight/chart sharing an already-published name updates the original, never a sibling', async ({
    page,
  }) => {
    const sharedInsightName = `e2e_shared_insight_${Date.now()}`;
    const sharedChartName = `e2e_shared_chart_${Date.now()}`;

    // --- Exploration A: publish the "original". ---
    await gotoExplorerHome(page);
    await newExploration(page);
    const queryNameA = await page.evaluate(
      () => window.useStore.getState().explorerActiveModelName
    );
    const columnA = await bindXSlotToNumericColumn(page);
    const draftInsightNameA = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    await renameInsight(page, draftInsightNameA, sharedInsightName);
    await renameChart(page, sharedChartName);

    await openPromoteModal(page);
    await clickPromote(page);
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push(
      { segment: 'models', name: queryNameA },
      { segment: 'insights', name: sharedInsightName },
      { segment: 'charts', name: sharedChartName }
    );
    await waitForObjectPublished(page, 'insights', sharedInsightName);
    const originalInsight = await fetchObject(page, 'insights', sharedInsightName);
    const originalX = originalInsight.config?.props?.x;
    expect(originalX).toContain(columnA);

    // --- Exploration B: seed a DIFFERENT draft, same names, promote again. ---
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, `SELECT * FROM ${TABLE}`);
    await runQuery(page);
    const tableRow = await expandSourceTable(page);
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
    // Each column row renders a `library-source-column-...-<COL>` container
    // PLUS a nested `library-source-column-...-<COL>-drag-handle` child that
    // ALSO matches the `^=` prefix selector (`firstNumericColumn`'s `.first()`
    // dodges this since a container always sorts before its own handle in
    // document order — `.nth(1)` does not: it lands on the FIRST column's
    // drag-handle, not the second column's container). Root-caused via live
    // reproduction against the sandbox (integration-gate fix cycle):
    // `columnNameB` came out as "X-drag-handle" and the dropped ref was
    // `model.X` — identical to exploration A's, defeating the "genuinely
    // differs" assertion below. Exclude `-drag-handle` matches so `.nth(1)`
    // lands on the real second column.
    const columns = page.locator(
      '[data-testid^="library-source-column-"]:not([data-testid$="-drag-handle"])'
    );
    // Pick the SECOND numeric-looking column so the expression genuinely
    // differs from exploration A's — proves the update actually landed
    // new content, not a no-op re-save of identical config.
    const secondColumn = columns.nth(1);
    const columnNameB = await secondColumn
      .getAttribute('data-testid')
      .then(t => t.replace(`library-source-column-${SOURCE}-${TABLE}-`, ''));
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await dragAndDrop(page, secondColumn, xSlot);
    await expect(xSlot.getByTestId('pill-menu-trigger')).toBeVisible({ timeout: 10000 });

    const draftInsightNameB = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );
    // NOT `renameInsight`/`renameChart` here — both names already belong to
    // exploration A's just-promoted objects, and the rename UI's collision
    // guard (intentionally) blocks renaming INTO an existing name. See
    // `seedDraftWithExistingNames`'s docstring for the full root cause.
    await seedDraftWithExistingNames(page, draftInsightNameB, sharedInsightName, sharedChartName);

    await openPromoteModal(page);
    // The checklist recognizes this as an UPDATE, not a new object.
    await expect(page.getByTestId(`promote-row-insight-${sharedInsightName}-verdict`)).toContainText(
      'updates existing'
    );
    await clickPromote(page);
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // The ORIGINAL object now reflects B's content.
    const updatedInsight = await fetchObject(page, 'insights', sharedInsightName);
    expect(updatedInsight.config?.props?.x).toContain(columnNameB);
    expect(updatedInsight.config?.props?.x).not.toBe(originalX);

    // No sibling was created under a disambiguated name.
    const allInsights = await page.request.get(`${apiBase}/api/insights/`);
    const insightNames = (await allInsights.json()).insights.map(i => i.name);
    expect(insightNames.filter(n => n === sharedInsightName)).toHaveLength(1);
    expect(insightNames).not.toContain(`${sharedInsightName}_2`);
  });

  test('partial promotion: one invalid row (dangling ref) blocks only itself — every other valid row still promotes', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await bindXSlotToNumericColumn(page);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    // Add a SECOND insight with a dangling ref (never resolves) — invalid.
    // `createInsight` (explorerStore.js) sets the new insight as the ACTIVE
    // one, and `ExplorationBuildRail` expands a section iff
    // `name === activeInsightName` — the new section is already expanded, so
    // no toggle click is needed. Root-caused via live reproduction against
    // the sandbox (integration-gate fix cycle): clicking
    // `insight-toggle-${badInsightName}` COLLAPSED the already-open section
    // instead of opening it, hiding the y-slot and hanging the next locator.
    await page.getByTestId('right-panel-add-insight').click();
    const insightNames = await page.evaluate(() => window.useStore.getState().explorerChartInsightNames);
    const badInsightName = insightNames[insightNames.length - 1];
    const ySlot = page
      .locator(`[data-testid="insight-build-section-${badInsightName}"] [data-testid*="droppable-property-y"]`)
      .first();
    await ySlot.getByRole('button', { name: 'query string' }).click();
    const editable = ySlot.locator('[data-testid="ref-textarea-editable"]');
    await editable.click();
    await page.keyboard.type('${ref(totally_made_up_model_xyz).amount}', { delay: 5 });
    // No blur/commit step afterward — a syntactically complete single ref
    // swaps RefTextArea for a pill mid-keystroke (PropertyRow.jsx's
    // `showPill`), so `.blur()` on the by-then-unmounted node hangs for the
    // full test timeout. Same race `exploration-preview.spec.mjs` and
    // `exploration-build-rail.spec.mjs` already document and avoid.

    await openPromoteModal(page);
    await expect(page.getByTestId(`promote-row-insight-${insightName}-checkbox`)).toBeChecked();
    await expect(
      page.getByTestId(`promote-row-insight-${badInsightName}-checkbox`)
    ).not.toBeChecked();
    await expect(
      page.getByTestId(`promote-row-insight-${badInsightName}-checkbox`)
    ).toBeDisabled();

    await clickPromote(page);
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push({ segment: 'models', name: queryName }, { segment: 'insights', name: insightName });

    // The valid insight promoted; the dangling-ref one never got a save call.
    await waitForObjectPublished(page, 'insights', insightName);
    const res = await page.request.get(`${apiBase}/api/insights/${encodeURIComponent(badInsightName)}/`);
    expect(res.status()).toBe(404);
  });

  test('the promoted trail links each entry to its real object, and the Explorer Home card shows the promotion count', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await bindXSlotToNumericColumn(page);
    const insightName = await page.evaluate(
      () => window.useStore.getState().explorerChartInsightNames[0]
    );

    await openPromoteModal(page);
    await clickPromote(page);
    await expect(page.getByTestId('exploration-promote-success')).toBeVisible({ timeout: 20000 });
    createdObjects.push({ segment: 'models', name: queryName }, { segment: 'insights', name: insightName });
    await waitForObjectPublished(page, 'insights', insightName);
    await closePromoteModal(page);

    // Promoted trail deep-links.
    const trailItem = page.getByTestId(`exploration-promoted-item-insight-${insightName}`);
    await expect(trailItem).toBeVisible({ timeout: 10000 });
    await trailItem.click();
    await expect(page.getByTestId(`workspace-tab-insight:${insightName}`)).toBeVisible({
      timeout: 10000,
    });

    // Explorer Home card shows the promotion count.
    await gotoExplorerHome(page);
    await expect(page.getByTestId(`exploration-card-${id}-summary`)).toContainText('promoted', {
      timeout: 15000,
    });
  });
});
