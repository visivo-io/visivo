/**
 * Story: Exploration lifecycle — create → edit → park → resume → reload
 * (Explore 2.0 Phase 2).
 *
 * Successor to `explorer-chart-loading-deep.spec.mjs` / `explorer-load-
 * chart.spec.mjs`'s resume/reload assertions (ledger: 05-e2e-ledger.md).
 * Covers `specs/plan/explorer-workspace-unification/01-ux-spec.md` §4 and
 * `02-architecture.md` §1/§8's state-bridge guarantees end to end:
 *
 *   1. Create → edit SQL → park (close the tab) → resume (Home → Open) →
 *      the SQL survives — park is LOSSLESS.
 *   2. Reload while the exploration tab is active restores it from the URL
 *      AND the draft (backend-persisted, not localStorage).
 *   3. Two explorations open in two (sequential) tabs never bleed state into
 *      each other — editing one, switching to the other, and back shows each
 *      exploration's OWN SQL, not the other's.
 *   4. Deep-linking `/workspace/exploration/:id` directly sets
 *      `workspaceActiveView` to 'explorer' (01-ux-spec.md §1's deep-link
 *      rule); closing that freshly-deep-linked tab lands on Explorer Home,
 *      not Project.
 *   5. An unknown id renders a clean not-found state (never a crash) —
 *      explorations mount outside ObjectCanvasFrame (D5).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=explorationLifecycle VISIVO_SANDBOX_BACKEND_PORT=8044 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3044 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3044 npx playwright test exploration-lifecycle
 */

import { test, expect } from '@playwright/test';
import { typeSql } from '../helpers/explorer.mjs';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 15000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
  const id = new URL(page.url()).pathname.split('/').pop();
  return id;
}

test.describe('Exploration lifecycle (Explore 2.0 Phase 2)', () => {
  test('create → edit SQL → park (close) → resume from Home → SQL survives (lossless park)', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);

    await typeSql(page, 'SELECT 1 AS one');
    // Give the debounced draft-sync a moment to fire before we close.
    await page.waitForTimeout(1200);

    const tabTestId = `workspace-tab-exploration:${id}`;
    const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
    await closeBtn.hover();
    await closeBtn.click();
    await expect(page.getByTestId(tabTestId)).not.toBeVisible();
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();

    // Resume from Home.
    await page.getByTestId(`exploration-card-${id}-open`).click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 1 AS one', {
      timeout: 10000,
    });
  });

  test('reload while the exploration tab is active restores it from the URL + backend draft', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await typeSql(page, 'SELECT 2 AS two');
    await page.waitForTimeout(1200);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe(`/workspace/exploration/${id}`);
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 2 AS two', {
      timeout: 10000,
    });
  });

  test('two explorations opened in two tabs never bleed state into each other', async ({ page }) => {
    await gotoExplorerHome(page);
    const idA = await newExploration(page);
    await typeSql(page, 'SELECT 111 AS a_marker');
    await page.waitForTimeout(1200);

    // Open a SECOND exploration (park A, activate B).
    await page.getByTestId('workspace-view-switcher-explorer').click();
    await expect(page.getByTestId('explorer-home-gallery')).toBeVisible();
    const idB = await newExploration(page);
    await typeSql(page, 'SELECT 222 AS b_marker');
    await page.waitForTimeout(1200);
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 222 AS b_marker');
    await expect(page.locator('.view-lines').first()).not.toContainText('a_marker');

    // Switch back to A via its tab — B's edit must not have leaked into A.
    await page.getByTestId(`workspace-tab-select-exploration:${idA}`).click();
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 111 AS a_marker', {
      timeout: 10000,
    });
    await expect(page.locator('.view-lines').first()).not.toContainText('b_marker');

    // And B again, from A — same isolation guarantee both directions.
    await page.getByTestId(`workspace-tab-select-exploration:${idB}`).click();
    await expect(page.locator('.view-lines').first()).toContainText('SELECT 222 AS b_marker', {
      timeout: 10000,
    });
  });

  test('deep-linking /workspace/exploration/:id sets the active destination to Explorer; closing lands on Explorer Home', async ({
    page,
  }) => {
    // First mint one via Home so we have a real, addressable id.
    await gotoExplorerHome(page);
    const id = await newExploration(page);
    await page.getByTestId(`workspace-tab-close-exploration:${id}`).click();

    // Deep-link directly, cold — never having visited Explorer Home first
    // in THIS navigation.
    await page.goto(`${BASE_URL}/workspace/exploration/${id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 15000 });

    const activeView = await page.evaluate(() => window.useStore.getState().workspaceActiveView);
    expect(activeView).toBe('explorer');

    const closeBtn = page.getByTestId(`workspace-tab-close-exploration:${id}`);
    await closeBtn.hover();
    await closeBtn.click();
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-explorer')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('an unknown exploration id renders a clean not-found state, never a crash', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace/exploration/exp_doesnotexist`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-exploration-not-found')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/doesn't exist/i)).toBeVisible();
  });
});
