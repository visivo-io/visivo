/**
 * Story: Dashboard Lineage — Nested Item.rows fan-out (VIS-826)
 *
 * Regression guard for VIS-826: the dashboard lineage DAG dropped every chart/
 * table nested inside a container item's `item.rows`, so a nested-layout
 * dashboard showed a single chain instead of the full member fan-out.
 *
 * This story scopes the `nested-layouts-dashboard`, switches the middle pane to
 * the Lineage lens, and asserts the DAG now renders MULTIPLE chart/table member
 * nodes (the dashboard's real nested members) — not just the top-level one.
 *
 * Precondition: the vis826 sandbox is running on :3010 / :8010 (NEVER the
 * shared :3001). Run with:
 *   cd viewer && npx playwright test e2e/stories/dashboard-lineage-nested.spec.mjs --reporter=list
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS826_BASE || 'http://localhost:3010';
const WAIT_FOR_PAGE = 20000;
const SHOTS = 'e2e/stories/__screens__';
const DASHBOARD = 'nested-layouts-dashboard';

const screenshot = (page, name) =>
  page.screenshot({ path: `${SHOTS}/vis826-${name}.png`, fullPage: false });

test.describe('Dashboard Lineage — Nested Item.rows fan-out (VIS-826)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}/workspace/dashboard/${encodeURIComponent(DASHBOARD)}`);
    await page.waitForLoadState('networkidle');
    await page
      .getByTestId('workspace-subbar-dashboard')
      .waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: switch the middle pane to the Lineage lens', async () => {
    await page.getByRole('tab', { name: /lineage/i }).first().click();
    await expect(page.getByTestId('workspace-middle-dashboard-lineage')).toBeVisible({
      timeout: WAIT_FOR_PAGE,
    });
    await expect(page.getByTestId('lineage-canvas')).toBeVisible();
    await expect(page.getByTestId('lineage-canvas-scope-pill')).toContainText(DASHBOARD);
    // DAG renders nodes.
    await page.locator('.react-flow__node').first().waitFor({ timeout: WAIT_FOR_PAGE });
    await screenshot(page, '01-lineage-lens-mounted');
  });

  test('Step 2: the DAG shows MULTIPLE nested chart/table members feeding the dashboard', async () => {
    // Count chart + table nodes in the scoped DAG. With the VIS-826 bug, only the
    // single top-level chart (`simple-scatter-chart`) survived; the nested charts
    // (indicator_chart, composite-metric-chart, toggle-mode-chart) were dropped.
    // After the fix the scoped dashboard DAG includes every nested member.
    const memberNodeIds = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
      return nodes
        .map(n => n.getAttribute('data-id') || '')
        .filter(id => id.startsWith('chart-') || id.startsWith('table-'));
    });

    const uniqueMembers = [...new Set(memberNodeIds)];
    // Fan-out: more than one member chart/table feeds the dashboard.
    expect(uniqueMembers.length).toBeGreaterThan(1);

    // The previously-dropped nested charts must now be present (indicator_chart,
    // composite-metric-chart and toggle-mode-chart only ever appear nested in
    // container item.rows; simple-scatter-chart is the lone top-level member).
    expect(uniqueMembers).toEqual(
      expect.arrayContaining([
        'chart-simple-scatter-chart',
        'chart-indicator_chart',
        'chart-composite-metric-chart',
        'chart-toggle-mode-chart',
      ])
    );

    // Frame the whole fan-out for the screenshot: fit the React Flow view so the
    // dashboard node and ALL its incoming member edges are visible at once.
    await page.locator('.react-flow__controls-fitview').click();
    await page.waitForTimeout(600);
    await screenshot(page, '02-nested-member-fanout');
  });

  test('Step 3: no console errors during the flow', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
