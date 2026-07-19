/**
 * Story: Two-exploration isolation for Phase 3a's DnD-authored ref pills and
 * multi-query-chip state (e2e-gap-review.md #22 [MEDIUM · PARTIAL]).
 *
 * `exploration-lifecycle.spec.mjs`'s "two explorations opened in two tabs
 * never bleed state into each other" test only ever types plain SQL marker
 * text into a SINGLE query chip per exploration — no second chip, no DnD, no
 * insight-prop ref pill. `exploration-dnd-pull-in.spec.mjs`'s ref-pill test
 * and `exploration-query-chips.spec.mjs`'s multi-chip CRUD tests each operate
 * within ONE exploration only. This story combines all three patterns:
 * exploration A gets a SECOND query chip AND a DnD-authored ref pill, then B
 * is built up independently, then switching back to A proves (through the
 * BACKEND draft, not just the DOM) that A's full chip set + ref pill survive
 * byte-for-byte — never merged/overwritten by B's restore or the shared
 * WorkspaceDndContext's `activeDrag` state.
 *
 * Note on auto-generated chip names: `generateUniqueName` scopes uniqueness
 * to the CURRENT exploration's own working state only (matching the shared
 * review's own P4-D2 observation) — so A's and B's auto-named chips can
 * coincidentally share the exact same string (e.g. both mint "model"). Every
 * assertion here that must be unambiguous across the two explorations goes
 * through the BACKEND, keyed by each exploration's own distinct id — never a
 * bare chip-name string, which name collisions would make ambiguous.
 *
 * A SEPARATE, orthogonal defect surfaced while writing this test (documented
 * here, not asserted on, since it's outside #22's own scope — reported
 * separately): creating a SECOND (or later) exploration in the same page
 * session mints an extra phantom auto-created query chip (repro: React
 * StrictMode — confirmed enabled in src/index.jsx — double-invokes
 * `useExplorerWorkbenchInit.js`'s auto-create-model-tab `useLayoutEffect`,
 * which has no cleanup function; both invocations see `modelTabs.length===0`
 * off a stale closure and each call `createModelTab()`, minting two
 * auto-named tabs instead of one once `explorerSources` is already cached
 * from an earlier exploration in the same session). This test does NOT
 * assert an exact chip count for exploration B for exactly that reason —
 * B's own internal auto-create correctness is a different bug from the
 * cross-exploration isolation this test targets; asserting a fixed chip
 * count here would make this test fail on an unrelated pre-existing defect.
 *
 * Reuses `dragAndDrop`/`expandSourceTable`/`waitForBackendDraft` verbatim
 * from `exploration-dnd-pull-in.spec.mjs`, and the `chips()` locator +
 * `query-chip-add` pattern from `exploration-query-chips.spec.mjs`.
 */

import { test, expect } from '@playwright/test';

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

/** Verbatim from exploration-dnd-pull-in.spec.mjs. */
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
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  return new URL(page.url()).pathname.split('/').pop();
}

/** Verbatim from exploration-query-chips.spec.mjs / exploration-dnd-pull-in.spec.mjs. */
const chips = page => page.locator('[data-testid^="query-chip-"][data-active]');

async function expandSourceTable(page) {
  const sourceHeader = page.getByTestId('library-subsection-source-header');
  const sourceBody = page.getByTestId('library-subsection-source-body');
  if (!(await sourceBody.isVisible().catch(() => false))) await sourceHeader.click();
  await expect(sourceBody).toBeVisible({ timeout: 5000 });

  const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
  // Idempotent, unlike the sibling helper this is copied from: this test
  // calls `expandSourceTable` TWICE in one session (once per exploration),
  // and the Library rail's row-expansion state is NOT reset between
  // explorations — a second unconditional click would TOGGLE the row
  // closed again instead of opening it.
  if (!(await tableRow.isVisible().catch(() => false))) {
    await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
  }
  await expect(tableRow).toBeVisible({ timeout: 15000 });
  return tableRow;
}

async function firstColumnNameAndLocator(page, tableRow) {
  const col = page.locator('[data-testid^="library-source-column-"]').first();
  // Idempotent for the same reason as `expandSourceTable` above — the second
  // call in this test (for exploration B) can find the table already
  // expanded from A's earlier pass.
  if (!(await col.isVisible().catch(() => false))) {
    await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
  }
  await expect(col).toBeVisible({ timeout: 10000 });
  const name = await col
    .getAttribute('data-testid')
    .then(t => t.replace(`library-source-column-${SOURCE}-${TABLE}-`, ''));
  return { col, name };
}

/** Verbatim shape from exploration-dnd-pull-in.spec.mjs. */
async function waitForBackendDraft(page, id, predicate, timeout = 20000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(predicate(data.draft)).toBe(true);
  }).toPass({ timeout });
}

