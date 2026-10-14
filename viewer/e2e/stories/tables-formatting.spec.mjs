/**
 * Story: table `format_cells` gradients and paging (VIS-1463 T4 / T5).
 *
 * Before the fix the gradient's min/max were computed over the VISIBLE PAGE,
 * `Number(null) === 0` painted empty pivot cells as the minimum, and the Rows
 * selector offered 50/100/500/1000 only, so a YAML `rows_per_page: 25` had no
 * matching option.
 *
 * This story drives the real pivot on `tables-formatting-dashboard`
 * (test-projects/integration): the `gradient_grid` model is 60 row keys
 * (r01..r60) x 3 categories pivoted with `scope: table`, 25 rows per page.
 *   - alpha = (n % 20) + 1  -> r11 and r51 both hold 12 (page 1 and page 3)
 *   - beta  = 2n, NULL every 7th key (r07, r14, ...)
 *   - gamma = 200 - n, NULL every 5th key; r01 (199) is the whole-table max
 * It asserts, from the rendered cells' inline `backgroundColor`:
 *   1. the same value has the same colour on page 1 and page 3;
 *   2. the whole-table max colour appears on page 1 and page 3's own maximum
 *      is NOT painted as the max (i.e. the range is not per page);
 *   3. NULL cells carry no background;
 *   4. the Rows selector shows 25 and lists every RowsPerPageEnum size.
 *
 * Precondition: a sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8036 VISIVO_SANDBOX_FRONTEND_PORT=3036 \
 *   VISIVO_SANDBOX_NAME=vis1463 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3036 npx playwright test e2e/stories/tables-formatting.spec.mjs
 */

import { test, expect } from '@playwright/test';

const DASHBOARD_PATH = '/project/tables-formatting-dashboard';
const TABLE_ID = 'gradient-pivot-table';
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 20000;

// #713b57 (max_color) and #ffffff (min_color) from the fixture.
const MAX_RGB = 'rgb(113, 59, 87)';
const MIN_RGB = 'rgb(255, 255, 255)';
const ENUM_SIZES = ['3', '5', '10', '25', '50', '100', '500', '1,000'];

async function gotoDashboard(page) {
  await page.goto(DASHBOARD_PATH);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Tables Formatting Test').first()).toBeVisible({ timeout: WAIT });
  const table = page.locator(`#${TABLE_ID}`);
  await expect(table).toBeVisible({ timeout: WAIT });
  // The pivot runs in DuckDB-WASM; wait for a real data row.
  await expect(table.getByText(/^r\d\d$/).first()).toBeVisible({ timeout: WAIT * 2 });
  return table;
}

/** Leaf header labels, left to right (the row-key column first). */
async function headerLabels(table) {
  const rows = table.locator('.sticky.top-0 > div.flex');
  const last = rows.nth((await rows.count()) - 1);
  return (await last.locator(':scope > div').allTextContents()).map(t => t.trim());
}

/**
 * Inline backgroundColor of every cell in the row whose key cell reads `key`.
 * Rows are virtualised (only the visible slice is in the DOM), so scroll the
 * body until the key is mounted before measuring.
 */
async function rowBackgrounds(table, key) {
  const body = table.locator('.overflow-auto').first();
  // `has:` re-queries its locator relative to each outer match, so it must be
  // page-scoped (a `table`-scoped inner locator never matches).
  const row = table.locator('div.flex.border-b', {
    has: table.page().getByText(key, { exact: true }),
  });
  for (let top = 0; top <= 1200 && (await row.count()) === 0; top += 150) {
    await body.evaluate((el, t) => {
      el.scrollTop = t;
    }, top);
    await table.page().waitForTimeout(50);
  }
  await expect(row).toHaveCount(1);
  return row.locator(':scope > div').evaluateAll(cells =>
    cells.map(c => ({ text: c.textContent.trim(), bg: c.style.backgroundColor }))
  );
}

async function sortAscendingByRowKey(page, table) {
  const labels = await headerLabels(table);
  // The row-key header is the first (sticky) column; click it until ascending.
  const header = table.locator('.sticky.top-0 > div.flex').last().locator(':scope > div').first();
  for (let i = 0; i < 3; i++) {
    const first = await table.getByText(/^r\d\d$/).first().textContent();
    if (first.trim() === 'r01') return labels;
    await header.click();
  }
  const first = await table.getByText(/^r\d\d$/).first().textContent();
  expect(first.trim()).toBe('r01');
  return labels;
}

