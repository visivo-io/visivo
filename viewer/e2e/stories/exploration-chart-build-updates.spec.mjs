/**
 * Story: the chart-building loop in an exploration keeps the preview in sync
 * with every edit — drag a column, aggregate it, add a computed column, change
 * a layout property, switch chart type.
 *
 * Written after Jared hit two of these live: dropping a COMPUTED column into a
 * prop well failed with `Column 'less_than_4' not found on model 'model'.
 * Available columns: X, Y` — naming as unavailable a column visibly present in
 * the results grid directly below the error — and the chart then stayed broken
 * through subsequent edits.
 *
 * Root cause was that the preview built its model schema and its DuckDB table
 * from `queryResult` (what the source returned) rather than `enrichedResult`
 * (that plus the user's computed columns — what the grid renders and what a
 * user drags FROM). Verified by reverting the fix: step 4 below fails and every
 * later step stays failed.
 *
 * These assertions deliberately check the chart is CURRENT, not merely present:
 * a stale Plotly surface left over from the previous edit looks identical to a
 * working one, and "the preview silently stopped updating" is the exact class
 * of bug this story exists to catch.
 *
 * Precondition: sandbox running (integration project) —
 *   bash scripts/sandbox.sh start
 *   npx playwright test exploration-chart-build-updates
 */

import { test, expect } from '@playwright/test';
import { BASE_URL, apiBase } from '../helpers/sandbox.mjs';
import { typeSql, runQuery } from '../helpers/explorer.mjs';

test.use({ viewport: { width: 1700, height: 1200 } });
test.describe.configure({ timeout: 120000 });

const SQL = 'select 1 as x, 10 as y union all select 2, 20 union all select 3, 15';

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 15000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 15000 });
  return new URL(page.url()).pathname.split('/').pop();
}

/** Real pointer drag — dnd-kit's PointerSensor needs >8px of movement, and a
 *  settle at the final point so the drop resolves against a RESTING pointer. */
async function drag(page, srcSel, dstSel) {
  const src = page.locator(srcSel).first();
  const dst = page.locator(dstSel).first();
  await expect(src).toBeVisible({ timeout: 15000 });
  await expect(dst).toBeVisible({ timeout: 15000 });
  const a = await src.boundingBox();
  const b = await dst.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 3 });
  await page.waitForTimeout(120);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

/** The preview must be a rendered chart — never the failure panel, and never
 *  the "nothing yet" state once props are bound. */
async function expectLiveChart(page, step) {
  // Assert that a plotly surface IS VISIBLE, not that the first matching node
  // is. During a re-render the DOM can briefly hold more than one
  // `.js-plotly-plot` (an outgoing one still detaching), and `.first()` can
  // land on the hidden one — which fails while the user is looking at a
  // perfectly good chart. Observed as a 1-in-3 flake before this changed.
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll('.js-plotly-plot')].filter(el => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
            }).length
        ),
      {
        message: `${step}: at least one plotly surface is visible`,
        timeout: 30000,
      }
    )
    .toBeGreaterThan(0);
  await expect(page.getByText('This preview failed to run'), `${step}: no failure panel`).toHaveCount(
    0
  );
  await expect(page.getByText(/not found on model/), `${step}: no column-not-found`).toHaveCount(0);
}