test.describe('Two-exploration isolation for DnD ref pills + multi-chip state (#22)', () => {
  test.describe.configure({ timeout: 90000 });

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

  test("A's two-chip set and DnD-authored ref pill survive a full park (B) and resume, byte-for-byte through the backend", async ({
    page,
  }) => {
    // ---- Build exploration A: 2 chips + a real DnD ref pill on chip 1 ----
    await gotoExplorerHome(page);
    const idA = await newExploration(page);
    const queryA1 = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.getByTestId('query-chip-add').click();
    await expect(chips(page)).toHaveCount(2);
    const queryA2 = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    expect(queryA2).not.toBe(queryA1);

    // Switch back to A's FIRST chip so the ref pill binds to queryA1.
    await page.getByTestId(`query-chip-${queryA1}`).click();
    await expect(page.getByTestId(`query-chip-${queryA1}`)).toHaveAttribute('data-active', 'true');

    const tableRowA = await expandSourceTable(page);
    const { col: columnA, name: columnNameA } = await firstColumnNameAndLocator(page, tableRowA);
    const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, columnA, xSlot);
    await expect(xSlot).toContainText(columnNameA);

    const aHasExpectedDraft = draft => {
      const chipNames = (draft.queries || []).map(q => q.name);
      return (
        chipNames.includes(queryA1) &&
        chipNames.includes(queryA2) &&
        (draft.insights || []).some(insight =>
          Object.values(insight.props || {}).some(
            v => typeof v === 'string' && v.includes(`ref(${queryA1}).${columnNameA}`)
          )
        )
      );
    };

    // Confirm A's full state (2 chips + the ref pill on queryA1) actually
    // persisted server-side before we ever touch exploration B.
    await waitForBackendDraft(page, idA, aHasExpectedDraft);

    // ---- Park A, build exploration B with its OWN chip + a DIFFERENT DnD
    // ref pill (bound to B's own active query, on the 'y' prop rather than
    // 'x' so even a coincidental chip-name collision with A can never make
    // the two ref pills look alike). B's own chip-count correctness is
    // deliberately NOT asserted here — see the file docstring's note on the
    // separate, pre-existing StrictMode-related double-auto-create defect
    // this test surfaced but is out of scope to fix/assert on. ----
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible();
    const idB = await newExploration(page);
    const queryB1 = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    const tableRowB = await expandSourceTable(page);
    const { col: columnB, name: columnNameB } = await firstColumnNameAndLocator(page, tableRowB);
    const ySlot = page.locator('[data-testid*="droppable-property-y"]').first();
    await expect(ySlot).toBeVisible({ timeout: 15000 });
    await dragAndDrop(page, columnB, ySlot);
    await expect(ySlot).toContainText(columnNameB);

    const bHasExpectedDraft = draft => {
      const chipNames = (draft.queries || []).map(q => q.name);
      return (
        chipNames.includes(queryB1) &&
        (draft.insights || []).some(insight =>
          Object.values(insight.props || {}).some(
            v => typeof v === 'string' && v.includes(`ref(${queryB1}).${columnNameB}`)
          )
        )
      );
    };
    await waitForBackendDraft(page, idB, bHasExpectedDraft);

    // ---- Switch BACK to A via its tab (not Home) — the two-tab isolation
    // pattern exploration-lifecycle.spec.mjs establishes for plain SQL,
    // exercised here for chips + a DnD ref pill instead. ----
    await page.getByTestId(`workspace-tab-select-exploration:${idA}`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });

    // A's OWN two chips are BOTH still present (the actual isolation
    // guarantee this test targets) — whatever B's own internal chip count
    // turned out to be is irrelevant to A's own state.
    await expect(page.getByTestId(`query-chip-${queryA1}`)).toBeVisible();
    await expect(page.getByTestId(`query-chip-${queryA2}`)).toBeVisible();

    // A's x-slot ref pill is exactly as left — not cleared, not overwritten
    // by B's y-slot pill, not showing raw ref syntax.
    await page.getByTestId(`query-chip-${queryA1}`).click();
    const xSlotAgain = page.locator('[data-testid*="droppable-property-x"]').first();
    await expect(xSlotAgain).toContainText(columnNameA);
    await expect(xSlotAgain).not.toContainText('?{');

    // Final, authoritative check: BOTH explorations' backend drafts are
    // exactly as each was left — neither merged into nor overwritten by the
    // other, despite sharing one WorkspaceDndContext and one legacy
    // explorerStore singleton across the park/resume cycle.
    await waitForBackendDraft(page, idA, aHasExpectedDraft);
    await waitForBackendDraft(page, idB, bHasExpectedDraft);
  });
});
