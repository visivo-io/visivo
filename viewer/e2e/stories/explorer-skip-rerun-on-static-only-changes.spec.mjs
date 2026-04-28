/**
 * Skip preview re-runs for static-only config changes.
 *
 * Before this fix, the chart-level preview path (used by
 * ExplorerChartPreview) keyed its run trigger on
 * `JSON.stringify(previewRequest)`, which meant every prop edit —
 * even one that didn't touch the SQL or interactions — fired a fresh
 * POST to /api/insight-jobs/. This story watches the network for
 * that endpoint and asserts:
 *
 *   1. Loading a chart with bindings produces ≥1 POST (the initial
 *      preview).
 *   2. Toggling a static enum prop (scatter `mode`: lines / markers
 *      / text / none — pure pattern-multiselect, no SQL impact)
 *      produces ZERO additional POSTs.
 *
 * Precondition: sandbox running on :3001/:8001.
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

const INSIGHT_JOBS_POST = /\/api\/insight-jobs\/?$/;

test.describe('Skip preview re-run on static-only changes', () => {
  test.setTimeout(90000);

  test('toggling a static mode flag does not POST a new insight job', async ({ page }) => {
    const insightJobPosts = [];
    page.on('request', req => {
      if (req.method() === 'POST' && INSIGHT_JOBS_POST.test(req.url())) {
        insightJobPosts.push({ url: req.url() });
      }
    });

    // simple-scatter-chart's insight has x / y bound to refs and a
    // `mode` flag-string visible in the property panel — perfect for
    // a static-only edit.
    await loadExplorerWithChart(page, 'simple-scatter-chart');

    // Plotly renders → first preview run completed.
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1500);

    const baseline = insightJobPosts.length;
    expect(baseline).toBeGreaterThanOrEqual(1);

    // Toggle a mode pill that doesn't change the SQL — `text` is one
    // of the flag-string options on scatter.mode. A pattern-multiselect
    // click only flips a static enum entry; no chip body, no
    // interaction value, no SQL impact.
    const textPill = page.getByRole('button', { name: 'text', exact: true });
    await expect(textPill).toBeVisible({ timeout: 5000 });
    await textPill.click();

    // Give the hook plenty of time to (incorrectly) fire if gating
    // misbehaves.
    await page.waitForTimeout(2000);
    expect(insightJobPosts.length).toBe(baseline);
  });
});