async function gotoPage(page, table, n) {
  const indicator = table.getByText(/^\d+ \/ \d+$/);
  for (let guard = 0; guard < 10; guard++) {
    const [current] = (await indicator.textContent()).split(' / ').map(Number);
    if (current === n) return;
    await table.getByLabel(current < n ? 'Next page' : 'Previous page').click();
  }
  throw new Error(`could not reach page ${n}`);
}

test.describe('Table gradients and paging (VIS-1463)', () => {
  test.setTimeout(120000);

  test('same value, same colour on page 1 and page 3; range is whole-table; nulls unpainted', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const table = await gotoDashboard(page);
    const labels = await sortAscendingByRowKey(page, table);

    const alphaIdx = labels.findIndex(l => /alpha/i.test(l));
    const betaIdx = labels.findIndex(l => /beta/i.test(l));
    const gammaIdx = labels.findIndex(l => /gamma/i.test(l));
    expect(alphaIdx, `headers: ${labels.join(' | ')}`).toBeGreaterThan(0);
    expect(betaIdx).toBeGreaterThan(0);
    expect(gammaIdx).toBeGreaterThan(0);

    // ---- page 1 -----------------------------------------------------------
    await expect(table.getByText('1 / 3')).toBeVisible();
    const r11 = await rowBackgrounds(table, 'r11');
    const r07 = await rowBackgrounds(table, 'r07');
    const r01 = await rowBackgrounds(table, 'r01');
    await page.screenshot({ path: `${SCREENS}/tables-formatting-page1.png`, fullPage: false });

    expect(r11[alphaIdx].text).toBe('12');
    const alpha12OnPage1 = r11[alphaIdx].bg;
    expect(alpha12OnPage1).not.toBe('');
    expect(alpha12OnPage1).not.toBe(MIN_RGB);

    // r01 gamma = 199 is the maximum of the WHOLE table -> pure max colour.
    expect(r01[gammaIdx].text).toBe('199');
    expect(r01[gammaIdx].bg).toBe(MAX_RGB);

    // r07 beta is NULL (rendered as the "null" placeholder) -> no gradient
    // background at all (and not "the minimum").
    expect(r07[betaIdx].text).toBe('null');
    expect(r07[betaIdx].bg).toBe('');
    // The row-key column is never coloured.
    expect(r07[0].bg).toBe('');

    // ---- page 3 -----------------------------------------------------------
    await gotoPage(page, table, 3);
    await expect(table.getByText('3 / 3')).toBeVisible();
    const r51 = await rowBackgrounds(table, 'r51');
    const r56 = await rowBackgrounds(table, 'r56');
    await page.screenshot({ path: `${SCREENS}/tables-formatting-page3.png`, fullPage: false });

    // The SAME value (12) gets the SAME colour as on page 1.
    expect(r51[alphaIdx].text).toBe('12');
    expect(r51[alphaIdx].bg).toBe(alpha12OnPage1);

    // Page 3's own maximum (gamma r51 = 149) must NOT be painted as the max —
    // that is exactly what a per-page range would do.
    expect(r51[gammaIdx].text).toBe('149');
    expect(r51[gammaIdx].bg).not.toBe(MAX_RGB);
    expect(r51[gammaIdx].bg).not.toBe('');

    // r56 beta (56 % 7 === 0) is NULL on this page too.
    expect(r56[betaIdx].text).toBe('null');
    expect(r56[betaIdx].bg).toBe('');
  });

  test('Rows selector shows the configured 25 and lists every enum size', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    const table = await gotoDashboard(page);

    const pageSize = table.getByTestId('datatable-page-size');
    await expect(pageSize).toContainText('25');
    await expect(table.getByText('1 / 3')).toBeVisible();

    await pageSize.locator('input').first().focus();
    await page.keyboard.press('ArrowDown');
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: WAIT });
    const texts = (await options.allTextContents()).map(t => t.trim());
    expect(texts).toEqual(ENUM_SIZES);
    await page.screenshot({ path: `${SCREENS}/tables-formatting-rows-menu-900.png` });

    // Picking 10 re-pages the 60 rows into 6 pages.
    await options.filter({ hasText: /^10$/ }).click();
    await expect(table.getByText('1 / 6')).toBeVisible();
    await expect(pageSize).toContainText('10');
  });
});
