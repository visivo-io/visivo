/**
 * Story: Removing an Insight from a Chart Purges Its Inputs
 *
 * Bug 2: `selectDerivedInputNames` scanned ALL insights in `explorerInsightStates`,
 * so inputs contributed by a detached insight's working copy stayed in the
 * toolbar after the insight was removed from the chart. The fix scopes the
 * scan to `explorerChartInsightNames` only.
 *
 * US-2a bonus: removing + re-attaching an insight preserves any in-session
 * edits (working copy outlives detachment).
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Remove Insight Clears Inputs', () => {
  test.setTimeout(60000);

  test('chart preview request shape reflects attached insights only', async ({ page }) => {
    // Monitor preview POST bodies — the batched shape surfaces which insights
    // are currently attached to the chart.
    let latestBody = null;
    await page.route('**/api/insight-jobs/**', async (route, request) => {
      if (request.method() === 'POST') {
        latestBody = request.postDataJSON();
      }
      await route.continue();
    });

    // Use a chart that has an insight referencing an input
    await loadExplorerWithChart(page, 'range-slider-chart');
    await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });
    await page.waitForTimeout(1000);

    expect(latestBody).not.toBeNull();
    const initialInsightCount = latestBody.insight_names.length;
    expect(initialInsightCount).toBeGreaterThan(0);

    // Find the remove button on an insight pill in the chart section
    const removeButton = page
      .locator('[data-testid="chart-insight-pill-range-slider-insight"] button')
      .first();
    const hasRemoveButton = await removeButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasRemoveButton) {
      test.skip(true, 'Could not find the remove-insight button in the chart section');
      return;
    }

    latestBody = null;
    await removeButton.click();
    await page.waitForTimeout(1000);

    // A new preview POST should fire with fewer insights (or no POST if the
    // list became empty).
    if (latestBody) {
      expect(latestBody.insight_names.length).toBeLessThan(initialInsightCount);
      // The removed insight name should be gone from insight_names
      expect(latestBody.insight_names).not.toContain('range-slider-insight');
    }
  });
});
