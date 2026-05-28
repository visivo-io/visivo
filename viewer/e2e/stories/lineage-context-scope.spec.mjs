/**
 * Story: Lineage Context Scope (VIS-E1 / VIS-779)
 *
 * Exercises the LineageCanvas scope chrome that wraps the existing
 * <LineageNew> DAG in the Workspace middle pane's lineage lens:
 *
 *   1. Open a dashboard in the Workspace and switch the middle-pane lens to
 *      "Lineage" — the LineageCanvas mounts (no "coming soon" placeholder).
 *   2. The scope-indicator strip shows the dashboard scope and the
 *      "Show full project" affordance is present (scope is non-root).
 *   3. The underlying <LineageNew> selector input is seeded with the
 *      scope-derived selector (`+<dashboardName>`).
 *   4. Clicking "Show full project" widens the scope back to `*` (the
 *      selector input clears) and the reset affordance disappears — all
 *      without leaving the /workspace/dashboard/<name> route.
 *
 * Precondition: Sandbox running on :3001/:8001 (NEVER :3000).
 *   bash scripts/sandbox.sh start
 *
 * NB: authored under VIS-E1 but NOT run as part of the ticket (a dev server is
 * already occupying the user's ports). Run with:
 *   cd viewer && npx playwright test e2e/stories/lineage-context-scope.spec.mjs --reporter=list
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Lineage Context Scope', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  /** @type {import('@playwright/test').Page} */
  let page;
  let dashboardName;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });

    // Discover a dashboard name from the project so the story is data-driven.
    await page.goto('/api/project/');
    const projectText = await page.locator('body').innerText();
    let project;
    try {
      project = JSON.parse(projectText);
    } catch {
      project = null;
    }
    const dashboards =
      project?.project_json?.dashboards || project?.dashboards || [];
    dashboardName = dashboards[0]?.name;

    test.skip(!dashboardName, 'No dashboards in the sandbox project');

    await page.goto(`/workspace/dashboard/${encodeURIComponent(dashboardName)}`);
    await page.waitForLoadState('networkidle');
    await page
      .getByTestId('workspace-subbar-dashboard')
      .waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: switching the lens to Lineage mounts LineageCanvas', async () => {
    // The sub-bar PreviewLensPicker exposes a Lineage tab in a Segmented control.
    await page.getByRole('tab', { name: /lineage/i }).first().click();
    await expect(page.getByTestId('workspace-middle-dashboard-lineage')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await expect(page.getByText(/Lineage view coming soon/i)).toHaveCount(0);
  });

  test('Step 2: scope-indicator strip shows the dashboard scope', async () => {
    await expect(page.getByTestId('lineage-canvas-scope-bar')).toBeVisible();
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(
      dashboardName
    );
    await expect(page.getByTestId('lineage-canvas-reset-scope')).toBeVisible();
  });

  test('Step 3: LineageNew selector input is seeded with +<dashboardName>', async () => {
    const selectorInput = page.locator('input[placeholder*="source_name"]');
    await expect(selectorInput).toHaveValue(`+${dashboardName}`);
  });

  test('Step 4: "Show full project" widens scope to * without changing route', async () => {
    await page.getByTestId('lineage-canvas-reset-scope').click();

    // The reset affordance vanishes (we are now at the full-project scope)…
    await expect(page.getByTestId('lineage-canvas-reset-scope')).toHaveCount(0);
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(
      /full project/i
    );
    // …the selector input clears (`*` normalises to the empty "show all" state)…
    const selectorInput = page.locator('input[placeholder*="source_name"]');
    await expect(selectorInput).toHaveValue('');
    // …and the route is unchanged.
    await expect(page).toHaveURL(
      new RegExp(`/workspace/dashboard/${dashboardName}`)
    );
  });

  test('Step 5: selecting a non-dashboard node defaults the middle pane to the universal Lineage lens (VIS-779)', async () => {
    // Round-trip a node click into the workspace selection. The clicked object
    // becomes the active (non-dashboard) object, and PerObjectPane defaults to
    // the universal Lineage lens — so LineageCanvas stays mounted (no Track N
    // placeholder) without the user touching the lens picker.
    const node = page.locator('.react-flow__node').first();
    await node.waitFor({ timeout: WAIT_FOR_PAGE });
    await node.click();

    await expect(page.getByTestId('lineage-canvas')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    await expect(
      page.getByText(/Per-object preview coming soon \(Track N\)/i)
    ).toHaveCount(0);
  });

  test('Step 6: no console errors during the flow', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
