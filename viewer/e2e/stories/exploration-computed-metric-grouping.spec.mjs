/**
 * Story: a computed METRIC grouped by a dimension re-aggregates per group,
 * and its Build-rail pill is labeled a METRIC — the regression guard for
 * smoke-test bug #1 ("Explorer computed metric treated as dimension").
 *
 * The bug: a computed column created in the Explorer (`avg_total = avg(total)`)
 * was sent to the draft-compile endpoint ONLY as a raw `model_schemas` column,
 * so the backend treated the aggregate as a plain projection — it ran
 * client-side over the sample as a per-row GLOBAL constant, and grouping by a
 * dimension returned that same global average for every group. The pill also
 * mislabeled it a dimension. The fix sends each model's `computedColumns` as
 * `draft_metrics`/`draft_dimensions` (carrying their parent model), which the
 * overlay injects MODEL-scoped so the aggregate resolves, forces
 * `requires_full_source`, and GROUP BYs correctly over the full source; and
 * folds `computedColumns` into the pill field opts so it classifies as a metric.
 *
 * Data is synthetic + self-contained (a VALUES query) so the assertion is exact:
 * groups low=avg(100,200)=150 and high=avg(1000,2000)=1500, GLOBAL avg = 825.
 * Pre-fix, both bars read 825; post-fix they read 150 and 1500.
 *
 * Precondition: sandbox running (`bash scripts/sandbox.sh start`), :3001/:8001.
 * Runs in the `exploration-mutations` project (serial) — mints a real
 * exploration record, cleaned up in afterEach.
 */
import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';
import { BASE_URL, API } from '../helpers/sandbox.mjs';

// The chart-preview pane (which mounts `useDraftInsightPreview`, the hook that
// compiles/executes the draft) only renders at a wide-enough center panel —
// same width the chart-build spec uses. Narrower and the draft never compiles.
test.use({ viewport: { width: 1700, height: 1200 } });

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
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

test.describe('Exploration computed-metric grouping (smoke-test bug #1 regression)', () => {
  test.describe.configure({ timeout: 90000 });

  let idsBeforeTest = [];

  test.beforeEach(async ({ page }) => {
    idsBeforeTest = await listExplorationIds(page);
  });

  test.afterEach(async ({ page }) => {
    const idsAfterTest = await listExplorationIds(page);
    const createdIds = idsAfterTest.filter(id => !idsBeforeTest.includes(id));
    for (const id of createdIds) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('a computed metric grouped by a dimension re-aggregates per group and its pill is a metric', async ({
    page,
  }) => {
    await gotoExplorerHome(page);
    await newExploration(page);

    // Synthetic grouped data: low → (100,200), high → (1000,2000).
    await typeSql(
      page,
      "SELECT band, total FROM (VALUES ('low', 100), ('low', 200), ('high', 1000), ('high', 2000)) AS t(band, total)"
    );
    await runQuery(page);

    // Add the computed METRIC via the real popover (exercises "Metric" detection).
    await expect(page.getByTestId('data-section-toolbar')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('add-computed-column-btn').click();
    await expect(page.getByTestId('add-computed-column-popover')).toBeVisible();
    await page.getByTestId('computed-col-name').fill('avg_total');
    await page.getByTestId('computed-col-expression').fill('avg(total)');
    await expect(page.getByTestId('detected-type-badge')).toHaveText('Metric', { timeout: 5000 });
    await page.getByTestId('add-btn').click();
    await expect(page.getByTestId('computed-pill-avg_total')).toBeVisible({ timeout: 10000 });

    // Build a bar: x = raw dimension `band`, y = computed metric `avg_total`.
    // Set via the store (the reliable non-DnD path — dragging a computed pill
    // into a well is a separate, flaky gesture); the ASSERTIONS below are on the
    // real rendered draft data + the real pill DOM, which is what the fix changes.
    const insightName = await page.evaluate(() => {
      const s = window.useStore.getState();
      const name = s.explorerChartInsightNames[0];
      s.setInsightType(name, 'bar');
      s.setInsightProp(name, 'x', '?{${ref(powerlifting_query).band}}');
      s.setInsightProp(name, 'y', '?{${ref(powerlifting_query).avg_total}}');
      return name;
    });

    // The draft preview must resolve the metric server-side and GROUP BY the
    // dimension → per-group values, NOT the global average for every group.
    await expect
      .poll(
        () =>
          page.evaluate(n => {
            const job = window.useStore.getState().insightJobs?.[`__draft__:${n}`];
            if (!job || job.data == null) return null;
            const vals = job.data
              .flatMap(r => Object.values(r))
              .filter(v => typeof v === 'number')
              .sort((a, b) => a - b);
            return JSON.stringify(vals);
          }, insightName),
        { timeout: 20000 }
      )
      .toBe(JSON.stringify([150, 1500]));

    // Falsification anchor: the pre-fix global-average outcome is [825, 825].
    const numericValues = await page.evaluate(n => {
      const job = window.useStore.getState().insightJobs[`__draft__:${n}`];
      return job.data
        .flatMap(r => Object.values(r))
        .filter(v => typeof v === 'number')
        .sort((a, b) => a - b);
    }, insightName);
    expect(numericValues).not.toEqual([825, 825]);

    // The y-pill (computed metric) classifies + labels as a METRIC: the bare
    // metric-ref label "avg_total", NOT the dimension "model ▸ column" form.
    const yPill = page.getByTestId('property-pill-y');
    await expect(yPill).toBeVisible();
    await expect(yPill).toHaveText('avg_total');
    await expect(page.getByTestId('property-pill-x')).toHaveText(/powerlifting_query.*band/);

    // Its menu header names the classification "Metric".
    await yPill.locator('..').getByTestId('pill-menu-trigger').click();
    await expect(page.getByTestId('pill-menu')).toContainText('Metric');
  });
});
