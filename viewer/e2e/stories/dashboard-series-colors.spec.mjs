/**
 * Story: a series keeps one colour on every chart of a dashboard.
 *
 * `series-colors-dashboard` holds two split bar charts: [Revenue, Cost] and [Cost, Margin].
 * "Cost" sits at a different trace position on each, so trace-order colouring paints it
 * differently; it must render with the same fill on both.
 *
 * Precondition: sandbox running (integration project). Read-only.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/sandbox.mjs';

const DASHBOARD = 'series-colors-dashboard';

const renderedSeriesFills = (page, chartId) =>
  page.evaluate(id => {
    const plot = document.querySelector(`#${id} .js-plotly-plot`);
    if (!plot?._fullData) return null;
    const bars = [...plot.querySelectorAll('.barlayer .trace')];
    return Object.fromEntries(
      plot._fullData.map((trace, i) => [
        trace.name,
        bars[i]?.querySelector('.point path')?.style.fill ?? null,
      ])
    );
  }, chartId);

test.describe('Dashboard series colours', () => {
  test.describe.configure({ timeout: 60000 });

  test('a series shared by two charts with different series sets renders in one colour', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/project/${DASHBOARD}`);

    await expect
      .poll(() => renderedSeriesFills(page, 'revenue-cost-chart'), { timeout: 30000 })
      .toEqual({ Revenue: expect.any(String), Cost: expect.any(String) });
    await expect
      .poll(() => renderedSeriesFills(page, 'cost-margin-chart'), { timeout: 30000 })
      .toEqual({ Cost: expect.any(String), Margin: expect.any(String) });

    const first = await renderedSeriesFills(page, 'revenue-cost-chart');
    const second = await renderedSeriesFills(page, 'cost-margin-chart');

    expect(second.Cost).toBe(first.Cost);
    expect(new Set([first.Revenue, first.Cost, second.Margin]).size).toBe(3);
  });
});
