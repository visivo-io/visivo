/**
 * Story: date and timestamp cells in a dashboard table read as dates.
 *
 * Fixture: `table_dates` (test-projects/integration) has a DATE column, a
 * TIMESTAMP column that is always midnight, and a TIMESTAMP column with a
 * time part, rendered on `table-dates-dashboard` at full and half width.
 *
 * Precondition: a sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8084 VISIVO_SANDBOX_FRONTEND_PORT=3084 \
 *   VISIVO_SANDBOX_NAME=fix1474 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3084 npx playwright test e2e/stories/table-dates.spec.mjs
 */

import { test, expect } from '@playwright/test';

const DASHBOARD_PATH = '/project/table-dates-dashboard';
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 20000;

async function gotoTable(page, tableId) {
  await page.goto(DASHBOARD_PATH);
  await page.waitForLoadState('networkidle');
  const table = page.locator(`#${tableId}`);
  await expect(table.locator('div.flex.border-b').first()).toBeVisible({ timeout: WAIT * 2 });
  return table;
}

/** Text and overflow of every cell in the table's first rendered data row. */
async function firstRowCells(table) {
  return table
    .locator('div.flex.border-b')
    .first()
    .locator(':scope > div > div')
    .evaluateAll(cells =>
      cells.map(c => ({
        text: c.textContent.trim(),
        truncated: c.scrollWidth > c.clientWidth,
      }))
    );
}

for (const tableId of ['dates-full-width-table', 'dates-half-width-table']) {
  test(`${tableId}: dates show the date, timestamps show date and time, untruncated`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const table = await gotoTable(page, tableId);
    const [, orderDate, dayStart, eventAt] = await firstRowCells(table);
    await page.screenshot({ path: `${SCREENS}/table-dates-${tableId}.png` });

    expect(orderDate).toEqual({ text: '2021-01-01', truncated: false });
    expect(dayStart).toEqual({ text: '2021-01-01', truncated: false });
    expect(eventAt).toEqual({ text: '2021-01-01 08:30:15.000', truncated: false });
  });
}

test('sorting a date column orders by the underlying date', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const table = await gotoTable(page, 'dates-full-width-table');
  const header = table.getByText('Order Date', { exact: true });

  await header.click();
  expect((await firstRowCells(table))[1].text).toBe('2021-01-01');
  await header.click();
  expect((await firstRowCells(table))[1].text).toBe('2021-02-09');
});
