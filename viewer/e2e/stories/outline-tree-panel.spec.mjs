/**
 * Story: Outline Tree Panel (VIS-793 / Track F F-3)
 *
 * Exercises the right-rail Outline tab's tree of the scoped dashboard:
 *   - The Outline tab mounts the tree (not the old "coming soon" placeholder).
 *   - The tree renders dashboard → row → item nodes.
 *   - Clicking a node updates the workspace selection (mulberry highlight).
 *   - "+ Add row" appends a new row to the tree.
 *
 * Canvas live-sync (drag-reorder updates the tree) depends on Track D (the
 * canvas), which is not built yet — that assertion is intentionally omitted.
 *
 * Precondition: Sandbox running on :3001/:8001
 *   visivo serve --port 8001 (in test-projects/integration)
 *   yarn start:sandbox (Vite on :3001 proxying to :8001)
 *
 * NOTE: This spec is authored but NOT run as part of VIS-793 — the user's dev
 * server occupies the standard ports. Run via the sandbox harness:
 *   cd viewer && npx playwright test e2e/stories/outline-tree-panel.spec.mjs
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

// A dashboard that exists in the integration test project.
const DASHBOARD = 'simple-dashboard';

test.describe('Outline Tree Panel', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  test('Step 1: scoped workspace mounts the Outline tree under the Outline tab', async ({
    page,
  }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    // Switch the right rail to the Outline tab.
    await page
      .getByTestId('workspace-right-rail-tab-outline')
      .click({ timeout: WAIT_FOR_PAGE });

    // The real tree mounts; the old placeholder copy is gone.
    await expect(page.getByTestId('workspace-right-rail-outline')).toBeVisible();
    await expect(page.getByText('Outline tree coming soon')).toHaveCount(0);

    const realErrors = consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Step 2: tree renders the dashboard root and its rows', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail-tab-outline').click();

    // Dashboard root node carries the dashboard name.
    const root = page.getByTestId('outline-tree-node-dashboard');
    await expect(root).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await expect(root).toContainText(DASHBOARD);

    // At least one row node exists.
    await expect(page.getByTestId('outline-tree-node-row.0')).toBeVisible();
  });

  test('Step 3: clicking a row selects it (mulberry highlight)', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail-tab-outline').click();

    const row0 = page.getByTestId('outline-tree-node-row.0');
    await expect(row0).toBeVisible({ timeout: WAIT_FOR_PAGE });
    await row0.click();
    await expect(row0).toHaveAttribute('data-selected', 'true');

    // Selecting a row deselects the dashboard root.
    await expect(page.getByTestId('outline-tree-node-dashboard')).toHaveAttribute(
      'data-selected',
      'false'
    );
  });

  test('Step 4: "+ Add row" appends a new row to the tree', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail-tab-outline').click();

    await expect(page.getByTestId('outline-tree-node-row.0')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    const before = await page
      .locator('[data-testid^="outline-tree-node-row."]')
      .count();

    await page.getByTestId('outline-tree-add-row').click();

    await expect
      .poll(async () =>
        page.locator('[data-testid^="outline-tree-node-row."]').count()
      )
      .toBeGreaterThan(before);
  });
});
