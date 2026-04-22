/**
 * Story Group: Explorer Responsive Layout
 *
 * US-25: Narrow viewport shows SQL/Chart toggle tabs
 * US-25B: Resize from wide to narrow preserves content without crash
 *
 * The CenterPanel uses a ResizeObserver with NARROW_THRESHOLD = 600px.
 * When the container width falls below 600px, it switches from side-by-side
 * editor+chart to a tabbed SQL/Chart toggle mode.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql } from '../helpers/explorer.mjs';

test.describe('Explorer Responsive Layout', () => {
  test.setTimeout(60000);

  test('US-25: Narrow viewport shows SQL/Chart tabs', async ({ page }) => {
    // Set narrow viewport before loading
    await page.setViewportSize({ width: 500, height: 800 });

    await loadExplorer(page);

    // In narrow mode, the SQL and Chart toggle buttons should be visible
    const sqlToggle = page.locator('[data-testid="toggle-sql"]');
    const chartToggle = page.locator('[data-testid="toggle-chart"]');

    await expect(sqlToggle).toBeVisible({ timeout: 10000 });
    await expect(chartToggle).toBeVisible({ timeout: 10000 });

    // Click Chart tab
    await chartToggle.click();
    await page.waitForTimeout(500);

    // Chart section should be visible (the empty state text or chart preview)
    // The chart toggle should have the active styling
    await expect(chartToggle).toBeVisible();

    // Click SQL tab to go back
    await sqlToggle.click();
    await page.waitForTimeout(500);

    // The Run button should be visible in the editor section
    await expect(page.getByRole('button', { name: 'Run' })).toBeVisible({ timeout: 5000 });
  });

  test('US-25B: Resize from wide to narrow activates toggle mode', async ({ page }) => {
    // Start with wide viewport (default is typically 1280x720)
    await page.setViewportSize({ width: 1280, height: 720 });

    await loadExplorer(page);

    // In wide mode, SQL/Chart toggles should NOT be visible (side-by-side layout)
    await expect(page.locator('[data-testid="toggle-sql"]')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="toggle-chart"]')).not.toBeVisible({ timeout: 3000 });

    // Resize to narrow viewport
    await page.setViewportSize({ width: 500, height: 800 });
    await page.waitForTimeout(1000);

    // SQL/Chart toggle tabs should appear
    await expect(page.locator('[data-testid="toggle-sql"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="toggle-chart"]')).toBeVisible({ timeout: 5000 });

    // Verify no crash — Run button should still be accessible
    await expect(page.getByRole('button', { name: 'Run' })).toBeVisible({ timeout: 5000 });
  });
});
