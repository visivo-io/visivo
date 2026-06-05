/**
 * Story: Dashboards in the Library Layout Items section (VIS-824)
 *
 * Validates that dashboards surface in the Library left rail under the
 * Layout Items section (alongside Charts / Tables / Markdowns / Inputs) and
 * that clicking a dashboard row scopes the middle pane to that dashboard —
 * an independent dashboard navigation path from the Library that does not
 * depend on the Project Editor or Workspace tabs.
 *
 * Precondition: Sandbox running on :3001/:8001
 *   visivo serve --port 8001 (in test-projects/integration)
 *   yarn start:sandbox (Vite on :3001 proxying to :8001)
 *
 * NOTE: Not run as part of this ticket — dev ports were occupied. Authored to
 * lock down the flow for the next sandbox run.
 */

import { test, expect } from '@playwright/test';

test.describe('Library — Dashboards in Layout Items (VIS-824)', () => {
  test('Step 1: Workspace left rail shows the Layout Items section', async ({ page }) => {
    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-section-layout')).toBeVisible();
    await expect(page.getByTestId('library-section-layout-header')).toContainText('Layout Items');
  });

  test('Step 2: Dashboards render as a Layout-Items subsection with a Dashboards chip', async ({
    page,
  }) => {
    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');

    // The per-type Dashboards subsection lives inside the Layout Items section.
    await expect(page.getByTestId('library-subsection-dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('library-subsection-dashboard-header')).toContainText(
      'Dashboards'
    );

    // The Layout Items filter chips include a "Dashboards" chip.
    await expect(page.getByTestId('library-filter-chip-layout-dashboard')).toBeVisible();
    await expect(page.getByTestId('library-filter-chip-layout-dashboard')).toContainText(
      'Dashboards'
    );
  });

  test('Step 3: Per-section search narrows to dashboards', async ({ page }) => {
    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');

    // Click the Dashboards filter chip — Charts / Tables / etc. subsections drop.
    await page.getByTestId('library-filter-chip-layout-dashboard').click();
    await expect(page.getByTestId('library-subsection-dashboard')).toBeVisible();
    await expect(page.getByTestId('library-subsection-chart')).toHaveCount(0);
  });

  test('Step 4: Clicking a dashboard row scopes the middle pane to that dashboard', async ({
    page,
  }) => {
    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');

    // Library per-type subsections are collapsed by default (VIS-828), so the
    // dashboard rows are not rendered until the subsection is expanded. Click its
    // header to expand before grabbing a row.
    await page.getByTestId('library-subsection-dashboard-header').click();

    // Grab the first dashboard row inside the dashboard subsection.
    const dashboardRow = page
      .getByTestId('library-subsection-dashboard-rows')
      .locator('[data-testid^="library-row-dashboard-"]')
      .first();
    await expect(dashboardRow).toBeVisible({ timeout: 10000 });
    await dashboardRow.click();

    // The middle pane now scopes to the dashboard, exposing the Canvas +
    // Lineage lenses for that dashboard.
    await expect(page.getByTestId('workspace-middle-dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workspace-subbar-dashboard')).toContainText('dashboard');

    // The clicked row reflects the active selection.
    await expect(dashboardRow).toHaveAttribute('data-selected', 'true');
  });
});
