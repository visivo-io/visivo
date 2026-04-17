/**
 * Story: Insight Legend Name
 *
 * Bug 1: Dragging an insight onto a chart produced Plotly legend entries with
 * concatenated synthetic names like `preview__daily_metrics_composite-scatter-insight_preview`.
 * After Phase 2, the preview request sends the raw insight name and the legend
 * renders it verbatim.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

async function waitForPlot(page) {
  await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });
  await page.waitForTimeout(500);
}

/**
 * Read the Plotly legend entry texts from the rendered chart.
 * Uses _fullData[].name which is what Plotly displays in the legend.
 */
async function getLegendNames(page) {
  return page.evaluate(() => {
    const plot = document.querySelector('.js-plotly-plot');
    if (!plot || !plot._fullData) return [];
    return plot._fullData.map(trace => trace.name).filter(Boolean);
  });
}

test.describe('Insight Legend Name', () => {
  test.setTimeout(60000);

  test('legend entry matches insight name verbatim (no preview_ prefix or suffix)', async ({
    page,
  }) => {
    // Load a chart with at least one named insight. combined-interactions-test-chart
    // references combined-interactions-test-insight from the integration project.
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await waitForPlot(page);

    const legendNames = await getLegendNames(page);

    // No synthetic concatenation should leak into the rendered trace names.
    // The old bug produced names like `preview__model_<insight>_preview`.
    for (const name of legendNames) {
      expect(name, `legend name "${name}" contains preview_ prefix`).not.toMatch(
        /^preview__/
      );
      expect(name, `legend name "${name}" contains _preview suffix`).not.toMatch(
        /_preview$/
      );
    }
  });

  test('legend does not contain active-model name concatenation', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await waitForPlot(page);

    const legendNames = await getLegendNames(page);

    // The old bug also concatenated the chart name. Verify no legend entry
    // matches the pattern `<something>_chart` either.
    for (const name of legendNames) {
      expect(name, `legend name "${name}" ends with _chart`).not.toMatch(/_chart$/);
    }
  });
});
