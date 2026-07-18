/**
 * Story: Explorer Home gallery (Explore 2.0 Phase 2).
 *
 * Successor to `explorer-first-visit.spec.mjs` (ledger: 05-e2e-ledger.md —
 * the standalone `/explorer` 3-panel first-visit flow is retired; Explorer
 * Home + an exploration tab replace it). Covers
 * `specs/plan/explorer-workspace-unification/01-ux-spec.md` §2/§4 end to end:
 *
 *   1. The gallery: header, "+ New exploration", "Start from a source"
 *      tiles, "Recent explorations" cards.
 *   2. A fresh project lazily seeds one "Scratch" exploration so the first
 *      visit is never empty.
 *   3. "+ New exploration" mints a record and opens its tab.
 *   4. A source tile mints a seeded exploration and opens its tab.
 *   5. Card actions: rename (inline), duplicate (opens a sibling tab),
 *      delete (via ConfirmDialog) — including deleting an exploration whose
 *      tab is open (even parked) force-closing it with a toast.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorerHome VISIVO_SANDBOX_BACKEND_PORT=8043 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3043 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3043 npx playwright test explorer-home
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 15000 });
}

test.describe('Explorer Home gallery (Explore 2.0 Phase 2)', () => {
  test('renders the header, New-exploration button, and source tiles', async ({ page }) => {
    await gotoExplorerHome(page);
    await expect(page.getByText('Explore your data')).toBeVisible();
    await expect(page.getByTestId('explorer-home-new-exploration')).toBeVisible();
    await expect(page.getByTestId('explorer-home-source-tile-local-sqlite')).toBeVisible();
  });

  test('a fresh project lazily seeds one "Scratch" exploration so the first visit is never empty', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible({ timeout: 15000 });
    const cardCount = await page.locator('[data-testid^="exploration-card-"][data-testid$="-name"]').count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('"+ New exploration" mints a record and opens its tab', async ({ page }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();

    // A new exploration tab is now active — the SubBar shows its (default)
    // name and the legacy workbench mounts.
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="tab"][data-active="true"]')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toMatch(/^\/workspace\/exploration\/exp_/);
  });

  test('a source tile mints a seeded exploration and opens its tab, pre-wired to that source', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-source-tile-local-sqlite').click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    // The seeded model tab's source select reflects the tile's source.
    const sourceSelect = page.locator('select').first();
    await expect(sourceSelect).toHaveValue(/local-sqlite/, { timeout: 10000 });
  });

  test('rename via the card ⋮ menu updates the card AND the open tab label', async ({ page }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });

    // Back to Home to rename from the gallery.
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible();

    const card = page.locator('[data-testid^="exploration-card-"][data-testid$="-open"]').first();
    const cardTestId = await card.getAttribute('data-testid');
    const cardPrefix = cardTestId.replace(/-open$/, '');
    await page.getByTestId(`${cardPrefix}-menu`).click();
    await page.getByTestId(`${cardPrefix}-rename-action`).click();
    const input = page.getByTestId(`${cardPrefix}-rename-input`);
    await input.fill('Churn dig');
    await input.press('Enter');

    await expect(page.getByTestId(`${cardPrefix}-name`)).toHaveText('Churn dig');
    // The still-open (parked) tab's label follows the rename.
    await expect(page.locator('[role="tab"]', { hasText: 'Churn dig' })).toBeVisible();
  });

  test('duplicate opens a sibling exploration tab', async ({ page }) => {
    await gotoExplorerHome(page);
    const initialTabCount = await page.locator('[role="tab"]').count();

    const card = page.locator('[data-testid^="exploration-card-"][data-testid$="-open"]').first();
    const cardTestId = await card.getAttribute('data-testid');
    const cardPrefix = cardTestId.replace(/-open$/, '');
    await page.getByTestId(`${cardPrefix}-menu`).click();
    await page.getByTestId(`${cardPrefix}-duplicate-action`).click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="tab"]')).toHaveCount(initialTabCount + 1);
  });

  test('delete removes the card after confirming', async ({ page }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible();

    const cardCountBefore = await page
      .locator('[data-testid^="exploration-card-"][data-testid$="-name"]')
      .count();
    const card = page.locator('[data-testid^="exploration-card-"][data-testid$="-open"]').first();
    const cardTestId = await card.getAttribute('data-testid');
    const cardPrefix = cardTestId.replace(/-open$/, '');
    const explorationId = cardPrefix.replace('exploration-card-', '');

    await page.getByTestId(`${cardPrefix}-menu`).click();
    await page.getByTestId(`${cardPrefix}-delete-action`).click();
    await expect(page.getByTestId('exploration-delete-confirm')).toBeVisible();
    await page.getByTestId('exploration-delete-confirm-confirm').click();

    await expect(page.getByTestId(`exploration-card-${explorationId}-name`)).not.toBeVisible();
    const cardCountAfter = await page
      .locator('[data-testid^="exploration-card-"][data-testid$="-name"]')
      .count();
    expect(cardCountAfter).toBe(cardCountBefore - 1);
  });

  test('deleting an exploration whose tab is open (even PARKED) force-closes it with a toast (01-ux-spec.md §4)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    const openedUrl = new URL(page.url());
    const explorationId = openedUrl.pathname.split('/').pop();
    const tabTestId = `workspace-tab-exploration:${explorationId}`;
    await expect(page.getByTestId(tabTestId)).toBeVisible();

    // Park it: switch to a different destination WITHOUT closing the tab.
    await page.getByTestId('workspace-view-switcher-project').click();
    await expect(page.getByTestId(tabTestId)).toBeVisible();
    await expect(page.getByTestId(tabTestId)).toHaveAttribute('data-active', 'false');

    // Delete from Home while the tab sits parked in the strip.
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await page.getByTestId(`exploration-card-${explorationId}-menu`).click();
    await page.getByTestId(`exploration-card-${explorationId}-delete-action`).click();
    await page.getByTestId('exploration-delete-confirm-confirm').click();

    // The parked tab is force-closed and a toast announces it.
    await expect(page.getByTestId(tabTestId)).not.toBeVisible();
    await expect(page.getByText(/was deleted/i)).toBeVisible({ timeout: 5000 });
  });
});
