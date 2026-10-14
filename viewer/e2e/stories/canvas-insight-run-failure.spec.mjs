/**
 * Story: an insight whose last run failed shows that run's error on the canvas.
 *
 * A model selecting from a table that does not exist, plus an insight on it.
 * The run fails on the insight's query, so no insight file is written. The
 * canvas must report the database error from the run, not the 404 the
 * insight-data fetch returns for the missing file.
 */
import { test, expect } from '@playwright/test';
import { WAIT, openWorkspace, selectLibraryObject } from '../helpers/workspace.mjs';
import { apiBase } from '../helpers/sandbox.mjs';

const STAMP = Date.now();
const MODEL = `e2e_missing_table_model_${STAMP}`;
const INSIGHT = `e2e_missing_table_insight_${STAMP}`;
const RUNS = `${apiBase}/api/projects/p/run/`;

test.describe('Insight canvas after a failed run', () => {
  test.setTimeout(120000);

  test.beforeAll(async ({ request }) => {
    const model = await request.post(`${apiBase}/api/models/${MODEL}/`, {
      data: { name: MODEL, sql: 'select x, y from no_such_table', source: 'ref(local-duckdb)' },
    });
    expect(model.ok()).toBeTruthy();
    const insight = await request.post(`${apiBase}/api/insights/${INSIGHT}/`, {
      data: {
        name: INSIGHT,
        props: { type: 'scatter', x: `?{\${ref(${MODEL}).x}}`, y: `?{\${ref(${MODEL}).y}}` },
      },
    });
    expect(insight.ok()).toBeTruthy();

    // Run explicitly so the story holds under either run-trigger preference;
    // a 409 means the save's own run is still in flight.
    await expect
      .poll(
        async () => (await request.post(RUNS, { data: { dag_filter: `+${INSIGHT}+` } })).status(),
        { timeout: 60000, intervals: [500] }
      )
      .toBe(201);
    await expect
      .poll(
        async () => {
          const [latest] = await (await request.get(RUNS)).json();
          return latest?.dag_filter?.includes(INSIGHT) ? latest.state : null;
        },
        { timeout: 60000, intervals: [500] }
      )
      .toBe('failed');
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${apiBase}/api/insights/${INSIGHT}/`).catch(() => {});
    await request.delete(`${apiBase}/api/models/${MODEL}/`).catch(() => {});
  });

  test("shows the run's database error, not the missing-file 404", async ({ page }) => {
    await openWorkspace(page);
    await selectLibraryObject(page, 'insight', INSIGHT);

    const preview = page.getByTestId('insight-preview');
    const runFailed = preview.getByTestId('preview-run-failed');
    await expect(runFailed).toBeVisible({ timeout: WAIT });
    await expect(runFailed).toContainText('Last run failed');
    await expect(runFailed).toContainText('Table with name no_such_table does not exist');
    await expect(preview).not.toContainText('No insight files found');
    await expect(preview).not.toContainText('404');
    await expect(preview.getByTestId('preview-error')).toHaveCount(0);
  });
});
