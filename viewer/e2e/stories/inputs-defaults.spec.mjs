/**
 * Story: input defaults land on first render exactly as the YAML documents
 * them (VIS-1460 I1 / I2 / I3).
 *
 *   I1  `display.default.values: all`  -> every option is selected, and the
 *       insight that filters on `.values` returns every row (it used to be
 *       `IN ('all')`, i.e. an empty chart).
 *   I2  `display.default.values: ?{...}` -> the run writes a `defaults` parquet;
 *       the viewer selects exactly what that query returned and the filtered
 *       chart shows only those x values.
 *   I3  range `start`/`end` defaults are matched against numeric options as
 *       numbers, so the slider thumbs sit at the YAML values (100 / 500 on a
 *       0..1000 step-50 range), not at the full range.
 *
 * Assertions read the Zustand store (window.useStore, dev builds only), the
 * rendered checkbox summary ("Deselect All", "N of N"), the native
 * <input type="range"> values plus the thumb geometry, and Plotly's bound
 * `data` on each chart — nothing is eyeballed.
 *
 * Precondition: an isolated sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8033 VISIVO_SANDBOX_FRONTEND_PORT=3033 \
 *   VISIVO_SANDBOX_NAME=vis1460 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3033 npx playwright test inputs-defaults
 */

import { test, expect } from '@playwright/test';

const DASHBOARD = 'insights-dashboard';
const WAIT = 30000;

// Inputs under test (names from test-projects/integration/project.visivo.yml)
const ALL_STATIC = 'selected_groups'; //        options list, values: all
const ALL_QUERY = 'selected_x_values'; //       options query, values: all
const QUERY_DEFAULT = 'query_default_x_values'; // options query, values: ?{ x <= 3 }
const YAML_RANGE = 'x_value_range'; //          options 1..10, values: ["3".."7"]
const NUMERIC_RANGE = 'numeric_price_range'; // range 0..1000/50, start 100 end 500

test.use({ viewport: { width: 1600, height: 1200 } });

const storeSnapshot = page =>
  page.evaluate(names => {
    const s = window.useStore.getState();
    const out = {};
    for (const n of names) {
      out[n] = {
        initialized: Boolean(s.inputJobsInitialized?.[n]),
        selected: s.inputSelectedValues?.[n] ?? null,
        options: s.inputJobOptions?.[n] ?? null,
        accessors: s.inputJobs?.[n] ?? null,
      };
    }
    return out;
  }, [ALL_STATIC, ALL_QUERY, QUERY_DEFAULT, YAML_RANGE, NUMERIC_RANGE]);

const plotlyX = (page, chartName) =>
  page.evaluate(id => {
    const el = document.querySelector(`#${id} .js-plotly-plot`);
    if (!el || !el.data) return null;
    return el.data.map(t => Array.from(t.x || []).map(String));
  }, chartName);

