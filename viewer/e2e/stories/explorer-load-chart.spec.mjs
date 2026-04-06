/**
 * Story: Load Existing Chart (Design Spec Story 3)
 *
 * Precondition: Sandbox running on :3001/:8001 with integration test project.
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Explorer Load Existing Chart', () => {
  test.setTimeout(60000);

  test('Step 1: Click chart in left nav loads it', async ({ page }) => {
    await loadExplorerWithChart(page, 'simple-scatter-chart');

    await expect(page.getByText('simple-scatter-chart').first()).toBeVisible({ timeout: 10000 });
  });

  test('Step 2: Loaded chart has disabled save', async ({ page }) => {
    await loadExplorerWithChart(page, 'simple-scatter-chart');

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
      timeout: 5000,
    });
  });

  test('Step 3: Loaded chart shows layout properties in right panel', async ({ page }) => {
    await loadExplorerWithChart(page, 'aggregated-bar-chart');

    // Chart section should be visible and expanded
    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    await expect(chartSection).toBeVisible({ timeout: 5000 });

    // Layout properties should show non-zero count (chart has title, etc.)
    // Wait for schema to load and properties to populate
    const propCount = chartSection.locator('text=/[1-9]\\d* of \\d+ properties/');
    await expect(propCount).toBeVisible({ timeout: 10000 });
  });
});
