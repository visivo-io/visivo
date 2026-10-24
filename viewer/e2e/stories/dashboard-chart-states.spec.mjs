/**
 * Story: a dashboard chart with nothing to draw says why.
 *
 * One chart's insight reads a missing table, so its run fails and no insight
 * file is written. The other chart's filter matches no rows. Neither may spin
 * forever or show a DuckDB catalog error: the first shows the run's error and
 * a link to the Runs page, the second shows "No rows match".
 */
import { test, expect } from '@playwright/test';
import { apiBase } from '../helpers/sandbox.mjs';

const STAMP = Date.now();
const BROKEN_MODEL = `e2e_states_missing_table_${STAMP}`;
const BROKEN_INSIGHT = `e2e_states_broken_insight_${STAMP}`;
const BROKEN_CHART = `e2e_states_broken_chart_${STAMP}`;
const EMPTY_MODEL = `e2e_states_rows_${STAMP}`;
const EMPTY_INSIGHT = `e2e_states_empty_insight_${STAMP}`;
const EMPTY_CHART = `e2e_states_empty_chart_${STAMP}`;
const DASHBOARD = `e2e_states_dashboard_${STAMP}`;
const RUNS = `${apiBase}/api/projects/p/run/`;

const post = async (request, path, data) => {
  const response = await request.post(`${apiBase}/api/${path}/${data.name}/`, { data });
  expect(response.ok()).toBeTruthy();
};

test.describe('Dashboard charts with no data to draw', () => {
  test.setTimeout(120000);

  test.beforeAll(async ({ request }) => {
    await post(request, 'models', {
      name: BROKEN_MODEL,
      sql: 'select x, y from no_such_table',
      source: 'ref(local-duckdb)',
    });
    await post(request, 'models', {
      name: EMPTY_MODEL,
      sql: "select 'BEV' as powertrain, 3 as units",
      source: 'ref(local-duckdb)',
    });
    await post(request, 'insights', {
      name: BROKEN_INSIGHT,
      props: {
        type: 'scatter',
        x: `?{\${ref(${BROKEN_MODEL}).x}}`,
        y: `?{\${ref(${BROKEN_MODEL}).y}}`,
      },
    });
    await post(request, 'insights', {
      name: EMPTY_INSIGHT,
      props: {
        type: 'pie',
        labels: `?{\${ref(${EMPTY_MODEL}).powertrain}}`,
        values: `?{sum(\${ref(${EMPTY_MODEL}).units})}`,
      },
      interactions: [{ filter: `?{\${ref(${EMPTY_MODEL}).powertrain} = 'bev'}` }],
    });
    await post(request, 'charts', { name: BROKEN_CHART, insights: [`ref(${BROKEN_INSIGHT})`] });
    await post(request, 'charts', { name: EMPTY_CHART, insights: [`ref(${EMPTY_INSIGHT})`] });
    await post(request, 'dashboards', {
      name: DASHBOARD,
      rows: [
        {
          height: 'medium',
          items: [{ chart: `ref(${BROKEN_CHART})` }, { chart: `ref(${EMPTY_CHART})` }],
        },
      ],
    });

    // Run explicitly so the story holds under either run-trigger preference;
    // a 409 means the save's own run is still in flight.
    await expect
      .poll(
        async () =>
          (await request.post(RUNS, { data: { dag_filter: `+${DASHBOARD}+` } })).status(),
        { timeout: 60000, intervals: [500] }
      )
      .toBe(201);
    await expect
      .poll(
        async () => {
          const [latest] = await (await request.get(RUNS)).json();
          return latest?.dag_filter?.includes(DASHBOARD) ? latest.state : null;
        },
        { timeout: 60000, intervals: [500] }
      )
      .toBe('failed');
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${apiBase}/api/dashboards/${DASHBOARD}/delete/`).catch(() => {});
    for (const [path, name] of [
      ['charts', BROKEN_CHART],
      ['charts', EMPTY_CHART],
      ['insights', BROKEN_INSIGHT],
      ['insights', EMPTY_INSIGHT],
      ['models', BROKEN_MODEL],
      ['models', EMPTY_MODEL],
    ]) {
      await request.delete(`${apiBase}/api/${path}/${name}/`).catch(() => {});
    }
  });

  test('a failed chart shows its run error and an empty chart says no rows match', async ({
    page,
  }) => {
    await page.goto(`/project/${DASHBOARD}`);

    const failed = page.getByTestId(`chart_build_error_${BROKEN_CHART}`);
    await expect(failed).toBeVisible({ timeout: 60000 });
    await expect(failed).toContainText("This chart's data failed to build");
    await expect(failed).toContainText('no_such_table');
    await expect(failed.getByRole('link', { name: 'Open the Runs page' })).toBeVisible();

    const empty = page.getByTestId(`chart_empty_${EMPTY_CHART}`);
    await expect(empty).toBeVisible({ timeout: 60000 });
    await expect(empty).toContainText('No rows match');
    await expect(page.getByTestId(`chart_error_${EMPTY_CHART}`)).toHaveCount(0);

    await failed.getByRole('link', { name: 'Open the Runs page' }).click();
    await expect(page).toHaveURL(/\/runs$/);
  });
});
