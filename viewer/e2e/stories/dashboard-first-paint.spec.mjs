/**
 * Story: Dashboard first paint at a wide viewport (VIS-1459 / L6)
 *
 * Seen once at 1400x1000 on the docs-examples chart dashboard: the three-up
 * chart row painted STACKED, with each Plotly figure drawn at a third of its
 * full-width card. Two things conspire:
 *   1. `useDimensions` reports `width: null` (then possibly 0) until its
 *      ResizeObserver fires, and `shouldStack` treated that as "narrower than
 *      the breakpoint" — committing a column layout from an unmeasured width.
 *   2. Charts were handed that 0/null as an explicit `layout.width`; Plotly's
 *      `plotAutoSize` falls back to the figure's PREVIOUS width when the node
 *      has no measurable width, so a figure autosized in that window kept its
 *      earlier (one-third) size.
 * The fix never stacks from an unmeasured width and hands leaves `undefined`
 * (Plotly autosizes against the live container, and Chart's own
 * ResizeObserver re-fires a resize once the box settles).
 *
 * This story records the row's geometry EVERY animation frame from before the
 * app boots (addInitScript), then asserts on the FIRST frame in which any
 * Plotly svg exists — i.e. the first paint, with no resize ever sent:
 *   - the row is a grid (not a column), and
 *   - each chart's plotted svg is at least 90% of its own slot and, for the
 *     three-up docs-examples row, at least 30% of the dashboard width.
 *
 * Preconditions:
 *   - Integration sandbox on PLAYWRIGHT_BASE_URL (default :3001):
 *     `simple-dashboard` row 1 is a three-chart row (widths 3/4/3).
 *   - Optional docs-examples sandbox on DOCS_EXAMPLES_BASE_URL — the exact
 *     dashboard the bug was seen on (`chart-layout-examples`, three equal
 *     charts). Start it with:
 *       .venv/bin/visivo run -w test-projects/docs-examples
 *       VISIVO_SANDBOX_PROJECT_DIR=$PWD/test-projects/docs-examples \
 *         VISIVO_SANDBOX_BACKEND_PORT=8042 VISIVO_SANDBOX_FRONTEND_PORT=3042 \
 *         VISIVO_SANDBOX_NAME=docs bash scripts/sandbox.sh start
 *     and run with DOCS_EXAMPLES_BASE_URL=http://localhost:3042. The test is
 *     skipped when the variable is unset.
 */

import { test, expect } from '@playwright/test';

const VIEWPORT = { width: 1400, height: 1000 };
const SCREENS = 'e2e/stories/__screens__';
const DOCS_EXAMPLES_BASE_URL = process.env.DOCS_EXAMPLES_BASE_URL || '';

// Installed before any app script runs: samples the target row every frame
// and keeps one entry per distinct geometry signature.
const recorder = ({ rowSel }) => {
  window.__firstPaintLog = [];
  let last = '';
  const tick = () => {
    const row = document.querySelector(rowSel);
    if (row) {
      const dash = document.querySelector('[data-testid^="dashboard_"]');
      const items = [...row.querySelectorAll(':scope > [data-canvas-path]')].map(el => {
        const b = el.getBoundingClientRect();
        const svg = el.querySelector('.main-svg');
        const sb = svg ? svg.getBoundingClientRect() : null;
        return {
          x: Math.round(b.x),
          w: Math.round(b.width),
          h: Math.round(b.height),
          svgW: sb ? Math.round(sb.width) : null,
          svgH: sb ? Math.round(sb.height) : null,
        };
      });
      const entry = {
        display: getComputedStyle(row).display,
        dash: dash ? Math.round(dash.getBoundingClientRect().width) : null,
        items,
      };
      const sig = JSON.stringify(entry);
      if (sig !== last) {
        last = sig;
        window.__firstPaintLog.push({ t: Math.round(performance.now()), ...entry });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const firstPaintOf = async (page, url, rowSel, expectedItems) => {
  await page.addInitScript(recorder, { rowSel });
  await page.goto(url, { waitUntil: 'commit' });
  // Wait until every item in the row has a plotted svg (data arrives per chart).
  await page.waitForFunction(
    n =>
      (window.__firstPaintLog || []).some(
        e => e.items.length === n && e.items.every(it => it.svgW)
      ),
    expectedItems,
    { timeout: 60000 }
  );
  const log = await page.evaluate(() => window.__firstPaintLog);
  // First paint = the first frame in which ANY chart svg exists.
  const first = log.find(e => e.items.some(it => it.svgW));
  const settled = [...log].reverse().find(e => e.items.every(it => it.svgW));
  return { log, first, settled };
};

const assertNoStackedPaint = ({ log, first, settled }, { minFractionOfDash }) => {
  // Every frame from the first chart paint onward is a grid — the layout never
  // flips through a column (a stacked frame followed by a grid frame is the
  // flash this story guards against, not just the final state).
  const painted = log.slice(log.indexOf(first));
  for (const e of painted) {
    expect(e.display, `row painted stacked at t=${e.t}ms: ${JSON.stringify(e)}`).toBe('grid');
  }
  // On first paint, each plotted chart fills its slot (no "third of its card").
  for (const it of first.items) {
    if (!it.svgW) continue;
    expect(it.svgW, `first-paint svg ${JSON.stringify(it)}`).toBeGreaterThanOrEqual(0.9 * it.w);
    if (minFractionOfDash) {
      expect(it.svgW).toBeGreaterThanOrEqual(minFractionOfDash * first.dash);
    }
  }
  // And once everything has plotted, every chart still fills its own slot.
  for (const it of settled.items) {
    expect(it.svgW).toBeGreaterThanOrEqual(0.9 * it.w);
    expect(it.svgH).toBeGreaterThanOrEqual(0.8 * it.h);
  }
};

test.describe('Dashboard first paint at 1400x1000 (VIS-1459 L6)', () => {
  test.use({ viewport: VIEWPORT });
  test.describe.configure({ timeout: 90000 });

  test('integration simple-dashboard: the three-chart row paints as a grid with full-slot charts, no resize', async ({
    page,
  }) => {
    const result = await firstPaintOf(
      page,
      '/project/simple-dashboard',
      '[data-testid="dashboard-row-1"]',
      3
    );
    assertNoStackedPaint(result, { minFractionOfDash: 0 });
    // Widths are 3/4/3 of a 10-unit row: the narrow charts are ~27% of the
    // dashboard once gaps and padding come off; pin a floor below that.
    for (const it of result.settled.items) {
      expect(it.svgW).toBeGreaterThanOrEqual(0.25 * result.settled.dash);
    }
    await page.screenshot({ path: `${SCREENS}/vis1459-first-paint-integration.png` });
  });

  test('docs-examples chart-layout-examples: three-up row charts are >= 30% of the dashboard on first paint', async ({
    page,
  }) => {
    test.skip(!DOCS_EXAMPLES_BASE_URL, 'DOCS_EXAMPLES_BASE_URL not set (docs-examples sandbox)');
    const result = await firstPaintOf(
      page,
      `${DOCS_EXAMPLES_BASE_URL}/project/chart-layout-examples`,
      '[data-testid="dashboard-row-1"]',
      3
    );
    assertNoStackedPaint(result, { minFractionOfDash: 0.3 });
    await page.screenshot({ path: `${SCREENS}/vis1459-first-paint-docs-examples.png` });
  });
});
