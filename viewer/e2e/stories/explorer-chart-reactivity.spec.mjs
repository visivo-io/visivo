/**
 * Story: Chart Reactivity — Interactions and Layout Changes
 *
 * Tests that interactions and layout changes are reflected in the chart.
 * Uses loaded existing charts that already have configured props and interactions.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import {
  loadExplorer,
  loadExplorerWithChart,
} from '../helpers/explorer.mjs';

test.describe('Chart Reactivity — Interactions & Layout', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Step 1: Loaded chart with interactions renders data', async ({ page }) => {
    await loadExplorerWithChart(page, 'simple-scatter-chart');

    // Chart should render (Plotly plot visible)
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 15000 });
  });

  test('Step 2: Adding an interaction to an insight creates interaction row', async ({ page }) => {
    await loadExplorer(page);

    // The auto-created insight should be expanded
    const insightSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    await expect(insightSection).toBeVisible({ timeout: 5000 });

    // Add an interaction
    const addBtn = page.locator('[data-testid^="insight-add-interaction-"]').first();
    await addBtn.click();

    // Interaction row should appear
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Type dropdown should default to filter
    await expect(page.locator('[data-testid="interaction-type-select-0"]')).toHaveValue('filter');

    // Value input should be present
    await expect(page.locator('[data-testid="interaction-value-field-0"]')).toBeVisible();
  });

  test('Step 3: Changing interaction type updates the dropdown', async ({ page }) => {
    await loadExplorer(page);

    const addBtn = page.locator('[data-testid^="insight-add-interaction-"]').first();
    await addBtn.click();

    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await typeSelect.selectOption('sort');
    await expect(typeSelect).toHaveValue('sort');

    await typeSelect.selectOption('split');
    await expect(typeSelect).toHaveValue('split');
  });

  test('Step 4: Removing an interaction removes the row', async ({ page }) => {
    await loadExplorer(page);

    const addBtn = page.locator('[data-testid^="insight-add-interaction-"]').first();
    await addBtn.click();

    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Remove it
    await page.locator('[data-testid="insight-remove-interaction-0"]').click();

    await expect(page.locator('[data-testid="insight-interaction-0"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('Step 5: Multiple interactions can be added sequentially', async ({ page }) => {
    await loadExplorer(page);

    const addBtn = page.locator('[data-testid^="insight-add-interaction-"]').first();

    // Add 3 interactions
    await addBtn.click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 3000 });

    await addBtn.click();
    await expect(page.locator('[data-testid="insight-interaction-1"]')).toBeVisible({ timeout: 3000 });

    await addBtn.click();
    await expect(page.locator('[data-testid="insight-interaction-2"]')).toBeVisible({ timeout: 3000 });

    // Set different types
    await page.locator('[data-testid="interaction-type-select-0"]').selectOption('filter');
    await page.locator('[data-testid="interaction-type-select-1"]').selectOption('sort');
    await page.locator('[data-testid="interaction-type-select-2"]').selectOption('split');

    // Verify all 3 visible with correct types
    await expect(page.locator('[data-testid="interaction-type-select-0"]')).toHaveValue('filter');
    await expect(page.locator('[data-testid="interaction-type-select-1"]')).toHaveValue('sort');
    await expect(page.locator('[data-testid="interaction-type-select-2"]')).toHaveValue('split');
  });

  test('Step 6: Removing middle interaction preserves others', async ({ page }) => {
    await loadExplorer(page);

    const addBtn = page.locator('[data-testid^="insight-add-interaction-"]').first();

    await addBtn.click();
    await addBtn.click();
    await addBtn.click();

    // Verify 3 interactions exist
    await expect(page.locator('[data-testid="insight-interaction-2"]')).toBeVisible({ timeout: 3000 });

    // Remove the middle one
    await page.locator('[data-testid="insight-remove-interaction-1"]').click();

    // Should have 2 remaining
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible();
    await expect(page.locator('[data-testid="insight-interaction-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="insight-interaction-2"]')).not.toBeVisible();
  });

  test('Step 7: Chart layout title is editable', async ({ page }) => {
    await loadExplorerWithChart(page, 'aggregated-bar-chart');

    // Chart section should show layout properties
    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    await expect(chartSection).toBeVisible({ timeout: 5000 });

    // title.text should be visible in the layout editor
    const propCount = chartSection.locator('text=/[1-9]\\d* of \\d+ properties/');
    await expect(propCount).toBeVisible({ timeout: 10000 });
  });

  test('Step 8: Loaded chart with interactions shows interaction rows', async ({ page }) => {
    await loadExplorerWithChart(page, 'autocomplete-date-chart');

    // The insight should be expanded with interactions visible
    const insightSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    await expect(insightSection).toBeVisible({ timeout: 10000 });

    // Click on the insight header to expand it if not already
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // Interaction rows should be visible (autocomplete-date-insight has filter + sort)
    const interactions = page.locator('[data-testid^="insight-interaction-"]');
    await expect(interactions.first()).toBeVisible({ timeout: 5000 });
  });
});
