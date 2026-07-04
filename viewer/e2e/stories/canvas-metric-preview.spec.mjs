/**
 * Story: the Metric Field Lens (MetricPlayground) LIVE preview (Fix #3).
 *
 * Selecting a metric in the Library opens its middle-pane Canvas — the
 * MetricPlayground, a synthetic single-metric insight with always-defaulted
 * split-by + time-grain controls (VIS-1009). The default split for `avg_value`
 * (model `daily_metrics`) is the string dimension `formatted_date`
 * (= strftime(date,'%Y-%m-%d'), a VARCHAR). Before the fix the playground wrapped
 * that split in `date_trunc('month', <expr>)`, which DuckDB rejects on a VARCHAR
 * ("No function matches date_trunc(STRING_LITERAL, VARCHAR)") → "Preview Failed".
 *
 * The fix CASTs the split expression to TIMESTAMP before truncation
 * (`date_trunc('month', CAST(<expr> AS TIMESTAMP))`), so a real chart renders.
 *
 * This story asserts the metric LIVE preview now succeeds:
 *   - the MetricPlayground shell + split/time-grain controls mount,
 *   - a real Plotly plot becomes visible (NOT the "Preview Failed" red card),
 *   - the default (month) grain AND a re-grained (year / day) bucket of the
 *     string-date split each keep producing a real chart (the cast path).
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

// The synthetic `__metric_preview__<name>` insight has no pre-materialized data
// file, so the preview pipeline first PROBES `/api/insight-jobs/` (a benign 404)
// and then runs a fresh preview job that DOES render the chart. Those probe 404s
// are the expected "probe-then-run" handshake, not a regression — filter them so
// a real product error still fails the test. (Mirrors canvas-field-lens.spec.mjs.)
const realErrors = errors =>
  errors.filter(
    e => !/__metric_preview__|insight-jobs.*metric|Preview execution failed/i.test(e)
  );

// Wait for the metric playground to settle into a REAL chart rather than the
// "Preview Failed" card. Surfaces the failure message if it appears so a
// regression reports the actual DuckDB error instead of a bare timeout.
const expectRealChart = async page => {
  const plot = page.locator('.js-plotly-plot').first();
  const failed = page.getByTestId('preview-error');
  await expect
    .poll(
      async () => {
        if (await plot.isVisible().catch(() => false)) return 'chart';
        if (await failed.isVisible().catch(() => false)) {
          return `failed:${(await failed.textContent().catch(() => '')) || ''}`;
        }
        return 'pending';
      },
      { timeout: WAIT, message: 'metric playground never produced a real chart' }
    )
    .toBe('chart');
};

test.describe('Metric Field Lens live preview (Fix #3 — date_trunc on a string dimension)', () => {
  test.setTimeout(90000);

  test('avg_value renders a real chart with the default split + time grain (no Preview Failed)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');

    // The metric canvas frame mounts on the Canvas (preview) lens.
    await expect(page.getByTestId('workspace-middle-metric-preview')).toBeVisible({
      timeout: WAIT,
    });

    // The MetricPlayground shell + its always-defaulted controls render.
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });
    const split = page.getByTestId('metric-playground-split');
    const grain = page.getByTestId('metric-playground-time-grain');
    await expect(split).toBeVisible({ timeout: WAIT });
    await expect(grain).toBeVisible({ timeout: WAIT });

    // The default split is the string dimension `formatted_date`, time grain
    // `month` — the exact combination that used to fail. It must now plot.
    await expect(split).toHaveValue('formatted_date');
    await expect(grain).toBeEnabled();
    await expect(grain).toHaveValue('month');

    // A real Plotly plot renders (expectRealChart asserts the chart wins over
    // the "Preview Failed" card — the bug's symptom).
    await expectRealChart(page);

    await page.screenshot({ path: `${SCREENS}/fix3-01-metric-default-grain.png` });
    expect(realErrors(errors)).toEqual([]);
  });

  test('changing the time grain keeps producing a real chart', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });
    await expectRealChart(page);

    // Re-grain the string-date dimension to a coarser bucket — still a real chart.
    const grain = page.getByTestId('metric-playground-time-grain');
    await grain.selectOption('year');
    await expect(grain).toHaveValue('year');

    await expectRealChart(page);

    await page.screenshot({ path: `${SCREENS}/fix3-02-metric-year-grain.png` });
    expect(realErrors(errors)).toEqual([]);
  });

  test('a finer (day) grain on the string-date split still renders a real chart', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });

    // The split is the string dimension `formatted_date`; the grain control is
    // enabled because the candidate is date-like.
    const split = page.getByTestId('metric-playground-split');
    const grain = page.getByTestId('metric-playground-time-grain');
    await expect(split).toHaveValue('formatted_date');
    await expect(grain).toBeEnabled();
    await expectRealChart(page);

    // date_trunc('day', CAST(formatted_date AS TIMESTAMP)) — the daily bucket of
    // a VARCHAR date is exactly the cast path the fix added; it must still plot.
    await grain.selectOption('day');
    await expect(grain).toHaveValue('day');
    await expectRealChart(page);

    await page.screenshot({ path: `${SCREENS}/fix3-03-metric-day-grain.png` });
    expect(realErrors(errors)).toEqual([]);
  });
});
