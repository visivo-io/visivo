/**
 * Story Group 3: Insight CRUD
 *
 * US-9:  Create insight and change type
 * US-10: Add multiple insights to a chart
 * US-11: Remove insight from chart
 * US-11B: Remove all insights — chart still exists
 * US-12: Add interaction to insight
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer } from '../helpers/explorer.mjs';

test.describe('Explorer Insight CRUD', () => {
  test.setTimeout(60000);

  test('US-9: Create insight and change type', async ({ page }) => {
    await loadExplorer(page);

    // Click "Add Insight" in the right panel
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);

    // Verify: New insight section appears with default type "scatter"
    const insightSection = page.locator('[data-testid="insight-crud-section-insight"]');
    await expect(insightSection).toBeVisible({ timeout: 5000 });

    // Insight auto-expands on creation (createInsight sets it as active)
    // Verify the type select is visible with default "scatter"
    const typeSelect = page.locator('[data-testid="insight-type-select-insight"]');
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await expect(typeSelect).toHaveValue('scatter');

    // Change type to "bar"
    await typeSelect.selectOption('bar');
    await page.waitForTimeout(300);

    // Verify type changed
    await expect(typeSelect).toHaveValue('bar');
  });

  test('US-10: Add multiple insights to a chart', async ({ page }) => {
    await loadExplorer(page);

    // Click "Add Insight" twice
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);

    // Verify: Two insight sections exist in the right panel
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="insight-crud-section-insight_2"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('US-11: Remove insight from chart', async ({ page }) => {
    await loadExplorer(page);

    // Add 2 insights
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);

    // Verify both are visible
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="insight-crud-section-insight_2"]')
    ).toBeVisible({ timeout: 5000 });

    // Remove the first insight via the X button on the header
    await page.locator('[data-testid="insight-remove-insight"]').click();
    await page.waitForTimeout(500);

    // Verify: First insight gone, second remains
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="insight-crud-section-insight_2"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('US-11B: Remove all insights — chart still exists', async ({ page }) => {
    await loadExplorer(page);

    // Add 1 insight
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);

    // Verify insight is visible
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).toBeVisible({ timeout: 5000 });

    // Remove it
    await page.locator('[data-testid="insight-remove-insight"]').click();
    await page.waitForTimeout(500);

    // Verify: Insight section gone
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).not.toBeVisible({ timeout: 5000 });

    // Verify: "No insights added yet" message in the chart CRUD section
    await expect(page.getByText('No insights added yet')).toBeVisible({ timeout: 5000 });

    // Verify: Chart name input still visible (chart still exists)
    await expect(page.locator('[data-testid="chart-name-input"]')).toBeVisible({ timeout: 5000 });
  });

  test('US-12: Add interaction to insight', async ({ page }) => {
    await loadExplorer(page);

    // Add an insight (it auto-expands because createInsight sets it as active)
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.waitForTimeout(500);

    // Click "Add Interaction" button within the insight section
    await page.locator('[data-testid="insight-add-interaction-insight"]').click();
    await page.waitForTimeout(300);

    // Verify: Interaction row appears with a type dropdown (filter/split/sort)
    const interactionRow = page.locator('[data-testid="insight-interaction-0"]');
    await expect(interactionRow).toBeVisible({ timeout: 5000 });

    // Verify: Type dropdown defaults to "filter"
    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await expect(typeSelect).toHaveValue('filter');

    // Verify: Value input is present
    await expect(
      page.locator('[data-testid="interaction-value-input-0"]')
    ).toBeVisible({ timeout: 5000 });
  });
});
