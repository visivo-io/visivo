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
 *
 * Runs in playwright.config.mjs's `exploration-mutations` project (serial,
 * no retries) CONCURRENTLY with `parallel`'s many workers against the same
 * :8001 Flask dev server — the `workspace-middle-exploration`/
 * `workspace-middle-explorer`/`explorer-home-gallery` visibility waits use a
 * 30s (not 15s) timeout to absorb that combined-load contention (CPU +
 * network, since re-opening an ALREADY-fetched exploration needs no new
 * request but still got slow under 5 concurrent Chromium instances) — it's
 * a real latency margin, not a correctness dependency;
 * `test.describe.configure({ timeout: 60000 })` below gives the
 * surrounding multi-step test enough room to match.
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
// Explorations are S3'd to a single file-backed repository shared by every
// test in this suite (`.visivo/explorations/` — see ExplorationRepository).
// Runs serially (playwright.config.mjs's `exploration-mutations` project)
// so tests never race each other, but each test still mints real backend
// records; belt-and-suspenders cleanup keeps the directory from growing
// across repeated runs — diff the id list before/after and delete whatever
// a test created, regardless of which UI path (seed / new / duplicate)
// minted it.
const API = BASE_URL.replace(':3001', ':8001');

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

test.describe('Explorer Home gallery (Explore 2.0 Phase 2)', () => {
  // The global 30s default (playwright.config.mjs) is tight for these
  // multi-step flows once combined-load contention (this project runs
  // concurrently with `parallel`'s many workers, see the file-header note)
  // stretches out every round-trip.
  test.describe.configure({ timeout: 60000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

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
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible({ timeout: 30000 });
    const cardCount = await page.locator('[data-testid^="exploration-card-"][data-testid$="-name"]').count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('"+ New exploration" mints a record and opens its tab', async ({ page }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();

    // A new exploration tab is now active — the SubBar shows its (default)
    // name and the legacy workbench mounts. Scoped to the workspace tab strip
    // — `[role="tab"]` isn't unique to it (the Right Rail's Outline/Edit
    // switcher, RightRail.jsx, also renders `role="tab"` + `data-active`, and
    // the legacy workbench auto-selects an object that surfaces it).
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByTestId('workspace-tab-strip').locator('[role="tab"][data-active="true"]')
    ).toHaveCount(1);
    // `openWorkspaceTab` (workspaceStore.js) activates the store AND
    // navigates the URL — activation causes the pane's own immediate
    // re-render, but the URL (`history.pushState`, routed through the data
    // router's own navigation pipeline) can lag behind under real load
    // (concurrent Chromium instances). Wait for the URL itself before
    // asserting on it.
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/workspace\/exploration\/exp_/);
  });

  test('a source tile mints a seeded exploration and opens its tab, pre-wired to that source', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-source-tile-local-sqlite').click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    // The seeded model tab's source select reflects the tile's source. Every
    // native `<select>` in the app was replaced by the shared react-select-
    // backed `<Select>` (src/components/common/Select.jsx —
    // scripts/check-no-native-select.sh guards this), so the selected value
    // is asserted as rendered text, not a native `<select>` element/value.
    await expect(page.getByTestId('source-selector')).toContainText('local-sqlite', {
      timeout: 10000,
    });
  });

  test('rename via the card ⋮ menu updates the card AND the open tab label', async ({ page }) => {
    await gotoExplorerHome(page);
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });

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
    // Scoped to the workspace tab strip — `[role="tab"]` isn't unique to it
    // (the Right Rail's Outline/Edit switcher, RightRail.jsx, also renders
    // `role="tab"`, and the legacy workbench opened below auto-selects an
    // object that surfaces it, which would otherwise inflate this count).
    const tabStripTabs = page.getByTestId('workspace-tab-strip').locator('[role="tab"]');
    const initialTabCount = await tabStripTabs.count();

    const card = page.locator('[data-testid^="exploration-card-"][data-testid$="-open"]').first();
    const cardTestId = await card.getAttribute('data-testid');
    const cardPrefix = cardTestId.replace(/-open$/, '');
    await page.getByTestId(`${cardPrefix}-menu`).click();
    await page.getByTestId(`${cardPrefix}-duplicate-action`).click();

    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await expect(tabStripTabs).toHaveCount(initialTabCount + 1);
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
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    // `openWorkspaceTab` (workspaceStore.js) activates the store AND
    // navigates the URL — activation causes THIS pane's own immediate
    // re-render, but the URL (`history.pushState`, routed through the data
    // router's own navigation pipeline) can lag behind under real load
    // (concurrent Chromium instances). Wait for the URL itself, not just the
    // pane, before reading an id out of it.
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
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

  // e2e-gap-review.md #23 [MEDIUM · PARTIAL]: the test above only ever has
  // ONE exploration in play — this proves a SIBLING parked exploration
  // survives untouched (tab strip presence, backend-persisted draft, and
  // clean re-openability) when a DIFFERENT parked exploration is deleted
  // from Home.
  test("deleting one parked exploration from Home leaves a SIBLING parked exploration's tab and persisted draft untouched, and its own slot un-reactivatable", async ({
    page,
  }) => {
    await gotoExplorerHome(page);

    // Exploration A: create, park it (switch to Project without closing).
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationIdA = new URL(page.url()).pathname.split('/').pop();
    const tabTestIdA = `workspace-tab-exploration:${explorationIdA}`;
    await expect(page.getByTestId(tabTestIdA)).toBeVisible();

    await page.getByTestId('workspace-view-switcher-project').click();
    await expect(page.getByTestId(tabTestIdA)).toHaveAttribute('data-active', 'false');

    // Exploration B: a SIBLING, created and parked the same way, so BOTH
    // sit parked in the strip simultaneously.
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible();
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
    const explorationIdB = new URL(page.url()).pathname.split('/').pop();
    const tabTestIdB = `workspace-tab-exploration:${explorationIdB}`;
    await expect(page.getByTestId(tabTestIdB)).toBeVisible();

    await page.getByTestId('workspace-view-switcher-project').click();
    await expect(page.getByTestId(tabTestIdA)).toBeVisible();
    await expect(page.getByTestId(tabTestIdA)).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId(tabTestIdB)).toBeVisible();
    await expect(page.getByTestId(tabTestIdB)).toHaveAttribute('data-active', 'false');

    // Delete A from Home while BOTH A and B sit parked in the strip.
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await page.getByTestId(`exploration-card-${explorationIdA}-menu`).click();
    await page.getByTestId(`exploration-card-${explorationIdA}-delete-action`).click();
    await page.getByTestId('exploration-delete-confirm-confirm').click();

    // A's parked tab is force-closed with a toast, as the single-exploration
    // test above already proves...
    await expect(page.getByTestId(tabTestIdA)).not.toBeVisible();
    await expect(page.getByText(/was deleted/i)).toBeVisible({ timeout: 5000 });

    // ...but B's SIBLING parked tab is completely undisturbed — still
    // present in the strip, unfocused (deleting A never re-fires B's
    // restore or activates it).
    await expect(page.getByTestId(tabTestIdB)).toBeVisible();
    await expect(page.getByTestId(tabTestIdB)).toHaveAttribute('data-active', 'false');

    // B's backend record survived untouched.
    const backendCheckB = await page.request.get(`${API}/api/explorations/${explorationIdB}/`);
    expect(backendCheckB.ok()).toBe(true);

    // A's record is genuinely gone — its slot cannot be reactivated (no
    // stray tab, no card) — while B still opens cleanly from its own tab.
    const backendCheckA = await page.request.get(`${API}/api/explorations/${explorationIdA}/`);
    expect(backendCheckA.status()).toBe(404);
    await expect(page.getByTestId(`exploration-card-${explorationIdA}-name`)).not.toBeVisible();

    await page.getByTestId(`workspace-tab-select-exploration:${explorationIdB}`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(tabTestIdB)).toHaveAttribute('data-active', 'true');
  });
});
