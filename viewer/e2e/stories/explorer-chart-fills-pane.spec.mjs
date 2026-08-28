/**
 * Story: the Explorer's chart preview FILLS its pane, and TRACKS it when the
 * pane changes size without the window changing size (M28).
 *
 * This file measures rendered geometry — `getBoundingClientRect()` of the pane
 * versus the Plotly root — rather than eyeballing a screenshot, because the
 * two failure modes it guards are both invisible to a "looks fine" glance at a
 * single viewport:
 *
 *   FILL — `ExplorerChartPreview`'s root used to be `flex flex-1 min-h-0
 *   flex-col`. Its parent (`CenterPanel`'s chart pane) is `display:block`, so
 *   `flex-1` was inert there: the root had NO definite height, every `h-full`
 *   below it resolved against an indefinite parent and collapsed to `auto`,
 *   and Plotly fell back to its built-in 450px default no matter how tall the
 *   pane actually was. At a tall viewport that reads as a chart floating in
 *   dead space; at a short one it reads as a chart overflowing its pane.
 *
 *   TRACK — Plotly measures its container only when something tells it to, and
 *   the only thing that ever does is a window `resize` event (`react-plotly.js`
 *   installs a window listener for `useResizeHandler`; plotly.js contains no
 *   `ResizeObserver`). `CenterPanel` papers over its OWN dividers by
 *   dispatching a synthetic window resize whenever its split ratios change,
 *   but nothing covers a pane that resizes for any other reason. Dragging the
 *   workspace's RIGHT-RAIL gutter is exactly such a gesture: it changes the
 *   chart pane's width, changes none of `CenterPanel`'s ratio state, and never
 *   resizes the window — so before the fix the plot kept its stale width.
 *
 * Precondition: sandbox running (integration project), e.g.
 *   VISIVO_SANDBOX_NAME=m28 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test explorer-chart-fills-pane
 *
 * Creates an exploration per test and deletes it in afterEach; it promotes
 * nothing, so it needs no object cleanup beyond that.
 */

import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';

const SOURCE = 'local-duckdb';
const TABLE = 'test_table';

/** The pane the chart is supposed to fill: `CenterPanel`'s chart slot, whose
 *  height is definite (a flex child of a `h-full flex-col` section). */
const PANE = '[data-testid="chart-preview-pane"]';
/** Plotly's own root node — what actually got drawn, at whatever size Plotly
 *  decided on. `.js-plotly-plot` is Plotly's class, not ours. */
const PLOT = '.js-plotly-plot';

