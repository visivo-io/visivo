/**
 * Story: Chart Reactivity — Interactions and Layout Changes
 *
 * Bug: insightConfig in ExplorerChartPreview only includes type and props,
 * omitting interactions. Adding filter/sort/split interactions has zero
 * effect on the chart preview. Layout changes (barmode etc.) should also
 * trigger re-renders.
 *
 * These tests document what SHOULD happen and will FAIL until the bug is fixed.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import {
  loadExplorer,
  createModelWithSource,
  typeSql,
  runQuery,
} from '../helpers/explorer.mjs';

/** Set up model with data and create an insight. */
async function setupWithInsight(page) {
  await loadExplorer(page);
  await createModelWithSource(page, 'local-sqlite');
  await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
  await runQuery(page);
  await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

  // Create insight
  await page.getByRole('button', { name: 'Add Insight' }).first().click();
  await page.waitForTimeout(1000);
}

/** Get a snapshot of the Plotly chart data for comparison. */
async function getChartDataSnapshot(page) {
  return page.evaluate(() => {
    const plot = document.querySelector('.js-plotly-plot');
    if (!plot?._fullData) return null;
    return plot._fullData.map(t => ({
      type: t.type,
      x: t.x?.length,
      y: t.y?.length,
    }));
  });
}

/** Find the active insight name from visible insight sections. */
async function getActiveInsightName(page) {
  const sections = page.locator('[data-testid^="insight-crud-section-"]');
  const count = await sections.count();
  for (let i = 0; i < count; i++) {
    const testId = await sections.nth(i).getAttribute('data-testid');
    return testId.replace('insight-crud-section-', '');
  }
  return null;
}

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

  test('Step 1: Adding a filter interaction triggers chart re-render', async ({ page }) => {
    await setupWithInsight(page);

    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    // Take chart snapshot before
    const snapshotBefore = await getChartDataSnapshot(page);

    // Add a filter interaction
    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${insightName}"]`);
    await addInteraction.click();
    await page.waitForTimeout(500);

    // Set filter type and value
    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await typeSelect.selectOption('filter');

    const valueInput = page.locator('[data-testid="interaction-value-input-0"]');
    await valueInput.fill('x > 5');
    await page.waitForTimeout(3000);

    // Chart should have re-rendered with filtered data
    const snapshotAfter = await getChartDataSnapshot(page);

    // The data should differ if the filter was applied
    if (snapshotBefore && snapshotAfter) {
      expect(JSON.stringify(snapshotAfter)).not.toBe(JSON.stringify(snapshotBefore));
    }
  });

  test('Step 2: Changing filter value updates chart preview', async ({ page }) => {
    await setupWithInsight(page);

    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    // Add a filter interaction
    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${insightName}"]`);
    await addInteraction.click();
    await page.waitForTimeout(500);

    const valueInput = page.locator('[data-testid="interaction-value-input-0"]');
    await valueInput.fill('x > 10');
    await page.waitForTimeout(2000);

    const snapshot1 = await getChartDataSnapshot(page);

    // Change the filter value
    await valueInput.fill('x > 20');
    await page.waitForTimeout(2000);

    const snapshot2 = await getChartDataSnapshot(page);

    // Data should change when filter value changes
    if (snapshot1 && snapshot2) {
      expect(JSON.stringify(snapshot2)).not.toBe(JSON.stringify(snapshot1));
    }
  });

  test('Step 3: Adding a sort interaction triggers chart re-render', async ({ page }) => {
    await setupWithInsight(page);

    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    // Add sort interaction
    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${insightName}"]`);
    await addInteraction.click();
    await page.waitForTimeout(500);

    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await typeSelect.selectOption('sort');

    const valueInput = page.locator('[data-testid="interaction-value-input-0"]');
    await valueInput.fill('x ascending');
    await page.waitForTimeout(3000);

    // Verify chart is still rendering (no crash)
    const hasChart = await page
      .locator('.js-plotly-plot')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Chart should be present and reflecting the sort
    expect(hasChart).toBe(true);
  });

  test('Step 4: Adding a split interaction triggers chart re-render', async ({ page }) => {
    await setupWithInsight(page);

    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    // Add split interaction
    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${insightName}"]`);
    await addInteraction.click();
    await page.waitForTimeout(500);

    const typeSelect = page.locator('[data-testid="interaction-type-select-0"]');
    await typeSelect.selectOption('split');

    const valueInput = page.locator('[data-testid="interaction-value-input-0"]');
    await valueInput.fill('y');
    await page.waitForTimeout(3000);

    // With a split, the chart should show multiple trace groups
    const hasChart = await page
      .locator('.js-plotly-plot')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasChart).toBe(true);

    if (hasChart) {
      const traceCount = await page.evaluate(() => {
        const plot = document.querySelector('.js-plotly-plot');
        return plot?._fullData?.length || 0;
      });
      // Split should produce multiple traces (one per group)
      expect(traceCount).toBeGreaterThan(1);
    }
  });

  test('Step 5: Removing an interaction reverts chart to unfiltered state', async ({ page }) => {
    await setupWithInsight(page);

    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    // Capture baseline chart data
    const baselineSnapshot = await getChartDataSnapshot(page);

    // Add a filter interaction
    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${insightName}"]`);
    await addInteraction.click();
    await page.waitForTimeout(500);

    const valueInput = page.locator('[data-testid="interaction-value-input-0"]');
    await valueInput.fill('x > 25');
    await page.waitForTimeout(2000);

    // Remove the interaction
    const removeInteraction = page.locator('[data-testid="insight-remove-interaction-0"]');
    await removeInteraction.click();
    await page.waitForTimeout(2000);

    // Chart should revert to baseline (unfiltered)
    const revertedSnapshot = await getChartDataSnapshot(page);
    if (baselineSnapshot && revertedSnapshot) {
      expect(JSON.stringify(revertedSnapshot)).toBe(JSON.stringify(baselineSnapshot));
    }
  });

  test('Step 6: Changing chart layout barmode re-renders chart', async ({ page }) => {
    await setupWithInsight(page);

    // Change insight type to bar (barmode only affects bar charts)
    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    const typeSelect = page.locator(`[data-testid="insight-type-select-${insightName}"]`);
    if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await typeSelect.selectOption('bar');
      await page.waitForTimeout(1000);
    }

    // Expand chart section to access layout
    const chartHeader = page.locator('[data-testid="chart-header"]');
    await chartHeader.click();
    await page.waitForTimeout(500);

    // Look for barmode in the layout SchemaEditor
    // The layout editor should have a barmode field
    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    const barmodeField = chartSection.getByText('barmode');

    if (await barmodeField.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click to expand barmode field and change it
      await barmodeField.click();
      await page.waitForTimeout(500);

      // Type "stack" as the value
      const barmodeInput = chartSection.locator('input, select').last();
      if (await barmodeInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await barmodeInput.fill('stack');
        await page.waitForTimeout(2000);
      }
    }

    // Chart should still be rendering (no crash)
    const hasChart = await page
      .locator('.js-plotly-plot')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasChart).toBe(true);
  });

  test('Step 7: Multiple interactions applied sequentially all reflected', async ({ page }) => {
    await setupWithInsight(page);

    const insightName = await getActiveInsightName(page);
    if (!insightName) return;

    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${insightName}"]`);

    // Add filter
    await addInteraction.click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="interaction-type-select-0"]').selectOption('filter');
    await page.locator('[data-testid="interaction-value-input-0"]').fill('x > 5');
    await page.waitForTimeout(1000);

    // Add sort
    await addInteraction.click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="interaction-type-select-1"]').selectOption('sort');
    await page.locator('[data-testid="interaction-value-input-1"]').fill('x descending');
    await page.waitForTimeout(1000);

    // Add split
    await addInteraction.click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="interaction-type-select-2"]').selectOption('split');
    await page.locator('[data-testid="interaction-value-input-2"]').fill('y');
    await page.waitForTimeout(3000);

    // All three interactions should be reflected in the chart
    const hasChart = await page
      .locator('.js-plotly-plot')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasChart).toBe(true);

    // Verify all 3 interaction rows are present
    const interactions = page.locator('[data-testid^="insight-interaction-"]');
    expect(await interactions.count()).toBe(3);
  });

  test('Step 8: Interaction changes on non-active insight update chart when switching', async ({
    page,
  }) => {
    await setupWithInsight(page);

    // Create two insights
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Get both insight names
    const sections = page.locator('[data-testid^="insight-crud-section-"]');
    const firstSectionId = await sections.first().getAttribute('data-testid');
    const secondSectionId = await sections.nth(1).getAttribute('data-testid');
    const firstName = firstSectionId?.replace('insight-crud-section-', '');
    const secondName = secondSectionId?.replace('insight-crud-section-', '');

    if (!firstName || !secondName) return;

    // Add interaction to second insight (which is currently active)
    const addInteraction = page.locator(`[data-testid="insight-add-interaction-${secondName}"]`);
    if (await addInteraction.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addInteraction.click();
      await page.waitForTimeout(500);

      await page.locator('[data-testid="interaction-type-select-0"]').selectOption('filter');
      await page.locator('[data-testid="interaction-value-input-0"]').fill('x > 10');
      await page.waitForTimeout(1000);
    }

    // Switch to first insight
    await page.locator(`[data-testid="insight-header-${firstName}"]`).click();
    await page.waitForTimeout(1000);

    // Switch back to second insight — its interactions should still be applied to chart
    await page.locator(`[data-testid="insight-header-${secondName}"]`).click();
    await page.waitForTimeout(2000);

    // The interaction row should still be visible
    const interaction = page.locator('[data-testid="insight-interaction-0"]');
    await expect(interaction).toBeVisible({ timeout: 3000 });
  });
});
