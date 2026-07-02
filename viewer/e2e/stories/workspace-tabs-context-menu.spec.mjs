/**
 * Story: Right-click "Open in new tab" across workspace surfaces (VIS-811 / Track O O-2).
 *
 * Real-cursor right-clicks (`click({ button: 'right' })`) on each surface:
 *   1. Library rows        — existing kebab/context menu, now wired to the store.
 *   2. Project Editor tile — shared OpenObjectContextMenu.
 *   3. Canvas item (chart leaf, scoped dashboard) — extended CanvasContextMenu.
 *   4. Lineage node        — shared OpenObjectContextMenu via React Flow.
 *
 * Background-open convention: "Open in new tab" adds the tab WITHOUT stealing
 * focus from the current tab (per the Track O spec — clicking the new tab is
 * what switches the workspace context).
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=trackO VISIVO_SANDBOX_BACKEND_PORT=8041 \
 *   VISIVO_SANDBOX_FRONTEND_PORT=3041 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3041 npx playwright test workspace-tabs-context-menu
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

async function gotoWorkspace(page, path = '/workspace') {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 15000 });
}

async function expandSubsection(page, type) {
  const header = page.getByTestId(`library-subsection-${type}-header`);
  await expect(header).toBeVisible({ timeout: 10000 });
  await header.hover();
  await header.click();
}

test.describe('Right-click "Open in new tab" (VIS-811)', () => {
  test('Library row → Open in new tab adds a background tab, focus unchanged', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await expandSubsection(page, 'chart');
    const row = page.getByTestId('library-row-chart-simple-scatter-chart');
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.hover();
    await row.click({ button: 'right' });
    const menu = page.getByTestId('library-row-chart-simple-scatter-chart-context-menu');
    await expect(menu).toBeVisible();

    const item = menu.getByText('Open in new tab');
    await item.hover();
    await item.click();

    // The chart tab joins the strip but the project tab keeps focus.
    const chartTab = page.getByTestId('workspace-tab-chart:simple-scatter-chart');
    await expect(chartTab).toBeVisible();
    await expect(chartTab).toHaveAttribute('data-active', 'false');
    await expect(page.locator('[data-testid^="workspace-tab-project:"]')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Clicking the new tab is what switches the context.
    const select = page.getByTestId('workspace-tab-select-chart:simple-scatter-chart');
    await select.hover();
    await select.click();
    await expect(chartTab).toHaveAttribute('data-active', 'true');
  });

  test('Project Editor tile → Open / Open in new tab', async ({ page }) => {
    await gotoWorkspace(page);
    const tile = page.getByTestId(`project-tile-${DASHBOARD}`);
    await expect(tile).toBeVisible({ timeout: WAIT });

    await tile.hover();
    await tile.click({ button: 'right' });
    const menu = page.getByTestId(`project-tile-ctx-${DASHBOARD}-menu`);
    await expect(menu).toBeVisible();

    const openNew = page.getByTestId(`project-tile-ctx-${DASHBOARD}-open-new-tab`);
    await openNew.hover();
    await openNew.click();

    const dashTab = page.getByTestId(`workspace-tab-dashboard:${DASHBOARD}`);
    await expect(dashTab).toBeVisible();
    await expect(dashTab).toHaveAttribute('data-active', 'false');
    await expect(page.locator('[data-testid^="workspace-tab-project:"]')).toHaveAttribute(
      'data-active',
      'true'
    );

    // "Open" (foreground) on a second right-click switches the context.
    await tile.hover();
    await tile.click({ button: 'right' });
    const open = page.getByTestId(`project-tile-ctx-${DASHBOARD}-open`);
    await open.hover();
    await open.click();
    await expect(dashTab).toHaveAttribute('data-active', 'true');
  });

  test('Canvas chart item → Open in new tab keeps the dashboard tab focused', async ({
    page,
  }) => {
    await gotoWorkspace(page, `/workspace/dashboard/${DASHBOARD}`);
    await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
    const item = page.locator('[data-canvas-path="row.0.item.0"]').first();
    await expect(item).toBeVisible({ timeout: WAIT });

    // The canvas item overlays a live Plotly chart — force the real-cursor
    // right-click past the actionability false-positive.
    await item.hover({ force: true });
    await item.click({ button: 'right', force: true });
    const menu = page.getByTestId('canvas-context-menu');
    await expect(menu).toBeVisible();

    const openNew = page.getByTestId('canvas-ctx-open-new-tab');
    await expect(openNew).toBeVisible();
    await openNew.hover();
    await openNew.click();

    // The chart tab joined the strip; the dashboard tab keeps focus.
    const chartTab = page.locator('[data-testid^="workspace-tab-chart:"]');
    await expect(chartTab).toHaveCount(1);
    await expect(chartTab).toHaveAttribute('data-active', 'false');
    await expect(
      page.getByTestId(`workspace-tab-dashboard:${DASHBOARD}`)
    ).toHaveAttribute('data-active', 'true');
  });

  test('Lineage node → Open in new tab background-opens the node object', async ({ page }) => {
    await gotoWorkspace(page, `/workspace/dashboard/${DASHBOARD}`);
    // Flip the middle pane to the Lineage lens via the sub-bar segmented control.
    const lineageSeg = page.getByTestId('workspace-lens-picker-option-lineage');
    await expect(lineageSeg).toBeVisible({ timeout: WAIT });
    await lineageSeg.hover();
    await lineageSeg.click();
    await expect(page.getByTestId('lineage-canvas')).toBeVisible({ timeout: WAIT });

    // Wait for React Flow to draw nodes, then right-click the first one.
    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible({ timeout: WAIT });
    await node.hover();
    await node.click({ button: 'right' });

    const menu = page.getByTestId('lineage-node-ctx-menu');
    await expect(menu).toBeVisible();
    const openNew = page.getByTestId('lineage-node-ctx-open-new-tab');
    await openNew.hover();
    await openNew.click();
    await expect(menu).not.toBeVisible();

    // A new background tab joined the strip; the dashboard tab keeps focus.
    const tabCount = await page
      .getByTestId('workspace-tab-strip')
      .locator('[role="tab"]')
      .count();
    expect(tabCount).toBeGreaterThanOrEqual(3); // project + dashboard + the node's tab
    await expect(
      page.getByTestId(`workspace-tab-dashboard:${DASHBOARD}`)
    ).toHaveAttribute('data-active', 'true');
  });
});
