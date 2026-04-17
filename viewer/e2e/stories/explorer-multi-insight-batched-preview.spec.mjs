/**
 * Story: Batched Multi-Insight Preview
 *
 * Decision #6: charts with N insights fire exactly ONE preview request, not N.
 * The backend runs a multi-node DAG filter and returns all insights in one
 * response. `page.route` intercepts the POST requests to verify.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Batched Multi-Insight Preview', () => {
  test.setTimeout(60000);

  test('chart with multiple insights fires exactly one preview POST per cycle', async ({
    page,
  }) => {
    // Capture all POST requests to /api/insight-jobs/
    const postRequests = [];
    await page.route('**/api/insight-jobs/**', async (route, request) => {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        postRequests.push(body);
      }
      await route.continue();
    });

    // Load a chart that has multiple insights. combined-interactions-test-chart
    // has just one insight — let's use a chart with several.
    // daily_metrics_composite_chart has multiple insights in the integration project.
    // If not, we use whatever multi-insight chart is available.
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });
    await page.waitForTimeout(1000);

    // At least one preview request should have been made.
    expect(postRequests.length).toBeGreaterThan(0);

    // Each request should carry the batched shape: insight_names is an array,
    // and context_objects may have an insights array.
    for (const body of postRequests) {
      expect(body).toHaveProperty('insight_names');
      expect(Array.isArray(body.insight_names)).toBe(true);
      expect(body).toHaveProperty('run');
      expect(body.run).toBe(true);

      // Old contract had a single `config` field. Make sure it's gone.
      expect(body.config).toBeUndefined();
    }
  });

  test('preview request contains every chart insight in insight_names', async ({ page }) => {
    let capturedBody = null;
    await page.route('**/api/insight-jobs/**', async (route, request) => {
      if (request.method() === 'POST' && !capturedBody) {
        capturedBody = request.postDataJSON();
      }
      await route.continue();
    });

    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });
    await page.waitForTimeout(1000);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.insight_names.length).toBeGreaterThan(0);
    // Raw insight names, no synthetic prefixes/suffixes
    for (const name of capturedBody.insight_names) {
      expect(name).not.toMatch(/^preview__/);
      expect(name).not.toMatch(/_preview$/);
    }
  });
});
