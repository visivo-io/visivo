/**
 * Story: aggregate columns reach Plotly as numbers. count(*) is a DuckDB
 * BIGINT and list(...) a nested LIST; both must arrive as plain JS numbers and
 * arrays, or parcats `counts`, densitymap `z` and image `z` draw wrong.
 *
 * Precondition: a sandbox serving test-projects/docs-examples, e.g.
 *   VISIVO_SANDBOX_PROJECT_DIR=<repo>/test-projects/docs-examples \
 *   VISIVO_SANDBOX_BACKEND_PORT=8082 VISIVO_SANDBOX_FRONTEND_PORT=3082 \
 *   bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3082 npx playwright test e2e/stories/numeric-trace-props.spec.mjs
 */
import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

async function projectHasDashboard(page, name) {
  const response = await page.request.get(`${BASE_URL}/api/dashboards/${name}/`);
  return response.ok();
}

async function gotoDashboard(page, name) {
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto(`${BASE_URL}/workspace/dashboard/${name}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-dashboard-canvas')).toBeVisible({
    timeout: 15000,
  });
  return errors;
}

/** Poll until the named trace has reached Plotly, then return its data props. */
async function readTrace(page, name) {
  const read = () =>
    page.evaluate(traceName => {
      for (const gd of document.querySelectorAll('.js-plotly-plot')) {
        const trace = (gd.data || []).find(t => t.name === traceName);
        if (trace) return { counts: trace.counts, z: trace.z };
      }
      return null;
    }, name);
  await expect.poll(read, { timeout: 45000 }).not.toBeNull();
  return read();
}

const flat = value => (Array.isArray(value) ? value.flatMap(flat) : [value]);

test.describe('Numeric trace props from aggregate columns', () => {
  test.describe.configure({ timeout: 90000 });

  test('parcats counts from count(*) are numbers and size the categories', async ({ page }) => {
    test.skip(!(await projectHasDashboard(page, 'parcats')), 'docs-examples sandbox only');
    const errors = await gotoDashboard(page, 'parcats');

    const { counts } = await readTrace(page, 'parcats-plot-with-counts');
    expect(counts.every(c => typeof c === 'number')).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);

    const readHeights = () =>
      page.evaluate(() => {
        const gd = [...document.querySelectorAll('.js-plotly-plot')].find(g => g.data?.[0]?.counts);
        return Object.fromEntries(
          [...(gd?.querySelectorAll('g.category') || [])].map(cat => [
            cat.querySelector('text.catlabel')?.textContent,
            Number(cat.querySelector('rect.catrect')?.getAttribute('height')),
          ])
        );
      });
    // The trace data lands before Plotly finishes drawing the categories.
    await expect
      .poll(
        async () => {
          const drawn = await readHeights();
          return ['Third', 'First', 'No', 'Yes'].every(k => drawn[k] > 0);
        },
        { timeout: 15000 }
      )
      .toBe(true);
    const heights = await readHeights();
    // Third holds 4 of 10 rows and First 3; No holds 6 and Yes 4.
    expect(heights.Third / heights.First).toBeCloseTo(4 / 3, 1);
    expect(heights.No / heights.Yes).toBeCloseTo(6 / 4, 1);
    expect(errors).toEqual([]);
  });

  test('densitymap z from count(*) is numeric', async ({ page }) => {
    test.skip(!(await projectHasDashboard(page, 'densitymap')), 'docs-examples sandbox only');
    // Headless Chromium has no WebGL for the map, so only the trace data is checked.
    await gotoDashboard(page, 'densitymap');

    const { z } = await readTrace(page, 'simple-densitymap-plot');
    expect(z.every(v => typeof v === 'number')).toBe(true);
    expect(z.reduce((a, b) => a + b, 0)).toBe(6);
  });

  test('image z built with list() arrives as nested number arrays', async ({ page }) => {
    test.skip(!(await projectHasDashboard(page, 'image')), 'docs-examples sandbox only');
    const errors = await gotoDashboard(page, 'image');

    const { z } = await readTrace(page, 'image-from-query-plot');
    expect(z.every(Array.isArray)).toBe(true);
    expect(z.every(row => row.every(Array.isArray))).toBe(true);
    expect(flat(z).every(v => typeof v === 'number')).toBe(true);
    expect(z[1][1]).toEqual([236, 239, 203]);
    expect(errors).toEqual([]);
  });
});
