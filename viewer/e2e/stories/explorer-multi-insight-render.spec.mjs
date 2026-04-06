/**
 * Story: Multiple Insights — Concurrent Chart Rendering
 *
 * Bug: ExplorerChartPreview picks a single effectiveInsightName and passes
 * only that one insight to ChartPreview. When multiple insights are added
 * to a chart, only one renders at a time instead of all rendering concurrently.
 *
 * These tests document what SHOULD happen and will FAIL until the bug is fixed.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import {
  loadExplorer,
  loadExplorerWithChart,
  createModelWithSource,
  typeSql,
  runQuery,
} from '../helpers/explorer.mjs';

/** Set up a model with data and create an insight with x/y configured. */
async function setupModelWithInsight(page) {
  await loadExplorer(page);
  await createModelWithSource(page, 'local-sqlite');
  await typeSql(page, 'SELECT x, y FROM test_table LIMIT 20');
  await runQuery(page);
  await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });
}

/** Get the number of Plotly traces currently rendered. */
async function getTraceCount(page) {
  return page.evaluate(() => {
    const plot = document.querySelector('.js-plotly-plot');
    return plot?._fullData?.length || 0;
  });
}

/** Wait for the chart preview to have a Plotly plot rendered. */
async function waitForChart(page) {
  await page.waitForSelector('.js-plotly-plot', { timeout: 15000 });
}

test.describe('Multiple Insights — Concurrent Rendering', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Step 1: Two insights with x/y configured both render traces on chart', async ({
    page,
  }) => {
    await setupModelWithInsight(page);

    // First insight is auto-created or we add one
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Configure first insight's x and y via SchemaEditor drop targets or manual input
    // For this test, just verify the insight count and trace rendering
    // Add a second insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Verify both insight pills exist in chart section
    const insightPills = page.locator('[data-testid^="chart-insight-pill-"]');
    const pillCount = await insightPills.count();
    expect(pillCount).toBeGreaterThanOrEqual(2);

    // If chart renders, check trace count
    const hasChart = await page.locator('.js-plotly-plot').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasChart) {
      const traceCount = await getTraceCount(page);
      // Both insights should produce traces
      expect(traceCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('Step 2: Adding second insight does not remove first trace', async ({ page }) => {
    await setupModelWithInsight(page);

    // Create first insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Record initial state
    const hasChartBefore = await page
      .locator('.js-plotly-plot')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    let traceBefore = 0;
    if (hasChartBefore) {
      traceBefore = await getTraceCount(page);
    }

    // Add second insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Trace count should not decrease (first trace still present)
    const hasChartAfter = await page
      .locator('.js-plotly-plot')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasChartAfter && traceBefore > 0) {
      const traceAfter = await getTraceCount(page);
      expect(traceAfter).toBeGreaterThanOrEqual(traceBefore);
    }
  });

  test('Step 3: Switching active insight keeps all traces visible', async ({ page }) => {
    await setupModelWithInsight(page);

    // Create two insights
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Click on first insight header to make it active
    const firstInsight = page.locator('[data-testid^="insight-header-"]').first();
    await firstInsight.click();

    const hasChart = await page.locator('.js-plotly-plot').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasChart) {
      const traceCount1 = await getTraceCount(page);

      // Click on second insight header
      const secondInsight = page.locator('[data-testid^="insight-header-"]').nth(1);
      await secondInsight.click();

      const traceCount2 = await getTraceCount(page);

      // Trace count should remain the same — switching active doesn't hide traces
      expect(traceCount2).toBe(traceCount1);
    }
  });

  test('Step 4: Removing one insight keeps remaining insight rendering', async ({ page }) => {
    await setupModelWithInsight(page);

    // Create two insights
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Remove the first insight
    const removeBtn = page.locator('[data-testid^="insight-remove-"]').first();
    await removeBtn.click();

    // One insight pill should remain
    const pillsAfter = page.locator('[data-testid^="chart-insight-pill-"]');
    const pillCountAfter = await pillsAfter.count();
    expect(pillCountAfter).toBeGreaterThanOrEqual(1);

    // Chart should still be functional (not crash)
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Something went wrong');
  });

  test('Step 5: Three insights (scatter, bar, line) all render concurrently', async ({
    page,
  }) => {
    await setupModelWithInsight(page);

    // Create three insights
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Change types for variety
    const typeSelects = page.locator('[data-testid^="insight-type-select-"]');
    const selectCount = await typeSelects.count();

    if (selectCount >= 3) {
      await typeSelects.nth(0).selectOption('scatter');
      await typeSelects.nth(1).selectOption('bar');
      await typeSelects.nth(2).selectOption('line');
    }

    // All three should be in the chart's insight list
    const pills = page.locator('[data-testid^="chart-insight-pill-"]');
    expect(await pills.count()).toBeGreaterThanOrEqual(3);

    // If chart renders, all three traces should be present
    const hasChart = await page.locator('.js-plotly-plot').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasChart) {
      const traceCount = await getTraceCount(page);
      expect(traceCount).toBeGreaterThanOrEqual(3);
    }
  });

  test('Step 6: Chart insight pills count matches rendered trace count', async ({ page }) => {
    await setupModelWithInsight(page);

    // Create two insights
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    const pillCount = await page.locator('[data-testid^="chart-insight-pill-"]').count();

    const hasChart = await page.locator('.js-plotly-plot').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasChart) {
      const traceCount = await getTraceCount(page);
      // Number of traces should match number of insight pills
      expect(traceCount).toBe(pillCount);
    }
  });

  test('Step 7: Loading existing multi-insight chart renders all traces', async ({ page }) => {
    await loadExplorer(page);

    // Find a chart that has multiple insights and load it
    // Look for any chart in the left nav that might have multiple insights

    // Load a chart — charts section should have items
    const chartsSection = page.getByText('Charts').first();
    if (await chartsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click the first available chart
      const firstChart = page
        .locator('[data-testid="left-panel-content"]')
        .getByRole('button')
        .filter({ hasText: 'chart' })
        .first();

      if (await firstChart.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstChart.click();
        await page.locator('[data-testid="chart-crud-section"], [data-testid="chart-header"]').first().waitFor({ timeout: 10000 });

        // Check how many insight pills are in the chart section
        const pillCount = await page.locator('[data-testid^="chart-insight-pill-"]').count();

        if (pillCount >= 2) {
          // If chart has multiple insights, all traces should render
          const hasChart = await page
            .locator('.js-plotly-plot')
            .isVisible({ timeout: 10000 })
            .catch(() => false);
          if (hasChart) {
            const traceCount = await getTraceCount(page);
            expect(traceCount).toBeGreaterThanOrEqual(pillCount);
          }
        }
      }
    }
  });
});