const openDashboard = async page => {
  await page.goto(`/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  // Wait until every input under test has been seeded by useInputsData.
  await expect
    .poll(async () => Object.values(await storeSnapshot(page)).every(v => v.initialized), {
      timeout: WAIT,
    })
    .toBe(true);
};

const sortedNums = arr => [...arr].map(Number).sort((a, b) => a - b);

test.describe('Input defaults (VIS-1460)', () => {
  test.setTimeout(120000);

  test('`values: all` selects every option and the filtered chart shows every row (I1)', async ({
    page,
  }) => {
    await openDashboard(page);
    const snap = await storeSnapshot(page);

    for (const name of [ALL_STATIC, ALL_QUERY]) {
      const { selected, options, accessors } = snap[name];
      expect(Array.isArray(selected), `${name} selection is an array`).toBe(true);
      expect(options.length, `${name} has options`).toBeGreaterThan(0);
      expect([...selected].sort(), `${name}: every option selected`).toEqual([...options].sort());
      expect(accessors.values, `${name}: .values is not the literal`).not.toBe("'all'");
    }

    // The rendered checkboxes agree: header reads "Deselect All" and "N of N".
    const n = snap[ALL_QUERY].options.length;
    const box = page.locator('div.min-w-\\[200px\\]', { hasText: 'X Values (Query Checkboxes)' });
    await expect(box.getByText('Deselect All')).toBeVisible();
    await expect(box.getByText(`${n} of ${n}`)).toBeVisible();

    // The insight filtered by `IN (${selected_x_values.values})` returns every x.
    await expect
      .poll(() => plotlyX(page, 'checkboxes-filter-chart'), { timeout: WAIT })
      .not.toBeNull();
    const traces = await plotlyX(page, 'checkboxes-filter-chart');
    const xs = traces.flat();
    expect(xs.length, 'filtered chart has data points').toBeGreaterThan(0);
    expect(sortedNums(xs)).toEqual(sortedNums(snap[ALL_QUERY].options));
  });

  test('a query-based default selects exactly what the default query returned (I2)', async ({
    page,
  }) => {
    await openDashboard(page);
    const { selected, options } = (await storeSnapshot(page))[QUERY_DEFAULT];

    // Expected = the options the default query (x <= 3) would return.
    const expected = sortedNums(options.filter(o => Number(o) <= 3));
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length, 'default is a strict subset').toBeLessThan(options.length);
    expect(sortedNums(selected)).toEqual(expected);

    const box = page.locator('div.min-w-\\[200px\\]', { hasText: 'X Values (Query Default)' });
    await expect(box.getByText(`${expected.length} of ${options.length}`)).toBeVisible();

    await expect
      .poll(() => plotlyX(page, 'query-default-filter-chart'), { timeout: WAIT })
      .not.toBeNull();
    const xs = (await plotlyX(page, 'query-default-filter-chart')).flat();
    expect(sortedNums(xs)).toEqual(expected);
  });

  test('range-slider thumbs sit at the YAML defaults, matched numerically (I3)', async ({
    page,
  }) => {
    await openDashboard(page);
    const snap = await storeSnapshot(page);

    // Explicit list default on a 1..10 slider -> 3..7.
    expect(snap[YAML_RANGE].selected).toEqual(['3', '4', '5', '6', '7']);
    expect(snap[YAML_RANGE].accessors).toMatchObject({ min: 3, max: 7 });

    // start/end default on a numeric range -> every step from 100 to 500.
    expect(snap[NUMERIC_RANGE].options.length).toBe(21);
    expect(snap[NUMERIC_RANGE].selected).toEqual([
      '100',
      '150',
      '200',
      '250',
      '300',
      '350',
      '400',
      '450',
      '500',
    ]);
    expect(snap[NUMERIC_RANGE].accessors).toMatchObject({ min: 100, max: 500 });

    // Rendered sliders + thumb geometry agree with the store.
    const geometry = async label => {
      const box = page.locator('div.min-w-\\[200px\\]', { hasText: label });
      await box.scrollIntoViewIfNeeded();
      return box.evaluate(el => {
        const [minInput, maxInput] = el.querySelectorAll('input[type="range"]');
        const thumbs = [...el.querySelectorAll('div.rounded-full.border-2')];
        const track = thumbs[0].parentElement.getBoundingClientRect();
        const centers = thumbs.map(t => {
          const r = t.getBoundingClientRect();
          return (r.left + r.width / 2 - track.left) / track.width;
        });
        return {
          min: Number(minInput.value),
          max: Number(maxInput.value),
          rangeMin: Number(minInput.min),
          rangeMax: Number(minInput.max),
          centers,
        };
      });
    };

    const yaml = await geometry('X Value Range (Slider)');
    expect(yaml).toMatchObject({ min: 3, max: 7, rangeMin: 1, rangeMax: 10 });
    expect(yaml.centers[0]).toBeCloseTo((3 - 1) / 9, 2);
    expect(yaml.centers[1]).toBeCloseTo((7 - 1) / 9, 2);

    const numeric = await geometry('Price Range (Numeric Slider)');
    expect(numeric).toMatchObject({ min: 100, max: 500, rangeMin: 0, rangeMax: 1000 });
    expect(numeric.centers[0]).toBeCloseTo(0.1, 2);
    expect(numeric.centers[1]).toBeCloseTo(0.5, 2);

    // The insight filtered by x_value_range.min/.max shows exactly 3..7.
    await expect
      .poll(() => plotlyX(page, 'range-slider-chart'), { timeout: WAIT })
      .not.toBeNull();
    const xs = (await plotlyX(page, 'range-slider-chart')).flat();
    expect(sortedNums(xs)).toEqual([3, 4, 5, 6, 7]);
  });
});
