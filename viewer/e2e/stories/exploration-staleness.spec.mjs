/**
 * Story: Exploration staleness (Explore 2.0 Phase 5 — VIS-1070,
 * 02-architecture.md §8, 01-ux-spec.md §2's "⚠ stale (orders changed)"
 * end-state).
 *
 * `computeExplorationStaleness` re-runs the SAME advisory ref-target check
 * (`checkRefTargets`) the Build rail already runs continuously while typing,
 * at two moments nothing else covers: on RESUME (`ExplorationPane`'s
 * activate effect) and on the Explorer Home gallery (every card, once per
 * render).
 *
 *   1. A draft with a ref to an object that doesn't exist shows the "stale"
 *      badge on its Explorer Home card.
 *   2. Reopening that exploration shows the non-blocking "re-check
 *      references" banner, naming the dangling ref.
 *   3. Dismiss hides the banner without touching the draft.
 *   4. "Re-check references" re-runs the check live — once the referenced
 *      object actually gets published, the banner clears without a reload.
 *   5. A clean draft (no dangling refs) never shows either affordance.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationStaleness VISIVO_SANDBOX_BACKEND_PORT=8054 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3054 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3054 npx playwright test exploration-staleness
 *
 * Mutates real backend records (explorations, and one model in the
 * "re-check clears live" test) — runs in the serial `exploration-mutations`
 * playwright project (playwright.config.mjs), never `parallel`.
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

/** Type a raw `${ref(...)}` directly into the x-slot's query-string field —
 * the exact pattern exploration-preview.spec.mjs's "not-yet-promoted input"
 * test already proves works for typing a syntactically-complete single ref.
 * No blur/commit afterward: a complete single ref swaps RefTextArea for a
 * pill mid-keystroke (PropertyRow.jsx's `showPill`), so blurring the by-then
 * -unmounted node hangs for the full test timeout. */
async function typeDanglingRefIntoXSlot(page, refName) {
  const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
  await xSlot.getByRole('button', { name: 'query string' }).click();
  const editable = xSlot.locator('[data-testid="ref-textarea-editable"]');
  await editable.click();
  await page.keyboard.type(`\${ref(${refName}).amount}`, { delay: 5 });
}

/** Park the active exploration tab (switches destinations without closing
 * it) — triggers ExplorationPane's deactivate flush, so the just-typed
 * draft edit lands in workspaceExplorations.byId BEFORE Explorer Home reads
 * it for the staleness badge. */
async function parkActiveTab(page) {
  await page.getByTestId('workspace-view-switcher-project').click();
}

async function waitForBackendDraftContains(page, id, needle, timeout = 15000) {
  await expect(async () => {
    const res = await page.request.get(`${apiBase}/api/explorations/${id}/`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(JSON.stringify(data.draft)).toContain(needle);
  }).toPass({ timeout });
}

test.describe('Exploration staleness (Explore 2.0 Phase 5 — VIS-1070)', () => {
  test.describe.configure({ timeout: 60000 });

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

  test('a dangling ref shows the Home card badge, and the resume banner names it', async ({
    page,
  }) => {
    const danglingRef = `e2e_stale_ref_${Date.now()}`;

    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeDanglingRefIntoXSlot(page, danglingRef);
    await waitForBackendDraftContains(page, id, danglingRef);

    await parkActiveTab(page);
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`exploration-card-${id}-stale`)).toBeVisible({ timeout: 20000 });

    // Reopening surfaces the non-blocking resume banner, naming the ref.
    await page.getByTestId(`exploration-card-${id}-open`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    const banner = page.getByTestId('exploration-staleness-banner');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText(danglingRef);
  });

  test('Dismiss hides the banner without touching the draft', async ({ page }) => {
    const danglingRef = `e2e_stale_dismiss_${Date.now()}`;

    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeDanglingRefIntoXSlot(page, danglingRef);
    await waitForBackendDraftContains(page, id, danglingRef);
    await parkActiveTab(page);

    await page.getByTestId('workspace-view-switcher-explorer').click();
    await page.getByTestId(`exploration-card-${id}-open`).click();
    await expect(page.getByTestId('exploration-staleness-banner')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('exploration-staleness-dismiss').click();
    await expect(page.getByTestId('exploration-staleness-banner')).not.toBeVisible();

    // The draft itself is untouched — the ref is still there (dismiss is
    // purely a UI affordance, never a silent edit).
    await waitForBackendDraftContains(page, id, danglingRef);
  });

  test('"Re-check references" clears the banner live, once the referenced object is actually published', async ({
    page,
  }) => {
    // A NAME the exploration will reference — published mid-test, not
    // up front, so the first check genuinely observes it dangling.
    const modelName = `e2e_stale_recheck_${Date.now()}`;

    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeDanglingRefIntoXSlot(page, modelName);
    await waitForBackendDraftContains(page, id, modelName);
    await parkActiveTab(page);

    await page.getByTestId('workspace-view-switcher-explorer').click();
    await page.getByTestId(`exploration-card-${id}-open`).click();
    await expect(page.getByTestId('exploration-staleness-banner')).toBeVisible({ timeout: 15000 });

    // Publish a REAL model under that exact name directly via the API.
    const res = await page.request.post(`${apiBase}/api/models/${encodeURIComponent(modelName)}/`, {
      data: { sql: 'SELECT 1 AS amount', source: '${ref(local-duckdb)}' },
    });
    expect(res.ok()).toBe(true);
    createdObjects.push({ segment: 'models', name: modelName });
    // The client's own cached `state.models` won't see it until refetched —
    // the same reason save-as-metric.spec.mjs's collision test refetches
    // after a raw API create.
    await page.evaluate(() => window.useStore.getState().fetchModels());

    await page.getByTestId('exploration-staleness-recheck').click();
    await expect(page.getByTestId('exploration-staleness-banner')).not.toBeVisible({ timeout: 15000 });
  });

  test('a clean draft (no dangling refs) never shows the badge or the banner', async ({ page }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    // Deliberately leave the draft untouched (no data props at all) — the
    // baseline "nothing to be stale about" case.
    await parkActiveTab(page);

    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`exploration-card-${id}-name`)).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`exploration-card-${id}-stale`)).not.toBeVisible();

    await page.getByTestId(`exploration-card-${id}-open`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('exploration-staleness-banner')).not.toBeVisible();
  });
});
