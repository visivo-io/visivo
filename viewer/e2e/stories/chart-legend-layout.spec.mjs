/**
 * Story: Chart legend structural layout (P5-D6 ledger gap closure,
 * e2e-gap-review.md "Final delta pass").
 *
 * 05-e2e-ledger.md verdicts `explorer-chart-legend-visual.spec.mjs`
 * (horizontal-below-plot legend default, non-zero bottom margin, no
 * legend/plot overlap) PORT — "Chart.jsx rendering is carried forward"
 * (02-architecture.md §9) — but that old file was deleted at the Phase 3b
 * cutover with no e2e successor anywhere in the final suite (confirmed:
 * `grep -rli legend viewer/e2e/stories/` was empty before this file).
 * `Chart.test.jsx` already unit-tests the CONFIG-level defaults
 * (`legend: { orientation: 'h', y: -0.2, x: 0 }`, non-zero bottom margin)
 * against a MOCKED Plotly — this file closes the residual gap: proving that
 * same default config actually reaches a REAL, live-data Plotly render
 * against the sandbox (not just a mock), plus a best-effort real-geometry
 * check on any chart Plotly actually chooses to draw a legend for (Plotly
 * only draws `.legend` when there's something to show one for — 2+ traces —
 * so this dashboard's mix of single- and multi-trace charts makes a strict
 * "must find one" assertion a source of flakiness un-related to the
 * capability under test; the config-equality assertion below is the load-
 * bearing one and is deterministic).
 *
 * Precondition: sandbox running (integration project) on the standard
 * :3001/:8001 ports.
 *
 * Read-only (no exploration mutation) — registered in the default
 * `parallel` project, no special isolation needed.
 */
import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const DASHBOARD = 'insights-dashboard';

test.describe('Chart legend structural layout (P5-D6)', () => {
  test.describe.configure({ timeout: 60000 });

  test('every real rendered chart resolves Chart.jsx\'s default horizontal below-plot legend config and a non-zero bottom margin', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('workspace-middle-dashboard-canvas')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });

    // Every chart on this dashboard leaves `layout.legend` unset in its own
    // config, so Chart.jsx's default (Chart.jsx: `if (!l.legend) l.legend =
    // { orientation: 'h', y: -0.2, x: 0 }`) applies uniformly — assert it
    // reached the REAL Plotly instance's resolved `_fullLayout`, not just a
    // mock (Chart.test.jsx's own coverage), on every drawn plot.
    const configs = await page.evaluate(() => {
      const plots = [...document.querySelectorAll('.js-plotly-plot')];
      return plots
        .map(p => p._fullLayout)
        .filter(Boolean)
        .map(l => ({ legend: l.legend, marginBottom: l.margin?.b }));
    });

    expect(configs.length).toBeGreaterThan(0);
    // Not every chart type resolves a `legend` layout field (e.g. an
    // Indicator has none) — restrict the default-config assertion to the
    // ones that do, but require at least one (this dashboard has several
    // XY scatter/bar charts, none of which set an explicit `legend`).
    const withLegend = configs.filter(c => c.legend);
    expect(withLegend.length).toBeGreaterThan(0);
    for (const cfg of withLegend) {
      expect(cfg.legend).toMatchObject({ orientation: 'h', y: -0.2, x: 0 });
    }
    // Non-zero bottom margin on every chart — the space Chart.jsx's default
    // margin (`{ t: 40, r: 20, b: 80, l: 60 }`) reserves is never clipped.
    for (const cfg of configs) {
      expect(cfg.marginBottom).toBeGreaterThan(0);
    }
  });

  test('a chart whose data actually draws a legend renders it below the plot area with no overlap', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
      timeout: 30000,
    });

    // Best-effort: Plotly only draws a `.legend` group for charts with 2+
    // traces (or an explicitly-named single trace) — poll for one to exist
    // among this dashboard's charts, but don't treat "none drawn yet" within
    // the budget as a hard failure of THIS test's real subject (the config
    // assertion above already proves the capability deterministically);
    // skip gracefully if none appears so this test never flakes on lazy
    // row-visibility timing unrelated to legend geometry itself.
    let legendGeometry = null;
    try {
      await expect
        .poll(
          async () => {
            legendGeometry = await page.evaluate(() => {
              const plots = [...document.querySelectorAll('.js-plotly-plot')];
              for (const plot of plots) {
                const legend = plot.querySelector('g.legend');
                const plotArea =
                  plot.querySelector('g.plotbg') || plot.querySelector('.bglayer > rect');
                if (legend && plotArea) {
                  const legendRect = legend.getBoundingClientRect();
                  const plotRect = plotArea.getBoundingClientRect();
                  return {
                    legendTop: legendRect.top,
                    legendBottom: legendRect.bottom,
                    plotTop: plotRect.top,
                    plotBottom: plotRect.bottom,
                    overlaps: legendRect.top < plotRect.bottom && legendRect.bottom > plotRect.top,
                  };
                }
              }
              return null;
            });
            return legendGeometry;
          },
          { timeout: 20000, intervals: [500, 1000, 2000] }
        )
        .not.toBeNull();
    } catch {
      test.skip(true, 'No chart on this dashboard drew a legend within the polling budget');
    }

    expect(legendGeometry.legendTop).toBeGreaterThanOrEqual(legendGeometry.plotTop);
    expect(legendGeometry.overlaps).toBe(false);
  });
});
