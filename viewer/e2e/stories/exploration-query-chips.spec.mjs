/**
 * Story: Exploration query chips (Explore 2.0 Phase 3a — 01-ux-spec.md §3).
 *
 * `ModelTabBar` (horizontal bordered tabs) is replaced by compact query
 * chips on the exploration surface ONLY — the standalone `/explorer` route
 * keeps `ModelTabBar` untouched (a separate, still-passing suite covers it).
 * Named successor to the general query-chip/tab CRUD gap
 * (05-e2e-ledger.md's orchestrator resolution #3: "Query-chip CRUD gets a
 * named successor: exploration-query-chips.spec.mjs (create/switch/rename/
 * no-duplicate-names + the delete-with-dependents case)") — and to
 * `explorer-insight-survives-model-close.spec.mjs`'s delete-with-referrers
 * regression class specifically (03-delivery-plan.md's Phase 3a gate).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationQueryChips VISIVO_SANDBOX_BACKEND_PORT=8047 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3047 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3047 npx playwright test exploration-query-chips
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

/**
 * The actual chip row locator — NOT `[data-testid^="query-chip-"]` alone.
 * That prefix also matches other real elements inside/beside each chip
 * (`query-chip-status-dot`, `query-chip-<name>-menu-trigger` on the active
 * chip, and the `query-chip-add` button), so counting it directly over-counts
 * by 3 for a single chip. Only the chip row itself carries `data-active`.
 */
const chips = page => page.locator('[data-testid^="query-chip-"][data-active]');

test.describe('Exploration query chips (Explore 2.0 Phase 3a)', () => {
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

  test('a fresh exploration seeds one chip; [+] creates + activates a second', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    await expect(chips(page)).toHaveCount(1);
    const firstName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.getByTestId('query-chip-add').click();
    await expect(chips(page)).toHaveCount(2);
    const secondName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    expect(secondName).not.toBe(firstName);
    await expect(page.getByTestId(`query-chip-${secondName}`)).toHaveAttribute('data-active', 'true');
  });

  test('clicking an inactive chip switches the active query (SQL editor content follows)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const firstName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.locator('.view-lines').first().click();
    await page.keyboard.type('SELECT 1 AS one', { delay: 5 });

    await page.getByTestId('query-chip-add').click();
    await page.locator('.view-lines').first().click();
    await page.keyboard.type('SELECT 2 AS two', { delay: 5 });

    await page.getByTestId(`query-chip-${firstName}`).click();
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 1 AS one', {
      timeout: 5000,
    });
  });

  test('renaming the active chip via its ⋮ menu persists the new name', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const originalName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.getByTestId(`query-chip-${originalName}-menu-trigger`).click();
    await page.getByTestId(`query-chip-${originalName}-rename-action`).click();
    const input = page.getByTestId(`query-chip-${originalName}-rename-input`);
    await input.fill('orders_query');
    await input.press('Enter');

    await expect(page.getByTestId('query-chip-orders_query')).toBeVisible();
    await expect(page.getByTestId(`query-chip-${originalName}`)).not.toBeVisible();
  });

  test('no-duplicate-names: renaming to an existing chip name shows an inline error and does not rename', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const firstName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);
    await page.getByTestId('query-chip-add').click();
    const secondName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.getByTestId(`query-chip-${secondName}-menu-trigger`).click();
    await page.getByTestId(`query-chip-${secondName}-rename-action`).click();
    const input = page.getByTestId(`query-chip-${secondName}-rename-input`);
    await input.fill(firstName);
    await input.press('Enter');

    await expect(page.getByTestId(`query-chip-${secondName}-rename-error`)).toBeVisible();
    // Both original chips still present — the collision blocked the rename.
    await expect(page.getByTestId(`query-chip-${firstName}`)).toBeVisible();
    await expect(page.getByTestId(`query-chip-${secondName}`)).toBeVisible();
  });

  // Successor to explorer-insight-survives-model-close.spec.mjs's regression
  // class (03-delivery-plan.md's Phase 3a gate: "a query-chip delete-with-
  // dependents warning story").
  test('deleting a query with draft-insight referrers warns via ConfirmDialog; confirming deletes it, cancel keeps it', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const queryName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    // The exploration auto-creates one insight referencing the active query
    // (useExplorerWorkbenchInit's "auto-create insight" effect) — drop a
    // column onto its x prop so the query has a real referrer, mirroring how
    // exploration-dnd-pull-in.spec.mjs establishes this same precondition.
    await page.evaluate(name => {
      const s = window.useStore.getState();
      const insightName = s.explorerActiveInsightName;
      if (insightName) s.setInsightProp(insightName, 'x', `?{\${ref(${name}).x}}`);
    }, queryName);

    await page.getByTestId('query-chip-add').click();
    const secondName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    // Attempt to delete the REFERENCED query (queryName), not the new one.
    await page.getByTestId(`query-chip-${queryName}`).click();
    await page.getByTestId(`query-chip-${queryName}-menu-trigger`).click();
    await page.getByTestId(`query-chip-${queryName}-delete-action`).click();

    const confirmDialog = page.getByTestId(`query-chip-${queryName}-delete-confirm`);
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await expect(confirmDialog).toContainText('1 draft insight');

    // Cancel — the query survives.
    await page.getByTestId(`query-chip-${queryName}-delete-confirm-cancel`).click();
    await expect(page.getByTestId(`query-chip-${queryName}`)).toBeVisible();

    // Now confirm — the query is deleted despite the warning.
    await page.getByTestId(`query-chip-${queryName}-menu-trigger`).click();
    await page.getByTestId(`query-chip-${queryName}-delete-action`).click();
    await expect(page.getByTestId(`query-chip-${queryName}-delete-confirm`)).toBeVisible();
    await page.getByTestId(`query-chip-${queryName}-delete-confirm-confirm`).click();

    await expect(page.getByTestId(`query-chip-${queryName}`)).not.toBeVisible();
    await expect(page.getByTestId(`query-chip-${secondName}`)).toBeVisible();
  });

  test('cannot delete the last remaining chip — no Delete action offered', async ({ page }) => {
    await gotoExplorerHome(page);
    await newExploration(page);
    const onlyName = await page.evaluate(() => window.useStore.getState().explorerActiveModelName);

    await page.getByTestId(`query-chip-${onlyName}-menu-trigger`).click();
    await expect(page.getByTestId(`query-chip-${onlyName}-delete-action`)).not.toBeVisible();
    await expect(page.getByTestId(`query-chip-${onlyName}-rename-action`)).toBeVisible();
  });
});
