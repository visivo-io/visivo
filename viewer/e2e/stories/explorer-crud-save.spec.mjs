/**
 * Story: Explorer CRUD — Save, Modification Tracking, Status Dots
 *
 * Tests the save modal, modification detection, status dots, and save lifecycle.
 *
 * Stories: US-CRUD-1 through US-CRUD-20
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart, loadExplorer, typeSql, runQuery } from '../helpers/explorer.mjs';

test.describe('Explorer CRUD — Save & Modification Tracking', () => {
  test.setTimeout(60000);

  test('US-CRUD-2: Save modified insight succeeds without validation error', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    // Expand insight section
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();
    await page.waitForTimeout(500);

    // Modify the insight type (bar → scatter) to trigger a modification
    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.selectOption('scatter');
    await page.waitForTimeout(500);

    // Click Save to Project button
    const saveButton = page.locator('button:has-text("Save to Project")');
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Save modal should appear
    await expect(page.getByText('Save to Project').first()).toBeVisible({ timeout: 5000 });

    // Click the Save button in the modal
    const modalSaveBtn = page.locator('button:has-text("Save")').last();
    await modalSaveBtn.click();

    // Should NOT show a validation error about ('props', 'type'): Field required
    await page.waitForTimeout(2000);
    const errorText = page.locator('text=/Invalid insight configuration/');
    await expect(errorText).not.toBeVisible({ timeout: 3000 });

    // Modal should close on success
    await expect(page.locator('button:has-text("Cancel")')).not.toBeVisible({ timeout: 3000 });
  });
});
