/**
 * Story Group 3: Insight CRUD
 *
 * US-9:  Create insight and change type
 * US-10: Add multiple insights to a chart
 * US-11: Remove insight from chart
 * US-11B: Remove all insights — chart still exists
 * US-12: Add interaction to insight
 *
 * Note: An insight is auto-created on first visit (named "insight").
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer } from '../helpers/explorer.mjs';

test.describe('Explorer Insight CRUD', () => {
  test.setTimeout(60000);

  test('US-9: Create insight and change type', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created insight already exists as "insight"
    const insightSection = page.locator('[data-testid="insight-crud-section-insight"]');
    await expect(insightSection).toBeVisible({ timeout: 5000 });

    // It should be auto-expanded with type select visible
    const typeSelect = page.locator('[data-testid="insight-type-select-insight"]');
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await expect(typeSelect).toHaveValue('scatter');

    // Change type to "bar"
    await typeSelect.selectOption('bar');

    // Verify type changed
    await expect(typeSelect).toHaveValue('bar');
  });

  test('US-10: Add multiple insights to a chart', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created "insight" already exists. Add two more.
    await page.locator('[data-testid="right-panel-add-insight"]').click();
    await page.locator('[data-testid="right-panel-add-insight"]').click();

    // Verify: Three insight sections exist (auto-created + 2 new)
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="insight-crud-section-insight_2"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="insight-crud-section-insight_3"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('US-11: Remove insight from chart', async ({ page }) => {
    await loadExplorer(page);

    // Add another insight alongside auto-created "insight"
    await page.locator('[data-testid="right-panel-add-insight"]').click();

    // Verify both are visible
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="insight-crud-section-insight_2"]')
    ).toBeVisible({ timeout: 5000 });

    // Remove the auto-created insight via the X button
    await page.locator('[data-testid="insight-remove-insight"]').click();

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

    // Auto-created insight exists
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).toBeVisible({ timeout: 5000 });

    // Remove it
    await page.locator('[data-testid="insight-remove-insight"]').click();

    // Verify: Insight section gone
    await expect(
      page.locator('[data-testid="insight-crud-section-insight"]')
    ).not.toBeVisible({ timeout: 5000 });

    // Verify: Chart still exists (chart header visible)
    const chartHeader = page.locator('[data-testid="chart-header"]');
    await expect(chartHeader).toBeVisible({ timeout: 5000 });
    await expect(chartHeader).toContainText('Chart:');
    await expect(chartHeader.getByTestId('chart-name-input')).toHaveValue('Untitled', { timeout: 5000 });

    // Verify: No insight sections remain
    const insightSections = page.locator('[data-testid^="insight-crud-section-"]');
    expect(await insightSections.count()).toBe(0);
  });

  test('US-12: Add interaction to insight', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created "insight" is already expanded
    // Click "Add Interaction" button within it
    await page.locator('[data-testid="insight-add-interaction-insight"]').click();

    // Verify: Interaction row appears with a type dropdown (filter/split/sort)
    const interactionRow = page.locator('[data-testid="insight-interaction-0"]');
    await expect(interactionRow).toBeVisible({ timeout: 5000 });

    // Verify: Type dropdown defaults to "filter"
    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await expect(typeSelect).toHaveValue('filter');

    // Verify: Value input is present
    await expect(
      page.locator('[data-testid="interaction-value-field-0"]')
    ).toBeVisible({ timeout: 5000 });
  });
});
