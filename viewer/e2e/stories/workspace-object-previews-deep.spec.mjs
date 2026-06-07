/**
 * Story: Per-object Preview lens — DEEP coverage (Track N validation hardening).
 *
 * The sibling `workspace-object-previews.spec.mjs` is happy-path only (chart /
 * table / insight + one source fallback). This spec hardens Track N by covering:
 *
 *   - EVERY preview type: chart, table, insight, input (control + value), model
 *     (read-only SQL editor + Run → result table). Markdown has NO standalone
 *     object in the integration project (markdowns are inline-in-dashboard), so
 *     its Library subsection is empty — asserted here, with the renderer itself
 *     covered by MarkdownPreview.test.jsx at the unit layer.
 *   - The Preview⇄Lineage lens toggle for each previewable type.
 *   - Preview-less types (source / dimension / metric / relation) muting the
 *     Preview lens option and defaulting to (and locking onto) Lineage.
 *   - The "not found" empty state for a previewable type.
 *   - Cross-component interaction: selecting an object in the Library updates BOTH
 *     the middle-pane preview AND the right-rail Edit form (selection chip), and
 *     switching object types swaps both surfaces with no stale state (the
 *     Workspace.test isolation bug guard — VIS-775).
 *
 * Precondition: sandbox running on the configured base URL (default :3001;
 * this hardening pass runs it on :3021 via VISIVO_BASE_URL).
 *
 * Object names are from the integration project (verified live against the API):
 *   chart   = simple-scatter-chart
 *   table   = new_table
 *   insight = simple-scatter-insight
 *   input   = show_markers   (single-select toggle)
 *   model   = local_test_table
 *   source  = local-sqlite
 *   metric  = total_value · dimension = x_rounded · relation = local_to_local
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VISIVO_BASE_URL || 'http://localhost:3001';

/** Expand a Library per-type subsection (collapsed by default, VIS-828) and
 *  click the named row, returning the row locator. Idempotent: the header
 *  toggles, so only click it when the subsection is currently collapsed — this
 *  lets the helper be called repeatedly for the same type without re-collapsing. */
async function openObject(page, type, name) {
  const subsection = page.getByTestId(`library-subsection-${type}`);
  if ((await subsection.getAttribute('data-collapsed')) === 'true') {
    await page.getByTestId(`library-subsection-${type}-header`).click();
  }
  const row = page.getByTestId(`library-row-${type}-${name}`);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  return row;
}

async function gotoWorkspace(page) {
  await page.goto(`${BASE_URL}/workspace`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 10000 });
}