test.describe('Chart-building keeps the preview in sync with every edit', () => {
  let createdId = null;
  let createdMetric = null;

  test.afterEach(async ({ page }) => {
    if (createdId) {
      await page.request.delete(`${apiBase}/api/explorations/${createdId}/`).catch(() => {});
      createdId = null;
    }
    if (createdMetric) {
      await page.request
        .delete(`${apiBase}/api/metrics/${encodeURIComponent(createdMetric)}/`)
        .catch(() => {});
      createdMetric = null;
    }
  });

  test('drag → aggregate → computed column → layout prop → type switch each keep a live chart', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    createdId = await newExploration(page);

    await typeSql(page, SQL);
    await runQuery(page);

    // 1. Bind x and y by dragging real result columns.
    await drag(page, '[data-testid="draggable-col-x"]', '[data-testid="droppable-property-x"]');
    await drag(page, '[data-testid="draggable-col-y"]', '[data-testid="droppable-property-y"]');
    await expectLiveChart(page, 'after x/y drags');

    // 2. A computed column is a first-class result column: the grid renders it,
    //    so dropping it into a well must work exactly like a source column.
    await page.getByTestId('add-computed-column-btn').first().click();
    await page.getByTestId('computed-col-name').fill('less_than_4');
    await page
      .getByTestId('computed-col-expression')
      .fill("CASE WHEN x < 4 THEN 'low' ELSE 'high' END");
    const addBtn = page.getByTestId('add-btn');
    await expect(addBtn).toBeEnabled({ timeout: 20000 });
    await addBtn.click();
    await expect(page.getByTestId('computed-pill-less_than_4')).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByTestId('draggable-col-less_than_4'),
      'computed column appears in the results grid'
    ).toBeVisible({ timeout: 20000 });

    await drag(
      page,
      '[data-testid="draggable-col-less_than_4"]',
      '[data-testid="droppable-property-x"]'
    );
    // The regression: the compile used to receive only the SOURCE's columns, so
    // this failed with "Column 'less_than_4' not found on model 'model'".
    await expectLiveChart(page, 'after computed column → x');

    // 3. The bound pill must actually name the computed column — a preview that
    //    kept rendering the PREVIOUS x would also satisfy "a chart is visible".
    await expect(page.getByTestId('droppable-property-x')).toContainText('less_than_4');

    // 4. A layout property edit must not blank the chart.
    await page.getByRole('button', { name: /add propert/i }).first().click();
    const search = page.getByPlaceholder(/search propert/i);
    await expect(search).toBeVisible({ timeout: 15000 });
    // Merely OPENING the property picker must not disturb the preview.
    await expectLiveChart(page, 'with the property picker open');
    await search.fill('title');
    await expectLiveChart(page, 'while searching properties');
    // Results are grouped and collapsed; expand the group that owns the
    // property before selecting it, the same as a user would.
    await page.getByText('title', { exact: true }).first().click();
    // The picker labels each option with only the LEAF name (`text`, not
    // `title.text`), so select by path. It also lives in a max-height scroll
    // container, so a match below the fold needs scrolling into view before it
    // is clickable.
    const titleOption = page.getByTestId('property-option-title.text');
    await expect(titleOption, 'title.text is among the results for "title"').toHaveCount(1, {
      timeout: 15000,
    });
    await titleOption.scrollIntoViewIfNeeded();
    await titleOption.click();
    await expectLiveChart(page, 'after adding title.text');

    const titleInput = page.locator('input[type="text"]:not([placeholder*="Search"])').last();
    await titleInput.fill('My Chart Title');
    await titleInput.blur();
    await expectLiveChart(page, 'after typing a title');

    // 5. Promoting a bound pill to a metric must not disturb the chart. The
    //    metric flow has its own spec (save-as-metric.spec.mjs) covering the
    //    naming, collision and born-bound-to-parent-model contracts; what is
    //    NOT covered anywhere is whether the CHART survives it — the pill is
    //    rewritten from an inline aggregate to a metric reference underneath,
    //    which is exactly the kind of swap that can silently blank a preview.
    const ySlot = page.getByTestId('droppable-property-y');
    await ySlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 10000 });
    // Only an AGGREGATE pill can become a metric (PillMenu gates the action and
    // says so in its tooltip), so apply a preset first — which is itself an
    // edit the chart has to survive.
    await page.getByTestId('pill-menu-preset-sum').click();
    await expectLiveChart(page, 'after applying the SUM preset to y');
    await expect(ySlot).toContainText('SUM');

    await ySlot.getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toBeVisible({ timeout: 10000 });
    const saveAsMetric = page.getByTestId('pill-menu-save-as-metric');
    await expect(saveAsMetric).toBeEnabled({ timeout: 10000 });
    await saveAsMetric.click();
    await expect(page.getByTestId('save-as-metric-prompt')).toBeVisible({ timeout: 10000 });
    const metricName = await page.getByTestId('save-as-metric-name-input').inputValue();
    createdMetric = metricName;
    await page.getByTestId('save-as-metric-submit').click();
    await expect(page.getByTestId('save-as-metric-prompt')).not.toBeVisible({ timeout: 20000 });

    // The pill now names the metric rather than the raw aggregate...
    await expect(ySlot).toContainText(metricName);
    await expect(ySlot, 'never raw ref syntax (D8)').not.toContainText('?{');
    // ...and the chart is still live, bound to it.
    await expectLiveChart(page, 'after saving the y pill as a metric');

    // 6. Switching chart type must carry the bound props over, not blank out.
    await page.locator('[data-testid^="type-selector"]').first().click();
    await page.getByText('Bar', { exact: true }).first().click();
    await expectLiveChart(page, 'after scatter → bar');
    await expect(
      page.getByTestId('droppable-property-x'),
      'x binding survives the type switch'
    ).toContainText('less_than_4');
    await expect(
      page.getByTestId('droppable-property-y'),
      'the metric binding survives the type switch too'
    ).toContainText(createdMetric);
  });
});
