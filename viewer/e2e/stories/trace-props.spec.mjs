/**
 * Story: trace props — insight-to-insight refs, static image traces, and
 * generated required fields (VIS-1464 P1 / P4 / P2).
 *
 * Precondition: a sandbox serving test-projects/docs-examples, e.g.
 *   VISIVO_SANDBOX_PROJECT_DIR=<repo>/test-projects/docs-examples \
 *   VISIVO_SANDBOX_BACKEND_PORT=8037 VISIVO_SANDBOX_FRONTEND_PORT=3037 \
 *   bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3037 npx playwright test e2e/stories/trace-props.spec.mjs
 *
 * The default `parallel` sandbox (integration project) has none of these
 * dashboards, so the dashboard tests skip themselves there instead of failing.
 */
import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';

/** Read every Plotly graph div's user `data` (trace objects) on the page. */
async function readPlotlyData(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.js-plotly-plot')].map(gd =>
      (gd.data || []).map(trace => ({
        type: trace.type,
        name: trace.name,
        carpet: trace.carpet,
        zRows: Array.isArray(trace.z) ? trace.z.length : null,
        zPixelChannels:
          Array.isArray(trace.z) && Array.isArray(trace.z[0]) && Array.isArray(trace.z[0][0])
            ? trace.z[0][0].length
            : null,
      }))
    )
  );
}

async function gotoDashboard(page, name) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto(`${BASE_URL}/workspace/dashboard/${name}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-dashboard-canvas')).toBeVisible({
    timeout: 15000,
  });
  return errors;
}

async function projectHasDashboard(page, name) {
  // 200 for a dashboard the served project defines, 404 otherwise.
  const response = await page.request.get(`${BASE_URL}/api/dashboards/${name}/`);
  return response.ok();
}

/** Pick an option from the brand `<Select>` (react-select). */
async function pickSelectOption(page, testId, optionLabel) {
  const container = page.getByTestId(testId);
  await container.click();
  await container.getByRole('combobox').fill(optionLabel);
  const option = page
    .locator('.vis-select__option', { hasText: new RegExp(`^${optionLabel}$`, 'i') })
    .first();
  await option.waitFor({ timeout: 5000 });
  await option.click();
}

test.describe('Trace props (VIS-1464)', () => {
  test.describe.configure({ timeout: 90000 });

  test('P4: the image dashboard renders its static and query-built image traces', async ({
    page,
  }) => {
    test.skip(!(await projectHasDashboard(page, 'image')), 'docs-examples sandbox only');
    const errors = await gotoDashboard(page, 'image');

    await expect
      .poll(async () => (await readPlotlyData(page)).filter(d => d.length > 0).length, {
        timeout: 45000,
      })
      .toBe(4);

    const plots = (await readPlotlyData(page)).filter(d => d.length > 0);
    for (const traces of plots) {
      expect(traces).toHaveLength(1);
      expect(traces[0].type).toBe('image');
      // A real pixel grid reached Plotly: rows of [r, g, b] pixels.
      expect(traces[0].zRows).toBeGreaterThanOrEqual(3);
      expect(traces[0].zPixelChannels).toBe(3);
    }
    // Four real rasters were drawn: Plotly renders an image trace as an SVG
    // <image> (data: PNG) inside the plot's imagelayer, with a real extent.
    const rasters = page.locator('.js-plotly-plot .imagelayer image');
    await expect(rasters).toHaveCount(4);
    for (const raster of await rasters.all()) {
      expect(await raster.getAttribute('href')).toMatch(/^data:image\/png/);
      expect(Number(await raster.getAttribute('width'))).toBeGreaterThan(100);
      expect(Number(await raster.getAttribute('height'))).toBeGreaterThan(100);
    }
    expect(errors).toEqual([]);
  });

  test('P1: on a two-carpet chart each contourcarpet binds to its own carpet id', async ({
    page,
  }) => {
    test.skip(!(await projectHasDashboard(page, 'contourcarpet')), 'docs-examples sandbox only');
    const errors = await gotoDashboard(page, 'contourcarpet');

    await expect
      .poll(
        async () =>
          (await readPlotlyData(page)).some(
            d => d.filter(t => t.type === 'carpet').length === 2
          ),
        { timeout: 45000 }
      )
      .toBe(true);

    const all = await readPlotlyData(page);
    const twoCarpets = all.find(d => d.filter(t => t.type === 'carpet').length === 2);
    const carpets = twoCarpets.filter(t => t.type === 'carpet');
    const contours = twoCarpets.filter(t => t.type === 'contourcarpet');
    expect(contours).toHaveLength(2);

    // Each carpet carries a distinct id (one defaulted from its insight name,
    // one authored explicitly)...
    const carpetIds = carpets.map(c => c.carpet);
    expect(new Set(carpetIds).size).toBe(2);
    expect(carpetIds).toEqual(expect.arrayContaining(['left-carpet', 'right']));
    // ...and no `${ref(...)}` literal reached Plotly: each contour's `carpet`
    // IS one of the carpet ids, and the two contours point at different carpets.
    for (const contour of contours) {
      expect(contour.carpet).not.toContain('${');
      expect(carpetIds).toContain(contour.carpet);
    }
    expect(new Set(contours.map(c => c.carpet)).size).toBe(2);
    expect(contours.find(c => c.name === 'left-contour').carpet).toBe('left-carpet');
    expect(contours.find(c => c.name === 'right-contour').carpet).toBe('right');

    // The single-carpet examples resolve too (carpet-plot / carpet-plot-filled / carpet-plot-custom).
    for (const traces of all.filter(d => d.filter(t => t.type === 'carpet').length === 1)) {
      const carpet = traces.find(t => t.type === 'carpet');
      const contour = traces.find(t => t.type === 'contourcarpet');
      expect(contour.carpet).toBe(carpet.carpet);
      expect(contour.carpet).not.toContain('${');
    }
    expect(errors).toEqual([]);
  });

  test('P2: picking Scatter Ternary in the Explorer shows the a / b / c fields up-front', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace/exploration`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('explorer-home-new-exploration').click();
    await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({
      timeout: 30000,
    });

    const rail = page.getByTestId('exploration-build-rail');
    await expect(rail).toBeVisible({ timeout: 15000 });
    const sections = rail.locator('[data-testid^="insight-build-section-"]');
    if ((await sections.count()) === 0) {
      await page.getByTestId('right-panel-add-insight').click();
    }
    await expect(sections.first()).toBeVisible({ timeout: 10000 });
    const sectionId = await sections.first().getAttribute('data-testid');
    const insightName = sectionId.replace('insight-build-section-', '');

    // The default scatter insight opens x / y.
    await expect(page.locator('[data-testid*="droppable-property-x"]').first()).toBeVisible({
      timeout: 15000,
    });

    await pickSelectOption(page, `type-selector-${insightName}`, 'Scatter Ternary');
    await expect(page.getByTestId(`type-selector-${insightName}`)).toContainText(
      'Scatter Ternary',
      { timeout: 5000 }
    );

    // a / b / c come from the generated required-fields artifact; with the
    // old hand-written map (no scatterternary entry) they stayed folded.
    for (const field of ['a', 'b', 'c']) {
      await expect(
        page.locator(`[data-testid*="droppable-property-${field}"]`).first()
      ).toBeVisible({ timeout: 10000 });
    }
  });
});
