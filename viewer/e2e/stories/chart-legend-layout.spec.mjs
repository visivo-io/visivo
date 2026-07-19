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

    // P6-D13 (e2e-gap-review.md "Phase 6 delta pass") — the previous version
    // of this test polled for ANY chart's `.legend` and wrapped it in
    // try/catch + `test.skip(...)` on timeout, turning a total-legend-loss
    // regression (e.g. legend config corrupted so legends are suppressed, or
    // multi-trace charts collapsing to single-trace) into a silent,
    // permanent, invisible skip on every run instead of a failure. Target a
    // SPECIFIC, known-multi-trace-by-construction chart instead:
    // `fibonacci-split-chart` charts `fibonacci-split-insight`
    // (insights.visivo.yml), which has a `split` interaction producing 2
    // distinct trace groups ("Normal Fibonacci" / "Abnormal Fib") — Plotly
    // is guaranteed to draw a `g.legend` for it whenever legend-drawing
    // works at all. Identify it by its OWN resolved layout title
    // ("Fibonacci with Split Interaction", chart.layout.title.text in
    // project.visivo.yml) rather than a `data-testid` — react-plotly.js's
    // `<Plot>` render() only forwards a fixed whitelist of props
    // (className/divId/style/...) onto the actual DOM node, so
    // `Chart.jsx`'s `data-testid={`chart_${chart.name}`}` on `<Plot>` is
    // silently dropped and never reaches the DOM (confirmed: it doesn't
    // exist at runtime, pre-existing and out of this pass's scope — a
    // resolved-layout lookup sidesteps it entirely, matching test 1's own
    // technique above). Scroll it into view explicitly (never rely on
    // "whichever chart happens to have rendered by now" under lazy row
    // rendering) and hard-assert its legend exists — no legend here is a
    // genuine regression, never a skip.
    const CHART_TITLE = 'Fibonacci with Split Interaction';
    const chartTitleText = page.getByText(CHART_TITLE, { exact: false }).first();
    await expect(chartTitleText).toBeVisible({ timeout: 15000 });
    await chartTitleText.scrollIntoViewIfNeeded();

    let legendGeometry = null;
    await expect
      .poll(
        async () => {
          legendGeometry = await page.evaluate(titleText => {
            const plots = [...document.querySelectorAll('.js-plotly-plot')];
            const plot = plots.find(p => p._fullLayout?.title?.text?.includes(titleText));
            const legend = plot?.querySelector('g.legend');
            const svgEl = plot?.querySelector('svg.main-svg');
            const size = plot?._fullLayout?._size;
            if (!legend || !svgEl || !size) return null;
            // Compute the ACTUAL cartesian plot rectangle from Plotly's own
            // internal resolved layout math (`_fullLayout._size` — the
            // {l,t,r,b,w,h} margins/dimensions of the plotting area within
            // the SVG, in the same pixel units as the SVG's own bounding
            // rect) rather than a CSS-class selector for a background rect.
            // This chart type (bar) renders NO fill in `.bglayer` (`g.plotbg`
            // is empty) — the only element the OLD selector chain matched
            // was `rect.bg` belonging to the LEGEND's OWN background (Plotly
            // reuses the "bg" class there too), which trivially "overlapped"
            // itself. Reading Plotly's own computed geometry sidesteps any
            // dependency on which SVG elements happen to render for a given
            // trace type.
            const svgRect = svgEl.getBoundingClientRect();
            const plotTop = svgRect.top + size.t;
            const plotBottom = svgRect.top + size.t + size.h;
            const legendRect = legend.getBoundingClientRect();
            return {
              legendTop: legendRect.top,
              legendBottom: legendRect.bottom,
              plotTop,
              plotBottom,
              overlaps: legendRect.top < plotBottom && legendRect.bottom > plotTop,
            };
          }, CHART_TITLE);
          return legendGeometry;
        },
        { timeout: 20000, intervals: [500, 1000, 2000] }
      )
      .not.toBeNull();

    expect(legendGeometry.legendTop).toBeGreaterThanOrEqual(legendGeometry.plotTop);
    expect(legendGeometry.overlaps).toBe(false);
  });
});