async function dragAndDrop(page, sourceLocator, targetLocator) {
  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();
  expect(sourceBox && targetBox, 'both drag endpoints have a box').toBeTruthy();

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.move(targetX, targetY, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
}

async function expandSourceTable(page) {
  const sourceHeader = page.getByTestId('library-subsection-source-header');
  const sourceBody = page.getByTestId('library-subsection-source-body');
  if (!(await sourceBody.isVisible().catch(() => false))) await sourceHeader.click();
  await expect(sourceBody).toBeVisible({ timeout: 5000 });

  await page.getByTestId(`library-row-source-${SOURCE}-toggle`).click();
  const tableRow = page.getByTestId(`library-source-table-${SOURCE}-${TABLE}`);
  await expect(tableRow).toBeVisible({ timeout: 15000 });
  return tableRow;
}

async function firstColumn(page, tableRow) {
  await tableRow.getByTestId(`library-source-table-${SOURCE}-${TABLE}-toggle`).click();
  const col = page.locator('[data-testid^="library-source-column-"]').first();
  await expect(col).toBeVisible({ timeout: 10000 });
  return col;
}

/** `CenterPanel` is responsive: under its internal 600px width threshold the
 *  SQL editor and chart become a tab toggle instead of a side-by-side split,
 *  and `ExplorerChartPreview` only mounts on the Chart tab. The no-op call in
 *  wide mode keeps this file working at either width. */
async function ensureChartTabVisible(page) {
  const toggle = page.getByTestId('toggle-chart');
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
}

/** Build a live draft chart: query, then drop a column on the x well. */
async function buildDraftChart(page) {
  await gotoExplorerHome(page);
  await newExploration(page);
  await typeSql(page, `SELECT * FROM ${TABLE}`);
  await runQuery(page);

  const tableRow = await expandSourceTable(page);
  const column = await firstColumn(page, tableRow);
  const xSlot = page.locator('[data-testid*="droppable-property-x"]').first();
  await expect(xSlot).toBeVisible({ timeout: 15000 });
  await dragAndDrop(page, column, xSlot);
  await ensureChartTabVisible(page);

  const insightName = await page.evaluate(
    () => window.useStore.getState().explorerChartInsightNames[0]
  );
  await expect(async () => {
    const data = await page.evaluate(
      name => window.useStore.getState().insightJobs[`__draft__:${name}`]?.data ?? null,
      insightName
    );
    expect(data).not.toBeNull();
  }).toPass({ timeout: 30000 });

  await expect(page.locator(PLOT)).toBeVisible({ timeout: 20000 });
}

/**
 * Read every box in ONE evaluate so they all describe the same layout frame.
 *
 * Three numbers, because two of them can disagree and only the third is proof:
 *
 *   pane  — the box the chart is supposed to fill.
 *   box   — the Plotly root's CSS box. `Chart.jsx` gives it
 *           `style={{width:'100%',height:'100%'}}`, so its WIDTH always equals
 *           its parent's whether or not anything is wired correctly. Its
 *           height is the honest one: `height:100%` against an
 *           indefinite-height parent collapses to `auto`, i.e. to whatever
 *           Plotly drew inside.
 *   drawn  — `gd._fullLayout.width/height`: the dimensions Plotly itself
 *           resolved and rendered the figure at. This is the only number that
 *           shows whether Plotly ever RE-MEASURED, which is the whole question
 *           for the tracking case — a CSS box that stretches while the figure
 *           inside it stays at its old size is precisely the bug.
 */
async function measure(page) {
  return page.evaluate(
    ([paneSel, plotSel]) => {
      const pane = document.querySelector(paneSel);
      const gd = document.querySelector(plotSel);
      if (!pane || !gd) return null;
      const p = pane.getBoundingClientRect();
      const q = gd.getBoundingClientRect();
      return {
        pane: { width: p.width, height: p.height },
        box: { width: q.width, height: q.height },
        drawn: gd._fullLayout
          ? { width: gd._fullLayout.width, height: gd._fullLayout.height }
          : null,
      };
    },
    [PANE, PLOT]
  );
}

test.describe('Explorer chart preview fills and tracks its pane (M28)', () => {
  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    idsBeforeTest = res && res.ok() ? (await res.json()).map(e => e.id) : [];
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(`${apiBase}/api/explorations/`).catch(() => null);
    const idsAfter = res && res.ok() ? (await res.json()).map(e => e.id) : [];
    for (const id of idsAfter.filter(i => !idsBeforeTest.includes(i))) {
      await page.request.delete(`${apiBase}/api/explorations/${id}/`).catch(() => {});
    }
  });

  // FILL, at two widths. 1280 and 1600 are the dossier's acceptance widths;
  // they also straddle `CenterPanel`'s 600px narrow/wide threshold once the
  // rails are subtracted, so this covers the tab-toggle layout AND the
  // side-by-side layout — two different ancestor chains to the same pane.
  for (const width of [1280, 1600]) {
    test(`the plot fills its pane at ${width}px — never Plotly's 450px default`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await buildDraftChart(page);

      // Plotly settles asynchronously after its own resize debounce (100ms).
      await expect(async () => {
        const m = await measure(page);
        expect(m, 'both the pane and the Plotly root are in the DOM').not.toBeNull();
        expect(m.drawn, 'Plotly has resolved a full layout').not.toBeNull();
        expect(m.pane.height, 'the pane itself has a real height').toBeGreaterThan(200);
        // Two claims, because either can fail alone: the CSS chain resolves to
        // the pane's height (the `h-full` half), AND Plotly drew the figure at
        // that height (the measurement half). Sub-pixel layout rounding is the
        // only slack allowed.
        const geom = `pane ${m.pane.height} / box ${m.box.height} / drawn ${m.drawn.height}`;
        expect(
          Math.abs(m.box.height - m.pane.height),
          `CSS box fills pane — ${geom}`
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(m.drawn.height - m.pane.height),
          `Plotly drew at the pane height — ${geom}`
        ).toBeLessThanOrEqual(2);
      }).toPass({ timeout: 20000 });

      const m = await measure(page);
      // Guard the specific pre-fix signature as well as the general one: 450 is
      // plotly.js's built-in default height, which is what an indefinite-height
      // container produces. Skipped when the pane happens to be ~450 tall.
      if (Math.abs(m.pane.height - 450) > 5) {
        expect(Math.round(m.drawn.height), 'not the Plotly default').not.toBe(450);
      }
    });
  }

  // TRACK. The right-rail gutter changes the chart pane's WIDTH while leaving
  // every `CenterPanel` split ratio untouched and never resizing the window —
  // so nothing but a container observation can make Plotly re-measure.
  test('the plot re-lays-out when the right rail is dragged — no window resize involved', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await buildDraftChart(page);

    await expect(async () => {
      const m = await measure(page);
      expect(m).not.toBeNull();
      expect(m.drawn).not.toBeNull();
      expect(Math.abs(m.drawn.width - m.pane.width)).toBeLessThanOrEqual(2);
    }).toPass({ timeout: 20000 });

    const before = await measure(page);

    const handle = page.getByTestId('workspace-drag-handle-right');
    await expect(handle).toBeVisible({ timeout: 10000 });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Drag left: the right rail gets wider, the middle (and so the chart pane)
    // gets narrower.
    await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect(async () => {
      const after = await measure(page);
      expect(after).not.toBeNull();
      expect(after.drawn).not.toBeNull();
      expect(after.pane.width, 'the gesture actually narrowed the pane').toBeLessThan(
        before.pane.width - 50
      );
      // `box.width` would pass here even completely unwired — the Plotly root
      // is `width:100%`, so its CSS box follows the pane by itself. Only the
      // width Plotly RESOLVED proves it re-measured.
      const geom =
        `pane ${before.pane.width}→${after.pane.width}, ` +
        `drawn ${before.drawn.width}→${after.drawn.width}`;
      expect(
        Math.abs(after.drawn.width - after.pane.width),
        `Plotly re-measured and re-drew at the new pane width — ${geom}`
      ).toBeLessThanOrEqual(2);
      expect(after.drawn.width, `the drawn width actually moved — ${geom}`).toBeLessThan(
        before.drawn.width - 50
      );
    }).toPass({ timeout: 20000 });

    // The window was never resized — the viewport is pinned for the whole
    // test, so nothing but a container observation could have triggered the
    // re-measure asserted above.
    const viewport = page.viewportSize();
    expect(viewport.width).toBe(1600);
    expect(viewport.height).toBe(1000);
  });
});
