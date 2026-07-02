/**
 * Story: Per-object Preview lens in the Workspace middle pane (Track N).
 *
 * Covers VIS-784 (ChartPreview), VIS-791 (TablePreview), and VIS-798
 * (InsightPreview) — the three non-trivial renderers. Selecting a chart /
 * table / insight from the Library opens it as the active object; the middle
 * pane defaults to the Preview lens and mounts that type's custom preview
 * component, which reuses the existing renderer (Plotly chart for chart +
 * insight, a data table for tables). Flipping to the Lineage lens swaps to the
 * universal DAG view, and back.
 *
 * Precondition: sandbox running on :3001/:8001
 *   cd test-projects/integration && visivo serve --port 8001
 *   (Vite on :3001 proxying to :8001 — `bash scripts/sandbox.sh start`)
 *
 * Object names are from the integration project:
 *   chart                = simple-scatter-chart
 *   table                = new_table
 *   insight              = simple-scatter-insight        (MODE A: present in main run)
 *   input-driven chart   = split-input-test-chart        (insight depends on split_threshold)
 *   input-driven table   = filter-input-test-table       (insight depends on min_x_value)
 *   input-driven insight = toggle-mode-insight           (props depend on show_markers)
 *
 * VIS-1002 (insight preview, MODE A): a PUBLISHED insight that is present in the
 *   `visivo run` main run renders the saved Plotly chart immediately — no preview
 *   run, no indefinite spinner. (MODE B — an unsaved/never-run insight firing a
 *   preview run — is exercised by the Explorer right-rail stories and the
 *   usePreviewData unit suite; it must not regress.)
 * VIS-1003 (inputs in previews): an input-driven chart / table / insight renders
 *   its input control widget(s) ABOVE the body, defaulted, so the body renders
 *   immediately and the value can be changed live.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VISIVO_BASE_URL || 'http://localhost:3001';

/** Expand a Library per-type subsection (collapsed by default, VIS-828) and
 *  click the named row, returning the row locator. */
async function openObject(page, type, name) {
  await page.getByTestId(`library-subsection-${type}-header`).click();
  const row = page.getByTestId(`library-row-${type}-${name}`);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  return row;
}

test.describe('Workspace per-object Preview lens (Track N)', () => {
  test('Step 1: selecting a chart mounts the ChartPreview with a real Plotly chart', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 10000 });

    await openObject(page, 'chart', 'simple-scatter-chart');

    // Preview lens is the default for a chart; the custom preview mounts.
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('chart-preview')).toBeVisible();

    // The existing <Chart> renderer draws a real Plotly surface.
    const plot = page.locator('.js-plotly-plot').first();
    await expect(plot).toBeVisible({ timeout: 30000 });
    const drawn = await page.evaluate(() => ({
      svgs: document.querySelectorAll('.js-plotly-plot svg.main-svg').length,
      canvases: document.querySelectorAll('.js-plotly-plot canvas').length,
    }));
    expect(drawn.svgs + drawn.canvases).toBeGreaterThanOrEqual(1);
  });

  test('Step 2: a chart can flip from Preview to the Lineage lens and back', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    await openObject(page, 'chart', 'simple-scatter-chart');

    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });

    // Flip to Lineage.
    await page.getByTestId('workspace-lens-picker-option-lineage').click();
    await expect(page.getByTestId('workspace-middle-chart-lineage')).toBeVisible();
    await expect(page.getByTestId('workspace-middle-chart-preview')).toHaveCount(0);

    // Flip back to Preview.
    await page.getByTestId('workspace-lens-picker-option-preview').click();
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible();
  });

  test('Step 3: selecting a table mounts the TablePreview with rendered rows', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');

    await openObject(page, 'table', 'new_table');

    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('table-preview')).toBeVisible();

    // The existing <Table> renderer (PivotableTable) replaces its Loading
    // spinner with the toolbar's "Search..." field once the model data loads,
    // so a visible Search box inside the preview proves data rendered.
    await expect(
      page.locator('[data-testid="table-preview"]').getByPlaceholder('Search...')
    ).toBeVisible({ timeout: 30000 });
  });

  test('Step 4: a PUBLISHED insight (MODE A) renders the saved chart immediately, no preview run', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');

    await openObject(page, 'insight', 'simple-scatter-insight');

    await expect(page.getByTestId('workspace-middle-insight-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('insight-preview')).toBeVisible();

    // MODE A: a published insight present in the main run renders the real
    // Plotly chart directly from main-run data — it must NOT sit on the preview
    // "Running Preview" spinner (that path is MODE B / unsaved only).
    await expect(page.getByTestId('preview-loading')).toHaveCount(0);
    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('Step 6: an input-driven chart renders its input control above a Plotly chart (VIS-1003)', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');

    await openObject(page, 'chart', 'split-input-test-chart');

    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });

    // The input control strip renders (defaulted) above the chart body.
    const strip = page.locator('[data-testid="chart-preview"] [data-testid="input-controls-section"]');
    await expect(strip).toBeVisible({ timeout: 15000 });
    await expect(strip.getByTestId('preview-input-type-chip')).toBeVisible();

    // And — because the input defaults — the Plotly chart still renders.
    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('Step 7: an input-driven insight renders its input control above the chart (VIS-1003)', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');

    await openObject(page, 'insight', 'toggle-mode-insight');

    await expect(page.getByTestId('workspace-middle-insight-preview')).toBeVisible({
      timeout: 15000,
    });

    const strip = page.locator('[data-testid="insight-preview"] [data-testid="input-controls-section"]');
    await expect(strip).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('Step 8: an input-driven table renders its input control and populates (VIS-1003)', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');

    await openObject(page, 'table', 'filter-input-test-table');

    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: 15000,
    });

    const strip = page.locator('[data-testid="table-preview"] [data-testid="input-controls-section"]');
    await expect(strip).toBeVisible({ timeout: 15000 });

    // Defaulted input → the table renders (its search toolbar appears).
    await expect(
      page.locator('[data-testid="table-preview"]').getByPlaceholder('Search...')
    ).toBeVisible({ timeout: 30000 });
  });

  test('Step 9: a preview-less object (source) falls back to the Lineage lens', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');

    // Sources have no custom preview — the pane must lock onto Lineage.
    const sourceRow = page
      .getByTestId('library-subsection-source-rows')
      .locator('[data-testid^="library-row-source-"]')
      .first();
    await page.getByTestId('library-subsection-source-header').click();
    await expect(sourceRow).toBeVisible({ timeout: 10000 });
    await sourceRow.click();

    await expect(page.getByTestId('workspace-middle-source-lineage')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('workspace-middle-source-preview')).toHaveCount(0);
  });
});