test.describe('Track N deep — every preview type renders', () => {
  test('chart preview draws a real Plotly surface', async ({ page }) => {
    await gotoWorkspace(page);
    await openObject(page, 'chart', 'simple-scatter-chart');
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('chart-preview')).toBeVisible();
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: 30000 });
    const drawn = await page.evaluate(() => ({
      svgs: document.querySelectorAll('.js-plotly-plot svg.main-svg').length,
      canvases: document.querySelectorAll('.js-plotly-plot canvas').length,
    }));
    expect(drawn.svgs + drawn.canvases).toBeGreaterThanOrEqual(1);
  });

  test('table preview renders the data toolbar (rows loaded)', async ({ page }) => {
    await gotoWorkspace(page);
    await openObject(page, 'table', 'new_table');
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('table-preview')).toBeVisible();
    await expect(
      page.locator('[data-testid="table-preview"]').getByPlaceholder('Search...')
    ).toBeVisible({ timeout: 30000 });
  });

  test('insight preview draws a real Plotly surface', async ({ page }) => {
    await gotoWorkspace(page);
    await openObject(page, 'insight', 'simple-scatter-insight');
    await expect(page.getByTestId('workspace-middle-insight-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('insight-preview')).toBeVisible();
    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('input preview mounts the control AND surfaces its current value', async ({ page }) => {
    await gotoWorkspace(page);
    await openObject(page, 'input', 'show_markers');
    await expect(page.getByTestId('workspace-middle-input-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('input-preview')).toBeVisible();
    // The "Current value:" panel is part of the Track N input preview contract;
    // show_markers defaults to "markers+lines", so the value must be surfaced.
    const valueBox = page.getByTestId('input-preview-value');
    await expect(valueBox).toBeVisible({ timeout: 15000 });
    await expect(valueBox).toContainText('Current value:');
    await expect(valueBox).toContainText('markers+lines');
    // The actual control (a real <Input> widget) renders inside the preview. A
    // toggle/single-select renders the label heading + an interactive control
    // (the toggle is a `button[role="switch"]`, other types use input/combobox),
    // so assert on the label plus any interactive element.
    await expect(
      page.locator('[data-testid="input-preview"]').getByText('Show Markers (Toggle)')
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page
        .locator(
          '[data-testid="input-preview"] button[role="switch"], ' +
            '[data-testid="input-preview"] input, ' +
            '[data-testid="input-preview"] [role="combobox"]'
        )
        .first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('model preview shows a read-only SQL editor + Run gating, then a result table', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    // sales_data declares an explicit `source: ${ref(local-duckdb)}` and returns
    // rows, exercising the full Run → result-table path deterministically.
    await openObject(page, 'model', 'sales_data');
    await expect(page.getByTestId('workspace-middle-model-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('model-preview')).toBeVisible();

    // The Monaco SQL editor mounts (read-only). Wait for the editor surface.
    await expect(page.locator('[data-testid="model-preview"] .monaco-editor').first()).toBeVisible({
      timeout: 20000,
    });

    // Before Run, the results pane shows the "Run the query to preview results." prompt.
    const results = page.getByTestId('model-preview-results');
    await expect(results).toContainText('Run the query to preview results.');

    // Run executes the model SQL via the model-query-jobs path and renders a table.
    const runBtn = page.getByTestId('model-preview-run');
    await expect(runBtn).toBeEnabled({ timeout: 10000 });
    await runBtn.click();

    // A result <table> appears (or, defensively, an explicit no-rows / error
    // state — all three are valid terminal states the preview must reach, never
    // a perpetual spinner).
    await expect(async () => {
      const hasTable = await results.locator('table').count();
      const text = (await results.textContent()) || '';
      const settled =
        hasTable > 0 ||
        /no rows/i.test(text) ||
        (await page.getByTestId('model-preview-error').count()) > 0;
      expect(settled).toBeTruthy();
    }).toPass({ timeout: 45000 });

    // Happy path for this model: it returns rows, so a header cell is visible.
    await expect(results.locator('table thead th').first()).toBeVisible({ timeout: 10000 });
  });

  test('a source-less model resolves the PROJECT DEFAULT source, not the first source', async ({
    page,
  }) => {
    // Regression for the clickhouse-fallback bug: local_test_table has no
    // `source` field. The fallback must be the project default (local-duckdb),
    // NOT sources[0] (local-clickhouse, an uninstalled dialect that errors).
    await gotoWorkspace(page);
    await openObject(page, 'model', 'local_test_table');
    await expect(page.getByTestId('workspace-middle-model-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('model-preview')).toContainText('local-duckdb', {
      timeout: 10000,
    });
    await expect(page.getByTestId('model-preview')).not.toContainText('local-clickhouse');
  });

  test('markdown has no standalone Library object in this project (subsection empty)', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await page.getByTestId('library-subsection-markdown-header').click();
    // The subsection renders its empty-state, not any row.
    await expect(page.getByTestId('library-subsection-markdown-empty')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator('[data-testid^="library-row-markdown-"]')
    ).toHaveCount(0);
  });
});

test.describe('Track N deep — Preview⇄Lineage lens toggle per type', () => {
  for (const { type, name } of [
    { type: 'chart', name: 'simple-scatter-chart' },
    { type: 'table', name: 'new_table' },
    { type: 'insight', name: 'simple-scatter-insight' },
    { type: 'input', name: 'show_markers' },
    { type: 'model', name: 'local_test_table' },
  ]) {
    test(`${type}: flips Preview → Lineage → Preview`, async ({ page }) => {
      await gotoWorkspace(page);
      await openObject(page, type, name);

      // Defaults to Preview for a previewable type.
      await expect(page.getByTestId(`workspace-middle-${type}-preview`)).toBeVisible({
        timeout: 15000,
      });

      // Flip to Lineage.
      await page.getByTestId('workspace-lens-picker-option-lineage').click();
      await expect(page.getByTestId(`workspace-middle-${type}-lineage`)).toBeVisible();
      await expect(page.getByTestId(`workspace-middle-${type}-preview`)).toHaveCount(0);

      // Flip back to Preview.
      await page.getByTestId('workspace-lens-picker-option-preview').click();
      await expect(page.getByTestId(`workspace-middle-${type}-preview`)).toBeVisible();
    });
  }
});

test.describe('Track N deep — preview-less types mute Preview + lock onto Lineage', () => {
  for (const { type, name } of [
    { type: 'source', name: 'local-sqlite' },
    { type: 'dimension', name: 'x_rounded' },
    { type: 'metric', name: 'total_value' },
    { type: 'relation', name: 'local_to_local' },
  ]) {
    test(`${type}: defaults to Lineage, Preview option is disabled`, async ({ page }) => {
      await gotoWorkspace(page);
      await openObject(page, type, name);

      // Parks on Lineage — no preview surface exists.
      await expect(page.getByTestId(`workspace-middle-${type}-lineage`)).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId(`workspace-middle-${type}-preview`)).toHaveCount(0);

      // The Preview lens option is muted (disabled) — clicking it cannot switch.
      const previewOpt = page.getByTestId('workspace-lens-picker-option-preview');
      await expect(previewOpt).toBeDisabled();
      await previewOpt.click({ force: true }).catch(() => {});
      await expect(page.getByTestId(`workspace-middle-${type}-lineage`)).toBeVisible();
      await expect(page.getByTestId(`workspace-middle-${type}-preview`)).toHaveCount(0);
    });
  }
});

test.describe('Track N deep — cross-component interaction (middle preview ⇄ right-rail Edit)', () => {
  test('selecting a chart updates BOTH the middle preview and the right-rail Edit form', async ({
    page,
  }) => {
    await gotoWorkspace(page);
    await openObject(page, 'chart', 'simple-scatter-chart');

    // Middle pane: chart preview.
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });
    // Right rail: the selection chip identifies the same chart.
    const chip = page.getByTestId('right-rail-selection-chip');
    await expect(chip).toBeVisible({ timeout: 10000 });
    await expect(chip).toHaveAttribute('data-object-type', 'chart');
    await expect(chip).toContainText('simple-scatter-chart');
  });

  test('switching object TYPES swaps both surfaces with no stale state', async ({ page }) => {
    await gotoWorkspace(page);

    // 1) Start on a chart.
    await openObject(page, 'chart', 'simple-scatter-chart');
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('right-rail-selection-chip')).toHaveAttribute(
      'data-object-type',
      'chart'
    );

    // 2) Switch to a table — chart preview must unmount, table preview mounts,
    //    and the right-rail chip must re-key to the table.
    await openObject(page, 'table', 'new_table');
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('workspace-middle-chart-preview')).toHaveCount(0);
    await expect(page.getByTestId('right-rail-selection-chip')).toHaveAttribute(
      'data-object-type',
      'table'
    );
    await expect(page.getByTestId('right-rail-selection-chip')).toContainText('new_table');

    // 3) Switch to a preview-less source — middle pane swaps to Lineage, the
    //    Preview lens mutes, and the chip re-keys to the source. No stale table
    //    preview or chart preview is left mounted.
    await openObject(page, 'source', 'local-sqlite');
    await expect(page.getByTestId('workspace-middle-source-lineage')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('workspace-middle-table-preview')).toHaveCount(0);
    await expect(page.getByTestId('workspace-middle-chart-preview')).toHaveCount(0);
    await expect(page.getByTestId('workspace-lens-picker-option-preview')).toBeDisabled();
    await expect(page.getByTestId('right-rail-selection-chip')).toHaveAttribute(
      'data-object-type',
      'source'
    );

    // 4) Back to an insight — Preview lens un-mutes and the insight chart mounts,
    //    proving the lens un-locks when moving from a preview-less type to a
    //    previewable one (no stale "locked on lineage" state).
    await openObject(page, 'insight', 'simple-scatter-insight');
    await expect(page.getByTestId('workspace-middle-insight-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('workspace-lens-picker-option-preview')).toBeEnabled();
    await expect(page.getByTestId('right-rail-selection-chip')).toHaveAttribute(
      'data-object-type',
      'insight'
    );
  });

  test('a Lineage-flipped object does NOT leak its lens to the next previewable object', async ({
    page,
  }) => {
    // Regression (found during the Track N hardening pass): PerObjectPane is a
    // single reused React instance, so a chart flipped to Lineage leaked its
    // lens — selecting a table next opened it on Lineage instead of its Preview
    // default. The lens must reset to the new object's default on every switch.
    await gotoWorkspace(page);

    // Cross-type: chart (flip to Lineage) → table must default to Preview.
    await openObject(page, 'chart', 'simple-scatter-chart');
    await expect(page.getByTestId('workspace-middle-chart-preview')).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId('workspace-lens-picker-option-lineage').click();
    await expect(page.getByTestId('workspace-middle-chart-lineage')).toBeVisible();

    await openObject(page, 'table', 'new_table');
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('workspace-middle-table-lineage')).toHaveCount(0);

    // Same-type: table (flip to Lineage) → a different table must default to Preview.
    await page.getByTestId('workspace-lens-picker-option-lineage').click();
    await expect(page.getByTestId('workspace-middle-table-lineage')).toBeVisible();
    await openObject(page, 'table', 'awesome-table');
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('workspace-middle-table-lineage')).toHaveCount(0);
  });
});
