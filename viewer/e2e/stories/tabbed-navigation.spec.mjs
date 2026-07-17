/**
 * Story: Tabbed Workspace navigation — basic open / close / switch (VIS-810 /
 * Track O O-1; reworked in Explore 2.0 Phase 0 for the destination/view model).
 *
 * Drives the REAL cursor through the multi-tab happy path:
 *   1. /workspace opens on the Project destination's Home with NO document
 *      tabs open (project left the tab model — D1) — the tab strip is
 *      present but empty (just the `[+]` affordance).
 *   2. Clicking Library rows opens tabs (icon + name in the strip, focused).
 *   3. Clicking a tab switches the workspace context (active styling + middle pane).
 *   4. Closing via the × removes the tab and focus falls back to the left neighbour.
 *   5. A dirty tab shows the mulberry ● indicator.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=trackO VISIVO_SANDBOX_BACKEND_PORT=8041 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3041 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3041 npx playwright test tabbed-navigation
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

async function openLibraryObject(page, type, name) {
  const header = page.getByTestId(`library-subsection-${type}-header`);
  // Subsections are collapsed by default; expand once.
  const row = page.getByTestId(`library-row-${type}-${name}`);
  if (!(await row.isVisible().catch(() => false))) {
    await header.hover();
    await header.click();
  }
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.hover();
  await row.click();
}

async function gotoWorkspace(page) {
  await page.goto(`${BASE_URL}/workspace`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 15000 });
}

test.describe('Tabbed navigation — open / close / switch (VIS-810; Explore 2.0 Phase 0)', () => {
  test('/workspace opens on the Project Home with an empty tab strip (no auto-hydrated tab)', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    // No document tab is open — the strip shows only the `+` affordance.
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.getByTestId('workspace-tab-new')).toBeVisible();
    // The view switcher shows Project active.
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
  });

  test('opening objects from the Library adds focused tabs; clicking tabs switches context', async ({
    page,
  }) => {
    await gotoWorkspace(page);

    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    const chartTab = page.getByTestId('workspace-tab-chart:simple-scatter-chart');
    await expect(chartTab).toBeVisible();
    await expect(chartTab).toHaveAttribute('data-active', 'true');

    await openLibraryObject(page, 'table', 'new_table');
    const tableTab = page.getByTestId('workspace-tab-table:new_table');
    await expect(tableTab).toHaveAttribute('data-active', 'true');
    await expect(chartTab).toHaveAttribute('data-active', 'false');

    // Click the chart tab → context switches back (real cursor).
    const chartSelect = page.getByTestId('workspace-tab-select-chart:simple-scatter-chart');
    await chartSelect.hover();
    await chartSelect.click();
    await expect(chartTab).toHaveAttribute('data-active', 'true');
    await expect(tableTab).toHaveAttribute('data-active', 'false');
    // Middle pane follows the active tab — the chart preview mounts.
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });
  });

  test('closing the active tab via × falls back to the previous tab', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    await openLibraryObject(page, 'table', 'new_table');

    const closeBtn = page.getByTestId('workspace-tab-close-table:new_table');
    await closeBtn.hover();
    await closeBtn.click();

    await expect(page.getByTestId('workspace-tab-table:new_table')).toHaveCount(0);
    await expect(
      page.getByTestId('workspace-tab-chart:simple-scatter-chart')
    ).toHaveAttribute('data-active', 'true');
  });

  test('closing the LAST open tab returns to the Project Home (no tab left active)', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');

    const closeBtn = page.getByTestId('workspace-tab-close-chart:simple-scatter-chart');
    await closeBtn.hover();
    await closeBtn.click();

    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('a dirty tab shows the unsaved-changes dot', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    // Dirty wiring is Track H's job (auto-save); flip the store flag directly
    // as state setup — the assertion is about the strip's rendering.
    await page.evaluate(() => {
      window.useStore.getState().setWorkspaceTabDirty('chart:simple-scatter-chart', true);
    });
    await expect(
      page.getByTestId('workspace-tab-dirty-chart:simple-scatter-chart')
    ).toBeVisible();
  });

  test('the + affordance activates the Project destination (views left the tab model)', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    await expect(
      page.getByTestId('workspace-tab-chart:simple-scatter-chart')
    ).toHaveAttribute('data-active', 'true');

    const plus = page.getByTestId('workspace-tab-new');
    await plus.hover();
    await plus.click();

    // The chart tab is parked (still open, no longer active) — Project's
    // Home takes the center instead of a resurrected "project tab".
    await expect(
      page.getByTestId('workspace-tab-chart:simple-scatter-chart')
    ).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible();
    await expect(page.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});
