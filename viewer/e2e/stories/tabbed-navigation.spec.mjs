/**
 * Story: Tabbed Workspace navigation — basic open / close / switch (VIS-810 / Track O O-1).
 *
 * Drives the REAL cursor through the multi-tab happy path:
 *   1. /workspace opens with the default project tab.
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

test.describe('Tabbed navigation — open / close / switch (VIS-810)', () => {
  test('default project tab is present and active on entry', async ({ page }) => {
    await gotoWorkspace(page);
    const projectTab = page.locator('[data-testid^="workspace-tab-project:"]');
    await expect(projectTab).toHaveCount(1);
    await expect(projectTab).toHaveAttribute('data-active', 'true');
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

  test('the + affordance focuses/opens the project tab', async ({ page }) => {
    await gotoWorkspace(page);
    await openLibraryObject(page, 'chart', 'simple-scatter-chart');
    await expect(page.locator(`[data-testid^="workspace-tab-project:"]`)).toHaveAttribute(
      'data-active',
      'false'
    );
    const plus = page.getByTestId('workspace-tab-new');
    await plus.hover();
    await plus.click();
    await expect(page.locator('[data-testid^="workspace-tab-project:"]')).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});
