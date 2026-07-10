/**
 * Story: the Metric Field Lens (MetricPlayground) LOCAL preview (VIS-1026).
 *
 * Selecting a metric in the Library opens its middle-pane Canvas — the
 * MetricPlayground. VIS-1026 moved it OFF the deleted insight-preview pipeline:
 * it is now ON-DEMAND (a "Preview this metric" prompt until you click Run), runs
 * the parent model via `/api/model-query-jobs/`, then aggregates the metric
 * LOCALLY in DuckDB-WASM and renders self-drawn CSS bars
 * (`metric-playground-bars`, NOT a Plotly plot). This story is rewritten to that
 * flow (the old version tested the deleted synthetic-insight Plotly path).
 *
 * ⚠️ `test.describe.fixme` — the whole story is BLOCKED on a VIS-1026 regression
 *    this rewrite surfaced against the sandbox. Two compounding bugs make the
 *    metric preview unusable for the integration project's `daily_metrics`:
 *
 *    1. Local-preview date-type loss. The aggregate loads the server model rows
 *       into DuckDB-WASM via `read_json_auto`, which types the JSON `date` column
 *       as VARCHAR. `daily_metrics`'s only dimension is `formatted_date`
 *       (`strftime(date,'%Y-%m-%d')`), so the split runs `strftime(VARCHAR, …)`:
 *         Binder Error: No function matches strftime(VARCHAR, STRING_LITERAL).
 *       The old server-side preview saw a real TIMESTAMP `date` and worked. Shared
 *       with DimensionInspector (same read_json_auto load).
 *    2. `(none)` split is unreachable. MetricPlayground auto-defaults an empty
 *       split back to the first candidate (`if (!splitField) setSplitField(
 *       candidates[0])`), so a user can't pick "(none)" to get the plain
 *       `AVG(value)` aggregate that would dodge bug #1.
 *
 *    Un-fixme once the local aggregate preserves the model's column types (or
 *    casts date-like columns) so date splits work — and/or "(none)" is honored.
 *
 * Precondition: the isolated sandbox running the integration project
 * (`bash scripts/sandbox.sh start`). Override the base via VIS_CANVAS_BASE.
 */

import { test, expect } from '@playwright/test';
import {
  SCREENS,
  WAIT,
  collectErrors,
  openWorkspace,
  selectLibraryObject,
} from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1400 } });

// Benign network noise in the local-preview flow (model-query-job polling can
// 404 before the job registers; DuckDB-WASM cross-origin warnings). A real
// product error still fails the test.
const realErrors = errors =>
  errors.filter(e => !/model-query-jobs|duckdb|Cross-Origin|insight-jobs/i.test(e));

// Click Run and wait for the metric to settle into self-drawn bars rather than
// the error card. Surfaces the error text so a regression reports the real
// DuckDB message instead of a bare timeout.
const runAndExpectBars = async page => {
  await page.getByTestId('metric-playground-run').click();
  const bars = page.getByTestId('metric-playground-bars');
  const failed = page.getByTestId('metric-playground-error');
  await expect
    .poll(
      async () => {
        if (await bars.isVisible().catch(() => false)) return 'bars';
        if (await failed.isVisible().catch(() => false)) {
          return `failed:${(await failed.textContent().catch(() => '')) || ''}`;
        }
        return 'pending';
      },
      { timeout: WAIT, message: 'metric playground never produced bars' }
    )
    .toBe('bars');
};

// Drive the brand react-select (menu portals to body with the brand
// classNamePrefix `vis-select__option`). Mirrors trace-props-editor.spec.mjs.
const selectGrain = async (page, label) => {
  const grain = page.getByTestId('metric-playground-time-grain');
  await grain.click();
  await grain.getByRole('combobox').fill(label);
  const option = page
    .locator('.vis-select__option', { hasText: new RegExp(`^${label}$`, 'i') })
    .first();
  await option.waitFor({ timeout: WAIT });
  await option.click();
};

test.describe.fixme('Metric Field Lens local preview (VIS-1026 — Run → DuckDB bars)', () => {
  test.setTimeout(90000);

  test('avg_value: Run renders bars for the default split + month grain', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');

    // The metric canvas frame mounts on the Canvas (preview) lens.
    await expect(page.getByTestId('workspace-middle-metric-preview')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });

    // On-demand: the pre-run prompt shows until Run is clicked (no auto-preview),
    // with the always-defaulted split + time-grain controls.
    await expect(page.getByTestId('metric-playground-prompt')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground-split')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground-time-grain')).toBeVisible({ timeout: WAIT });

    // Run → the parent model runs, the metric aggregates locally, bars render.
    await runAndExpectBars(page);

    await page.screenshot({ path: `${SCREENS}/metric-preview-01-default-grain.png` });
    expect(realErrors(errors)).toEqual([]);
  });

  test('re-graining the string-date split (year) still renders bars', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });

    await runAndExpectBars(page);

    // Coarser bucket of the date (date_trunc('year', CAST(<expr> AS TIMESTAMP))).
    // The grain change re-aggregates locally over the already-loaded model rows —
    // no server re-run — and must keep producing bars, not an error.
    await selectGrain(page, 'Year');
    await expect(page.getByTestId('metric-playground-bars')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground-error')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/metric-preview-02-year-grain.png` });
    expect(realErrors(errors)).toEqual([]);
  });

  test('a finer (day) grain on the string-date split still renders bars', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });

    await runAndExpectBars(page);

    await selectGrain(page, 'Day');
    await expect(page.getByTestId('metric-playground-bars')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground-error')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/metric-preview-03-day-grain.png` });
    expect(realErrors(errors)).toEqual([]);
  });
});
