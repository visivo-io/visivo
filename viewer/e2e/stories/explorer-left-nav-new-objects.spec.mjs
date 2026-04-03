/**
 * Story: Left Nav — New Objects with Green Dot Indicators
 *
 * Bug: ExplorerLeftPanel only renders API-fetched objects (s.models, s.insights).
 * Explorer-created objects from explorerModelStates/explorerInsightStates never
 * appear in the left nav. New objects should show with a green dot indicator
 * and be deletable.
 *
 * These tests document what SHOULD happen and will FAIL until the bug is fixed.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

/** Add a computed column via the popover. */
async function addComputedColumn(page, name, expression) {
  const addBtn = page.locator('[data-testid="add-computed-column-btn"]');
  if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) return false;

  await addBtn.click();
  await page.waitForTimeout(500);

  const popover = page.locator('[data-testid="add-computed-column-popover"]');
  await popover.locator('input').first().fill(name);
  await popover.locator('textarea, input').last().fill(expression);
  await page.waitForTimeout(2000);

  const confirmBtn = popover.getByRole('button', { name: /add/i });
  if (!(await confirmBtn.isEnabled({ timeout: 3000 }).catch(() => false))) return false;

  await confirmBtn.click();
  await page.waitForTimeout(1000);
  return true;
}

test.describe('Left Nav — New Objects with Green Dots', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Step 1: New model with SQL appears in left nav Models section with green dot', async ({
    page,
  }) => {
    await loadExplorer(page);

    // Type SQL to make the auto-created model "new" with content
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await page.waitForTimeout(500);

    // The auto-created model name (e.g., "model") should appear in the left nav Models section
    // with a green dot indicating it's new
    const leftPanel = page.locator('[data-testid="left-panel-content"]');

    // Look for the model name in the Models section of the left panel
    // The model tab name is auto-generated (typically "model")
    const modelEntry = leftPanel.locator('text=model').first();
    await expect(modelEntry).toBeVisible({ timeout: 5000 });

    // Should have a green status dot
    const greenDot = leftPanel.locator('.bg-green-500').first();
    await expect(greenDot).toBeVisible({ timeout: 3000 });
  });

  test('Step 2: Auto-created insight appears in left nav Insights section with green dot', async ({
    page,
  }) => {
    await loadExplorer(page);

    // The auto-created insight should already appear in the left nav Insights section
    const leftPanel = page.locator('[data-testid="left-panel-content"]');

    // The insight count should include the auto-created one (20 from API + 1 new = 21)
    await expect(page.getByText('Insights (21)')).toBeVisible({ timeout: 10000 });

    // A green dot should be visible in the left panel for the new insight
    const greenDots = leftPanel.locator('.bg-green-500');
    await expect(greenDots.first()).toBeVisible({ timeout: 3000 });
  });

  test('Step 3: Metric computed column appears in left nav Metrics section', async ({ page }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    await addComputedColumn(page, 'total_x', 'SUM(x)');

    // The metric should appear in the Metrics section of the left panel
    const metricsSection = page.locator('[data-testid="section-metrics"]');
    await expect(metricsSection).toBeVisible({ timeout: 5000 });

    // The metric name should be visible as a draggable item
    const metricItem = metricsSection.getByText('total_x');
    await expect(metricItem).toBeVisible({ timeout: 3000 });
  });

  test('Step 4: Dimension computed column appears in left nav Dimensions section', async ({
    page,
  }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    await addComputedColumn(page, 'x_label', 'CAST(x AS VARCHAR)');

    // The dimension should appear in the Dimensions section of the left panel
    const dimensionsSection = page.locator('[data-testid="section-dimensions"]');
    await expect(dimensionsSection).toBeVisible({ timeout: 5000 });

    const dimensionItem = dimensionsSection.getByText('x_label');
    await expect(dimensionItem).toBeVisible({ timeout: 3000 });
  });

  test('Step 5: Multiple new objects appear simultaneously in their sections', async ({
    page,
  }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    // Add insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Add metric computed column
    await addComputedColumn(page, 'total_x', 'SUM(x)');

    // Add dimension computed column
    await addComputedColumn(page, 'x_label', 'CAST(x AS VARCHAR)');

    const leftPanel = page.locator('[data-testid="left-panel-content"]');

    // Model should be in left nav
    const modelEntry = leftPanel.locator('text=model').first();
    await expect(modelEntry).toBeVisible({ timeout: 5000 });

    // Insight should be in left nav
    const insightEntry = leftPanel.getByText('insight').first();
    await expect(insightEntry).toBeVisible({ timeout: 3000 });

    // Metric should be in left nav
    const metricEntry = leftPanel.getByText('total_x');
    await expect(metricEntry).toBeVisible({ timeout: 3000 });

    // Dimension should be in left nav
    const dimensionEntry = leftPanel.getByText('x_label');
    await expect(dimensionEntry).toBeVisible({ timeout: 3000 });
  });

  test.skip('Step 6: Deleting a new object from left nav removes it from explorer store', async ({
    page,
  }) => {
    await loadExplorer(page);

    // Create an insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    const leftPanel = page.locator('[data-testid="left-panel-content"]');

    // Find the new insight in the left nav
    const insightEntry = leftPanel.getByRole('button', { name: 'insight', exact: true });
    await expect(insightEntry).toBeVisible({ timeout: 5000 });

    // There should be a delete/remove action for new objects
    // Hover or right-click to reveal delete option
    await insightEntry.hover();
    await page.waitForTimeout(300);

    const deleteBtn = leftPanel.locator('[data-testid*="delete"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });

    await deleteBtn.click();
    await page.waitForTimeout(500);

    // Insight should no longer appear in left nav
    await expect(insightEntry).not.toBeVisible({ timeout: 3000 });

    // Insight should also not appear in the right panel
    const insightSection = page.locator('[data-testid^="insight-crud-section-insight"]');
    await expect(insightSection).not.toBeVisible({ timeout: 3000 });
  });

  test('Step 7: Search in left nav includes new explorer-created objects', async ({ page }) => {
    await loadExplorer(page);

    // Create an insight (auto-named "insight")
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Search for the new insight name
    const searchInput = page.locator('[data-testid="left-panel-search"]');
    await searchInput.fill('insight');
    await page.waitForTimeout(500);

    // The new insight should appear in filtered results in the left nav
    const leftPanel = page.locator('[data-testid="left-panel-content"]');
    const insightEntry = leftPanel.getByText('insight').first();
    await expect(insightEntry).toBeVisible({ timeout: 5000 });
  });

  test('Step 8: Green dot distinguishes new objects from existing ones', async ({ page }) => {
    await loadExplorer(page);

    const leftPanel = page.locator('[data-testid="left-panel-content"]');

    // Existing models (from API) should NOT have green dots
    // Wait for models to load
    await expect(page.getByText('Models (7)')).toBeVisible({ timeout: 10000 });

    // Click on an existing model to verify it has no green dot
    const existingModel = leftPanel.getByRole('button', { name: 'test-table', exact: true });
    await expect(existingModel).toBeVisible();

    // No green dot on existing models
    const existingGreenDot = existingModel.locator('xpath=..').locator('.bg-green-500');
    await expect(existingGreenDot).not.toBeVisible();

    // Now type SQL to make the auto-created new model "dirty"
    await typeSql(page, 'SELECT 1');
    await page.waitForTimeout(500);

    // New model in left nav should have green dot
    // Find the new model entry (auto-created, typically named "model")
    const newModelGreenDot = leftPanel.locator('.bg-green-500').first();
    await expect(newModelGreenDot).toBeVisible({ timeout: 5000 });
  });
});
