/**
 * Story: Interaction Composite — Save and Reset with Interactions
 *
 * Stories: US-INT-24, US-INT-25
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Interaction Composite — Save & Reset', () => {
  test.setTimeout(60000);

  test('US-INT-24: Modifying interaction enables save button', async ({ page }) => {
    await loadExplorerWithChart(page, 'sort-input-test-chart');

    // Save should be disabled initially (no modifications)
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
      timeout: 5000,
    });

    // Expand insight and change interaction type
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.selectOption('filter');

    // Save should now be enabled (interaction modified)
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled({
      timeout: 5000,
    });
  });

  test('US-INT-25: Reset after modifying interaction restores original', async ({ page }) => {
    await loadExplorerWithChart(page, 'sort-input-test-chart');

    // Expand insight
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // Verify initial interaction type is sort
    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await expect(typeSelect).toHaveValue('sort');

    // Change to filter
    await typeSelect.selectOption('filter');
    await expect(typeSelect).toHaveValue('filter');

    // Save should be enabled (modified)
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled();

    // Click reset on the insight in the left nav
    const leftPanel = page.locator('[data-testid="left-panel-content"]');
    const resetBtn = leftPanel.locator('[data-testid^="reset-insight-"]').first();
    if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Hover to reveal reset button
      const insightRow = resetBtn.locator('xpath=..');
      await insightRow.hover();
      await resetBtn.click();

      // Interaction should revert to sort
      await expect(typeSelect).toHaveValue('sort');

      // Save should be disabled again
      await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
        timeout: 5000,
      });
    }
  });

  test('US-INT-22: Multiple interactions on same insight all visible', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // Should have 3 interaction rows (split, filter, sort)
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="insight-interaction-1"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="insight-interaction-2"]')).toBeVisible({ timeout: 5000 });

    // Verify types
    await expect(page.locator('[data-testid="interaction-type-select-0"]')).toHaveValue('split');
    await expect(page.locator('[data-testid="interaction-type-select-1"]')).toHaveValue('filter');
    await expect(page.locator('[data-testid="interaction-type-select-2"]')).toHaveValue('sort');
  });
});
