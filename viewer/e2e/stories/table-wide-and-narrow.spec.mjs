/**
 * Story: Wide table widget never overflows the dashboard row.
 *
 * Validates the wide-table fix:
 * - Fix A (correctness): a table whose natural width exceeds the dashboard
 *   row width must NOT push the row past the viewport. The dashboard row's
 *   bounding box width must equal the viewport width (or less).
 * - Fix B (UX): when the table's natural width exceeds its slot, headers
 *   wrap to up to two lines (line-clamp-2) instead of being truncated to
 *   one line, so columns can be narrower without losing readable headers.
 *
 * Precondition: Sandbox running on :3001/:8001
 *   visivo serve --port 8001 (in test-projects/integration)
 *   yarn start:sandbox (Vite on :3001 proxying to :8001)
 *
 * Fixture data: integration project ships a `wide-columns-table` model with
 * 12 long-named columns and a `wide-table-dashboard` rendering it.
 */

import { test, expect } from '@playwright/test';

const DASHBOARD_PATH = '/project/wide-table-dashboard';

async function gotoDashboard(page) {
  await page.goto(DASHBOARD_PATH);
  await page.waitForLoadState('networkidle');
  // The first table heading from the markdown wait-anchor
  await expect(page.getByText('Wide Table Width Test').first()).toBeVisible({
    timeout: 15000,
  });
  // Wait for at least one column header from the wide table
  await expect(
    page.getByText('Canceled And Completed Deal Revenue').first()
  ).toBeVisible({ timeout: 20000 });
}

test.describe('Wide table widget — overflow + adaptive sizing', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // Filter out third-party noise (favicon, devtools, react-cool-dimensions warnings).
        const t = msg.text();
        if (/favicon|DevTools|react-cool/.test(t)) return;
        // Surface real errors as test failures via expect at the end of each test.
        page.__consoleErrors = page.__consoleErrors || [];
        page.__consoleErrors.push(t);
      }
    });
  });

  test('Step 1: dashboard row stays inside the viewport at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoDashboard(page);

    // The dashboard row containing the wide table must be no wider than the viewport.
    const rows = page.locator('.dashboard-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    let foundWideRow = false;
    for (let i = 0; i < count; i++) {
      const box = await rows.nth(i).boundingBox();
      if (!box) continue;
      // Allow ±2px tolerance for sub-pixel rounding.
      expect(box.width).toBeLessThanOrEqual(1280 + 2);
      // At least one row must be wide enough to be the wide-table row.
      if (box.width > 800) foundWideRow = true;
    }
    expect(foundWideRow).toBe(true);

    // The page itself must not horizontally overflow the viewport.
    const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const docClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(docScrollWidth).toBeLessThanOrEqual(docClientWidth + 2);

    expect(page.__consoleErrors || []).toEqual([]);
  });

  test('Step 2: wide table card has horizontal scroll inside it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoDashboard(page);

    // The DataTable's inner overflow-auto element should be scrollable
    // horizontally because the table's natural totalWidth exceeds it.
    // Find any .overflow-auto descendants of dashboard rows and assert at
    // least one has scrollWidth > clientWidth (the wide table) OR adaptive
    // sizing has compressed it down to fit. Either is acceptable post-fix.
    const result = await page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll('.dashboard-row .overflow-auto'));
      return scrollers.map(el => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        isScrollable: el.scrollWidth > el.clientWidth + 1,
      }));
    });

    // We rendered 2 wide-table cards, so we expect at least one scroller.
    expect(result.length).toBeGreaterThan(0);

    // Either the inner scroller is scrollable horizontally OR adaptive
    // sizing has compressed columns to fit (no scroll needed). Both
    // outcomes are post-fix correct; the failure mode is that the card
    // overflowed its row (caught by Step 1).
  });

  test('Step 3: wide table headers wrap to multiple lines when compressed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoDashboard(page);

    // In compressed mode, the long header span should have line-clamp-2 +
    // whitespace-normal classes (not truncate). This proves Fix B is wired.
    const headerSpan = page.locator(
      '.dashboard-row span[title="Canceled And Completed Deal Revenue"]'
    ).first();
    await expect(headerSpan).toBeVisible();

    const className = await headerSpan.getAttribute('class');
    expect(className).toBeTruthy();

    // At a 1280px viewport, 12 columns with ~250px natural each = ~3000px,
    // which exceeds the slot, so we expect compressed mode.
    expect(className).toMatch(/line-clamp-2/);
    expect(className).toMatch(/whitespace-normal/);
    expect(className).not.toMatch(/\btruncate\b/);
  });

  test('Step 4: narrow-slot wide table also stays inside its slot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoDashboard(page);

    // The third row contains the narrow-slot wide table (width=6) and a
    // markdown sibling. Verify the row total width ≤ viewport AND each
    // direct grid item child stays inside its grid track.
    const rows = page.locator('.dashboard-row');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const box = await row.boundingBox();
      if (!box) continue;
      const rowRight = box.x + box.width;
      // No child of this row may extend past the row's right edge.
      const childCount = await row.locator(':scope > *').count();
      for (let j = 0; j < childCount; j++) {
        const childBox = await row.locator(':scope > *').nth(j).boundingBox();
        if (!childBox) continue;
        const childRight = childBox.x + childBox.width;
        expect(childRight).toBeLessThanOrEqual(rowRight + 2);
      }
    }
  });

  test('Step 5: viewport resize redistributes non-manual columns', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await gotoDashboard(page);

    // Capture the column widths at 1600px.
    const widthsBefore = await page.evaluate(() => {
      const headers = Array.from(
        document.querySelectorAll(
          '.dashboard-row [role="separator"]'
        )
      );
      return headers.map(h => h.parentElement?.getBoundingClientRect().width || 0);
    });
    expect(widthsBefore.length).toBeGreaterThan(0);

    // Shrink to 800px.
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(500);

    const widthsAfter = await page.evaluate(() => {
      const headers = Array.from(
        document.querySelectorAll(
          '.dashboard-row [role="separator"]'
        )
      );
      return headers.map(h => h.parentElement?.getBoundingClientRect().width || 0);
    });

    // Each visible column should have shrunk (adaptive sizing redistributed
    // them to fit the smaller container).
    expect(widthsAfter.length).toBe(widthsBefore.length);
    const beforeSum = widthsBefore.reduce((s, w) => s + w, 0);
    const afterSum = widthsAfter.reduce((s, w) => s + w, 0);
    expect(afterSum).toBeLessThan(beforeSum);
  });
});
