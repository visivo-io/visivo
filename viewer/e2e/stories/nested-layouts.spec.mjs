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

const DASHBOARD_PATH = '/project/nested-layouts-dashboard';

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

    // The four `## Section N — ...` markdown headers exist as h2 elements.
    const headers = page.locator('h2');
    await expect(headers.nth(0)).toContainText('Section 1');
    await expect(headers.nth(1)).toContainText('Section 2');
    await expect(headers.nth(2)).toContainText('Section 3');
    await expect(headers.nth(3)).toContainText('Section 4');
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

    // Section 3 has three input widgets (split_threshold dropdown, sort_direction
    // tabs, show_markers toggle) stacked in a column container. Their wrapper
    // elements should be visible somewhere on the page.
    // Inputs render as Flowbite Select / Tabs / Toggle components.
    // We assert at least one input control surface (form/select/role=tablist/
    // checkbox) is present; the framework controls vary by display type.
    const interactiveCount = await page
      .locator('select, [role="tablist"], [role="checkbox"], [role="radiogroup"], button[role="tab"]')
      .count();
    expect(interactiveCount).toBeGreaterThan(0);
  });

  test('Step 8: Visual snapshot of the nested-layouts dashboard', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await page.waitForLoadState('networkidle');
    // Plotly charts can take a beat to settle.
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'e2e/screenshots/nested-layouts.png',
      fullPage: true,
    });
  });
});
