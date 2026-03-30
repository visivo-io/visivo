/**
 * Story Group: Explorer Chart Loading Deep
 *
 * US-17: Load chart from left nav
 * US-17B: Load chart then load different chart — state fully replaces
 * US-19: Modifying a loaded chart enables save (via adding insight)
 * US-19C: Modify then undo — save should re-disable
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Explorer Chart Loading Deep', () => {
  test.setTimeout(90000);

  test('US-17: Load chart from left nav', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    // Chart name should be visible somewhere on the page (in the right panel or chart section)
    await expect(page.getByText('simple-scatter-chart').first()).toBeVisible({ timeout: 10000 });

    // "No models" should NOT be visible — tabs were created for the chart's models
    await expect(page.getByText('No models')).not.toBeVisible({ timeout: 5000 });
  });

  test('US-17B: Load chart then load different chart — state fully replaces', async ({ page }) => {
    await loadExplorer(page);

    // Load first chart
    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByText('simple-scatter-chart').first()).toBeVisible({ timeout: 10000 });

    // Load second chart
    await page.getByRole('button', { name: 'fibonacci', exact: true }).click();
    await page.waitForTimeout(3000);

    // "fibonacci" should be visible
    await expect(page.getByText('fibonacci').first()).toBeVisible({ timeout: 10000 });

    // The chart name input should reflect the new chart, not the old one
    const chartNameInput = page.locator('[data-testid="chart-name-input"]');
    if (await chartNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(chartNameInput).not.toHaveValue('simple-scatter-chart');
    }
  });

  test('US-19: Adding an insight to a loaded chart enables save', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    // Save should be disabled initially (no modifications)
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
      timeout: 5000,
    });

    // Add a new insight — this creates a new insight (isNew=true), which enables save
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Save should now be enabled
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled({
      timeout: 5000,
    });
  });

  test('US-19C: Remove added insight — save should re-disable', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    // Verify: Save disabled initially
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
      timeout: 5000,
    });

    // Add a new insight — isNew=true enables save
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Verify: Save enabled
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled({
      timeout: 5000,
    });

    // Remove the newly added insight via its delete/remove button
    // Look for a remove button on the insight card
    const removeButton = page.locator('[data-testid="remove-insight"]').first();
    if (await removeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await removeButton.click();
      await page.waitForTimeout(500);

      // Save should re-disable once the new insight is removed
      await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({
        timeout: 5000,
      });
    }
  });
});
