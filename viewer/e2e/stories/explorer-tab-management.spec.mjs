/**
 * Story Group 4: Tab Management
 *
 * US-13:  Create, switch, and close model tabs
 * US-14:  Rename a new model tab
 * US-16:  Cannot close the last tab
 * US-13B: Close active tab switches to another
 * US-23B: Load same model twice — no duplicate tab
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql } from '../helpers/explorer.mjs';

test.describe('Explorer Tab Management', () => {
  test.setTimeout(60000);

  test('US-13: Create, switch, and close model tabs', async ({ page }) => {
    await loadExplorer(page);

    // Click "Add model" — verify "No models" disappears
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('No models')).not.toBeVisible({ timeout: 5000 });

    // Type SQL to mark tab A
    await typeSql(page, 'SELECT 1');
    await page.waitForTimeout(300);

    // Click "Add model" again to create tab B
    await page.locator('[data-testid="add-model-tab"]').click();
    await page.waitForTimeout(500);

    // Verify: Two tabs now exist
    await expect(page.locator('[data-testid="model-tab-model"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="model-tab-model_2"]')).toBeVisible({ timeout: 5000 });

    // Switch back to first tab by clicking its label
    await page.locator('[data-testid="model-tab-model"]').click();
    await page.waitForTimeout(500);

    // Verify first tab is active (has amber bg class indicator)
    await expect(page.locator('[data-testid="model-tab-model"]')).toHaveClass(/bg-amber-50/);

    // Close second tab via close button
    await page.locator('[data-testid="close-tab-model_2"]').click();
    await page.waitForTimeout(500);

    // Verify: Only one tab remains
    await expect(page.locator('[data-testid="model-tab-model"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="model-tab-model_2"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('US-14: Rename a new model tab', async ({ page }) => {
    await loadExplorer(page);

    // Create a new model tab
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Double-click the tab label to initiate rename
    await page.locator('[data-testid="tab-label-model"]').dblclick();
    await page.waitForTimeout(300);

    // Check if rename input appeared
    const renameInput = page.locator('[data-testid="rename-input"]');
    await expect(renameInput).toBeVisible({ timeout: 5000 });

    // Clear existing value and type new name
    await renameInput.fill('my_custom_model');
    await page.waitForTimeout(200);

    // Press Enter to commit
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify: Tab name changed
    await expect(page.locator('[data-testid="tab-label-my_custom_model"]')).toBeVisible({
      timeout: 5000,
    });
    // Old name is gone
    await expect(page.locator('[data-testid="tab-label-model"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('US-16: Cannot close the last tab', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created tab "model" already exists; add a second so we can close one
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Now two tabs exist: "model" and "model_2" — close buttons should be visible
    await expect(page.locator('[data-testid="close-tab-model_2"]')).toBeVisible({ timeout: 3000 });

    // Close the second tab, leaving only "model"
    await page.locator('[data-testid="close-tab-model_2"]').click();
    await page.waitForTimeout(500);

    // Verify: Only one tab remains
    await expect(page.locator('[data-testid="model-tab-model"]')).toBeVisible({ timeout: 5000 });

    // Verify: No close button is present when there is only one tab
    await expect(page.locator('[data-testid="close-tab-model"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('US-13B: Close active tab switches to another', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created tab "model" already exists; add one more to have two tabs
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Verify second tab (model_2) is active (it gets activated on creation)
    await expect(page.locator('[data-testid="model-tab-model_2"]')).toHaveClass(/bg-amber-50/);

    // Close the active (second) tab
    await page.locator('[data-testid="close-tab-model_2"]').click();
    await page.waitForTimeout(500);

    // Verify: First tab becomes active
    await expect(page.locator('[data-testid="model-tab-model"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="model-tab-model"]')).toHaveClass(/bg-amber-50/);

    // Verify second tab is gone
    await expect(page.locator('[data-testid="model-tab-model_2"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('US-23B: Load same model twice — no duplicate tab', async ({ page }) => {
    await loadExplorer(page);

    // Click model "test-table" in left panel
    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(1000);

    // Verify: Tab created
    await expect(page.locator('[data-testid="model-tab-test-table"]')).toBeVisible({
      timeout: 5000,
    });

    // Count tabs: should be exactly 1
    const tabCountBefore = await page.locator('[data-testid^="model-tab-"]').count();

    // Click "test-table" again
    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(1000);

    // Verify: Still only one tab (no duplicate)
    const tabCountAfter = await page.locator('[data-testid^="model-tab-"]').count();
    expect(tabCountAfter).toBe(tabCountBefore);
  });
});
