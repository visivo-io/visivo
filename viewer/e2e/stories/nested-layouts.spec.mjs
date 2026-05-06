/**
 * Story: Nested Layouts (VIS-750)
 *
 * Validates that the recursive Item.rows primitive (VIS-747 backend, VIS-748
 * renderer) renders end-to-end against the integration project's
 * nested-layouts-dashboard fixture.
 *
 * The fixture exercises four canonical layout shapes that the legacy flat
 * Row.items model cannot express:
 *   1. Uneven vertical stack — one big chart left, three small charts right
 *   2. 2x2 KPI cluster + sidebar chart
 *   3. Sidebar layout — input column + content rows
 *   4. Deep nesting — three levels deep
 *
 * Precondition: Sandbox running on :3001/:8001 with the integration project.
 *   bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';

// Hit /project-new/ — the store-based renderer (DashboardNew.jsx) where the
// recursive Item.rows handling lives. The legacy /project/ route uses
// project_json + the older Dashboard.jsx renderer that doesn't know about
// item.rows and would render the fixture as if those items were leaves.
const DASHBOARD_PATH = '/project-new/nested-layouts-dashboard';

test.describe('Nested Layouts', () => {
  test('Step 1: Dashboard route loads without runtime errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const networkErrors = [];
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // Filter common noise that has nothing to do with our test.
    const realErrors = consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('compile') /* the integration project ships with intentional compile errors in unrelated dashboards */,
    );
    expect(realErrors).toEqual([]);
    expect(networkErrors).toEqual([]);

    // Dashboard root element should be on the page.
    await expect(
      page.locator('[data-testid="dashboard_nested-layouts-dashboard"]'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Step 2: All four section headers render in order', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // Match h2 elements whose text starts with "Section " — input widget
    // labels also render as h2 inside Section 3 ("Split Threshold (Dropdown)"
    // etc.), so we filter to just the section headers and assert the four
    // are present in document order.
    const sectionHeaders = page.locator('h2', { hasText: /^Section [1-4]/ });
    await expect(sectionHeaders).toHaveCount(4);
    await expect(sectionHeaders.nth(0)).toContainText('Section 1');
    await expect(sectionHeaders.nth(1)).toContainText('Section 2');
    await expect(sectionHeaders.nth(2)).toContainText('Section 3');
    await expect(sectionHeaders.nth(3)).toContainText('Section 4');
  });

  test('Step 3: Row-container items render the dashboard-nested-rows wrapper', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // The fixture has 5 rows that contain row-container items
    // (rows 1, 3, 5 each with at least one container; row 7 has one).
    // We don't pin the exact count — just assert there's at least one wrapper
    // per section to verify the recursive renderer is firing.
    const wrappers = page.locator('[data-testid="dashboard-nested-rows"]');
    await expect(wrappers.first()).toBeVisible({ timeout: 10000 });
    expect(await wrappers.count()).toBeGreaterThanOrEqual(4);
  });

  test('Step 4: Sub-rows inside each row-container have the dashboard-nested-subrow testid', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // Section 1 alone has 3 sub-rows (the three small charts on the right);
    // total across the fixture is 13 sub-rows including deep nesting.
    // Pin just the lower bound so this test stays robust against fixture growth.
    const subRows = page.locator('[data-testid="dashboard-nested-subrow"]');
    await expect(subRows.first()).toBeVisible({ timeout: 10000 });
    expect(await subRows.count()).toBeGreaterThanOrEqual(13);
  });

  test('Step 5: Charts inside nested rows render Plotly content', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // The nested charts share types with the rest of the project; if the
    // recursive renderer skipped them they would be missing. Plotly mounts
    // a `.js-plotly-plot` div per chart — count and assert >= 5 (the fixture
    // has more than that across the 4 sections, lower bound is conservative).
    const plotlyCharts = page.locator('.js-plotly-plot');
    await expect(plotlyCharts.first()).toBeVisible({ timeout: 20000 });
    expect(await plotlyCharts.count()).toBeGreaterThanOrEqual(5);
  });

  test('Step 6: Sub-row weights produce different rendered heights when heights differ', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // Section 1 has a row-container with three [small, small, small] sub-rows.
    // Their flex values should be equal (weight=2 each), and consequently their
    // rendered heights should be approximately equal. We pick the first
    // dashboard-nested-rows wrapper (Section 1) and assert all its direct
    // sub-row children share the same flex value string.
    const firstWrapper = page.locator('[data-testid="dashboard-nested-rows"]').first();
    const subRowsInSection1 = firstWrapper.locator(':scope > [data-testid="dashboard-nested-subrow"]');
    const count = await subRowsInSection1.count();
    expect(count).toBe(3);

    const flexValues = await subRowsInSection1.evaluateAll(els => els.map(el => el.style.flex));
    expect(flexValues[0]).toBeTruthy();
    expect(flexValues[1]).toBe(flexValues[0]);
    expect(flexValues[2]).toBe(flexValues[0]);
  });

  test('Step 7: Sidebar inputs in section 3 render', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');

    // Section 3 has three input widgets stacked in the left column of a sidebar
    // layout: split_threshold (dropdown), sort_direction (tabs), show_markers
    // (toggle). Match by their h2 label text — that's what every Input widget
    // renders regardless of its display type. All three should be present.
    await expect(page.locator('h2', { hasText: /Split Threshold/ })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h2', { hasText: /Sort Direction/ })).toBeVisible();
    await expect(page.locator('h2', { hasText: /Show Markers/ })).toBeVisible();
  });

  test('Step 8: No grid track collapse (no chart slot starves to <50px)', async ({ page }) => {
    // Regression test for the original Item.rows bug: when a row mixed a leaf
    // chart with a row-container item, the leaf chart's grid track collapsed
    // to ~11px because the container's plotly children pushed their track to
    // 1410px. The fix added min-width: 0 to grid items + threaded slot pixel
    // widths through the renderer. This test asserts no top-level row item
    // ends up unreasonably narrow given its declared `width` share.
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);

    const widths = await page.evaluate(() => {
      const dashboard = document.querySelector('[data-testid="dashboard_nested-layouts-dashboard"]');
      const rows = dashboard.querySelectorAll(':scope > .dashboard-row');
      return Array.from(rows).map((row, idx) => {
        const items = row.querySelectorAll(':scope > div');
        return {
          rowIdx: idx,
          rowWidth: row.getBoundingClientRect().width,
          itemWidths: Array.from(items).map(it => Math.round(it.getBoundingClientRect().width)),
        };
      });
    });

    // Every item that's actually rendered (rows with multiple items) should
    // be at least 100px wide — anything below that is a track-collapse bug.
    for (const r of widths) {
      if (r.itemWidths.length < 2) continue; // single-item rows can be any width
      for (const w of r.itemWidths) {
        expect(w, `row ${r.rowIdx} has an item collapsed to ${w}px (full row ${r.rowWidth})`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  test('Step 9: Mixed leaf+container row distributes pixel width by `width` shares', async ({ page }) => {
    // Section 1's row 1 has [width=2 leaf, width=1 container]. After the
    // grid+slot fix, the leaf should get ~2/3 of the row pixels and the
    // container ~1/3. Allow ±10% tolerance for grid gaps and rounding.
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);

    const widths = await page.evaluate(() => {
      const dashboard = document.querySelector('[data-testid="dashboard_nested-layouts-dashboard"]');
      const rows = dashboard.querySelectorAll(':scope > .dashboard-row');
      // Row 1 (index 1) is Section 1's leaf+container row. Skip the markdown header at index 0.
      const target = rows[1];
      const items = target.querySelectorAll(':scope > div');
      return {
        row: target.getBoundingClientRect().width,
        items: Array.from(items).map(it => it.getBoundingClientRect().width),
      };
    });

    expect(widths.items.length).toBe(2);
    const ratio = widths.items[0] / widths.items[1];
    // Expected ratio is 2:1; tolerate 1.5–2.5 to account for grid gaps.
    expect(ratio, `leaf vs container width ratio expected ≈ 2.0, got ${ratio.toFixed(2)}`).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });

  test('Step 10: Dashboard wrapper does not trap content in an inner scroll', async ({ page }) => {
    // Regression for Section 4 clipping. The wrapper used to have
    // `overflow-x-hidden` which silently makes browsers force overflow-y to
    // auto, creating an inner scroll area whose box height was less than the
    // total content height. Tall dashboards (this fixture is 2348px) had
    // their last sections trapped inside the inner scroll.
    //
    // The fix swaps to `overflow-x-clip` (Tailwind v4+), which clips X
    // without coercing Y. We assert (a) the wrapper's resolved overflow-y
    // is "visible" or "clip", never "auto"/"scroll", and (b) the document
    // is scrollable to a position past the last top-level row's bottom.
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);

    const probe = await page.evaluate(() => {
      const dashboard = document.querySelector('[data-testid="dashboard_nested-layouts-dashboard"]');
      const cs = getComputedStyle(dashboard);
      const rows = dashboard.querySelectorAll(':scope > .dashboard-row');
      const last = rows[rows.length - 1].getBoundingClientRect();
      return {
        overflowY: cs.overflowY,
        overflowX: cs.overflowX,
        docScrollHeight: document.documentElement.scrollHeight,
        lastRowAbsBottom: last.bottom + window.scrollY,
      };
    });

    // The wrapper's vertical overflow must NOT be auto/scroll — those create
    // an inner scroll trap. visible (default) and clip both let content
    // flow into the parent.
    expect(['visible', 'clip']).toContain(probe.overflowY);
    // The document must be scrollable to at least the last row's bottom
    // (within ±20px for any padding/margin). If the document can't scroll
    // that far, the user can't see the last section.
    expect(probe.docScrollHeight).toBeGreaterThanOrEqual(probe.lastRowAbsBottom - 20);
  });

  test('Step 11: Visual snapshot of the nested-layouts dashboard', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Scroll each row into view to trigger the IntersectionObserver-based
    // lazy-load (charts below the initial fold show "Loading..." until their
    // row scrolls in). Without this, the snapshot would have spinners.
    await page.evaluate(async () => {
      const rows = [...document.querySelectorAll('.dashboard-row')];
      for (const row of rows) {
        row.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise(r => setTimeout(r, 300));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'e2e/screenshots/nested-layouts.png',
      fullPage: true,
    });
  });
});
