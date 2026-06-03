/**
 * Story: Right-rail Edit-tab routing (VIS-802 / Track G G-1).
 *
 * Validates the selection-driven Edit tab + the Outline/Edit tab bar:
 *   1.  The right rail has EXACTLY two tabs — Outline + Edit (NO History).
 *   2.  Switching Outline ↔ Edit fires `right_rail_tab_switched` telemetry.
 *   3.  Selecting different object types in the Library/Outline routes the Edit
 *       tab to the correct form, each fronted by a selection chip:
 *         - dashboard-chrome (Outline "dashboard") → dashboard rows form.
 *         - row (Outline "row.N")                  → RowEditForm.
 *         - item (Outline "row.N.item.M")          → leaf form / ItemEditForm.
 *         - Library data object (e.g. source)      → that type's form.
 *
 * SELECTION SOURCE: Library + Outline only (the canvas round-trip needs D-2 and
 * is deferred). We drive selection through the live zustand store on window.
 *
 * Port: this worktree's sandbox runs on :3013 (backend :8013).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.RIGHT_RAIL_BASE_URL || 'http://localhost:3013';
const WORKSPACE_URL = `${BASE_URL}/workspace`;
const WAIT_FOR_PAGE = 20000;
const SCREENS = 'e2e/stories/__screens__';

const installEventCollector = page =>
  page.addInitScript(() => {
    window.__evts = [];
    window.addEventListener('visivo:workspace-telemetry', e => window.__evts.push(e.detail));
  });
const readEvents = page => page.evaluate(() => window.__evts || []);
const clearEvents = page =>
  page.evaluate(() => {
    window.__evts = [];
  });

// Drive the workspace selection directly through the live store (Library +
// Outline are the two real selection paths; both call into these actions).
const selectObject = (page, type, name) =>
  page.evaluate(
    ({ type, name }) => {
      const s = window.useStore.getState();
      s.openWorkspaceTab({ id: `${type}:${name}`, type, name });
    },
    { type, name }
  );
const setOutlineKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);
const setRightTab = (page, tab) =>
  page.evaluate(t => window.useStore.getState().setWorkspaceRightTab(t), tab);

test.describe('Right-rail routing (G-1)', () => {
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
    await installEventCollector(page);
    // Scope to a real dashboard so the Outline + dashboard-structure forms have
    // content to render.
    await page.goto(`${WORKSPACE_URL}/dashboard/insights-dashboard`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail').waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the tab bar has exactly Outline + Edit (no History)', async () => {
    await expect(page.getByTestId('workspace-right-rail-tab-outline')).toBeVisible();
    await expect(page.getByTestId('workspace-right-rail-tab-edit')).toBeVisible();
    // No History tab/stub per the 2026-05-31 decision.
    await expect(page.getByTestId('workspace-right-rail-tab-history')).toHaveCount(0);
    const tabs = page.locator('[data-testid^="workspace-right-rail-tab-"]');
    await expect(tabs).toHaveCount(2);
  });

  test('switching Outline ↔ Edit fires right_rail_tab_switched', async () => {
    await setRightTab(page, 'edit');
    await clearEvents(page);
    await page.getByTestId('workspace-right-rail-tab-outline').click();
    await expect
      .poll(async () => {
        const evts = await readEvents(page);
        return evts.some(
          e => e.eventName === 'right_rail_tab_switched' && e.payload?.tab === 'outline'
        );
      }, { timeout: 5000 })
      .toBe(true);
    await page.getByTestId('workspace-right-rail-outline').waitFor();
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-01-outline-tab.png`,
    });
  });

  test('dashboard-chrome selection → dashboard rows form with chip', async () => {
    await setRightTab(page, 'edit');
    await selectObject(page, 'dashboard', 'insights-dashboard');
    await setOutlineKey(page, 'dashboard');
    await page.getByTestId('right-rail-edit-dashboard').waitFor({ timeout: 10000 });
    const chip = page.getByTestId('right-rail-selection-chip');
    await expect(chip).toHaveAttribute('data-object-type', 'dashboard');
    await expect(chip).toContainText('insights-dashboard');
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-02-edit-dashboard.png`,
    });
  });

  test('row selection → RowEditForm with chip', async () => {
    await setOutlineKey(page, 'row.0');
    await page.getByTestId('right-rail-edit-row').waitFor({ timeout: 10000 });
    await expect(page.getByTestId('right-rail-selection-chip')).toContainText('Row 1');
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-03-edit-row.png`,
    });
  });

  test('item with a chart leaf → inline ChartEditForm (GAP-1/GAP-2, not empty slot)', async () => {
    // Discover a REAL top-level chart-leaf item from the live store. In compiled
    // project.json the leaf is stored as an OBJECT, not a ref string — GAP-1
    // must still resolve it (the pre-fix code mis-routed it as an empty slot).
    const found = await page.evaluate(() => {
      const dashboards = window.useStore.getState().dashboards || [];
      for (const d of dashboards) {
        const rows = (d.config || d).rows || [];
        for (let ri = 0; ri < rows.length; ri++) {
          const items = (rows[ri] && rows[ri].items) || [];
          for (let ii = 0; ii < items.length; ii++) {
            if (items[ii] && items[ii].chart) return { dashboard: d.name, key: `row.${ri}.item.${ii}` };
          }
        }
      }
      return null;
    });
    expect(found, 'the project should contain a top-level chart-leaf item').toBeTruthy();

    // Scope to that dashboard, select the chart item via the Outline key.
    await page.goto(`${WORKSPACE_URL}/dashboard/${found.dashboard}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail').waitFor({ timeout: WAIT_FOR_PAGE });
    await selectObject(page, 'dashboard', found.dashboard);
    await setRightTab(page, 'edit');
    await setOutlineKey(page, found.key);

    // GAP-2: the inline leaf edit form mounts (not the old "Open Chart" stub).
    await page.getByTestId('right-rail-edit-leaf-form').waitFor({ timeout: 10000 });
    const chip = page.getByTestId('right-rail-selection-chip');
    await expect(chip).toHaveAttribute('data-object-type', 'chart');
    await expect(page.getByTestId('right-rail-edit-leaf-open')).toHaveCount(0);
    // GAP-1: a real chart-leaf item must NOT mis-route to the empty ItemEditForm.
    await expect(page.getByTestId('right-rail-edit-item')).toHaveCount(0);
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-04-edit-item-leaf.png`,
    });
  });

  test('Library data object (source) selection → its edit form', async () => {
    await selectObject(page, 'source', 'local-duckdb');
    // Non-dashboard object → its own edit form; chip identifies the source.
    await page.getByTestId('workspace-right-rail-edit').waitFor({ timeout: 10000 });
    const chip = page.getByTestId('right-rail-selection-chip');
    await expect(chip).toHaveAttribute('data-object-type', 'source');
    await expect(chip).toContainText('local-duckdb');
    await page.getByTestId('workspace-right-rail').screenshot({
      path: `${SCREENS}/vis802-05-edit-source.png`,
    });
  });

  test('no console errors during routing', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
