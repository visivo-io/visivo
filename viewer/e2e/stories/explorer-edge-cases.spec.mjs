/**
 * Story Group: Explorer Edge Cases
 *
 * US-22: Search with no results shows empty state
 * US-22B: Search doesn't affect center/right panels
 * US-24: Collapse and expand left panel
 * US-24C: Status dots visible after modification
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithModel, typeSql } from '../helpers/explorer.mjs';

test.describe('Explorer Edge Cases', () => {
  test.setTimeout(60000);

  test('US-22: Search with no results shows empty state', async ({ page }) => {
    await loadExplorer(page);

    // Verify models visible before search
    await expect(page.getByText('Models (7)')).toBeVisible({ timeout: 5000 });

    // Search for something that doesn't exist
    await page.getByPlaceholder('Search...').fill('zzz_nonexistent_thing_xyz');
    await page.waitForTimeout(500);

    // Models section should either not be visible or show 0 count
    const modelsSection = page.getByText('Models (7)');
    await expect(modelsSection).not.toBeVisible({ timeout: 5000 });

    // Clear search
    await page.getByPlaceholder('Search...').fill('');
    await page.waitForTimeout(500);

    // Models section should reappear
    await expect(page.getByText('Models (7)')).toBeVisible({ timeout: 5000 });
  });

  test('US-22B: Search does not affect center/right panels', async ({ page }) => {
    await loadExplorer(page);

    // Load a model to create a tab
    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(2000);

    // Verify center panel has content (model tab is active, no "No models" visible)
    await expect(page.getByText('No models')).not.toBeVisible({ timeout: 5000 });

    // Search for something nonexistent to filter the left panel
    await page.getByPlaceholder('Search...').fill('zzz_nothing');
    await page.waitForTimeout(500);

    // Left panel should be filtered (models section hidden/empty)
    const modelsSection = page.getByText('Models (7)');
    await expect(modelsSection).not.toBeVisible({ timeout: 5000 });

    // Center panel should NOT be affected — the model tab and editor should still be there
    // "No models" should still not be visible (the loaded tab persists)
    await expect(page.getByText('No models')).not.toBeVisible({ timeout: 3000 });

    // Right panel should still show Save to Project button
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeVisible({
      timeout: 3000,
    });
  });

  test('US-24: Collapse and expand left panel', async ({ page }) => {
    await loadExplorer(page);

    // Verify expanded state
    await expect(page.getByText('Models (7)')).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder('Search...')).toBeVisible();

    // Collapse sidebar
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.waitForTimeout(500);

    // Search box should NOT be visible in collapsed state
    await expect(page.getByPlaceholder('Search...')).not.toBeVisible({ timeout: 3000 });

    // Expand sidebar
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.waitForTimeout(500);

    // Search box and models should be visible again
    await expect(page.getByPlaceholder('Search...')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Models (7)')).toBeVisible({ timeout: 3000 });
  });

  test('US-24C: Save button enables after writing SQL in new model', async ({ page }) => {
    await loadExplorer(page);

    // Save should be disabled on fresh load (auto-created empty model does not count)
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
      timeout: 5000,
    });

    // Type SQL into the auto-created model tab — this is a real user action
    await typeSql(page, 'SELECT 1');
    await page.waitForTimeout(500);

    // Save should now be enabled (new model with SQL = modification detected)
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled({
      timeout: 5000,
    });
  });
});
