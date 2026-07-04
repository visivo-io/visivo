/**
 * Story: Canvas-direct keyboard navigation + a11y (VIS-790 / Track D D-7).
 *
 * The Workspace dashboard canvas mounts a keyboard focus surface
 * (<CanvasKeyboardLayer>): a `role="application"` region a keyboard user can Tab
 * into and then drive the SAME selection the pointer / Outline / breadcrumb
 * drive, with an `aria-live` region announcing each move:
 *
 *   - ←/→         step among siblings (items in a row, rows among rows).
 *   - ↑           up the hierarchy (item → parent row → dashboard).
 *   - ↓           down into the first child.
 *   - Tab / ⇧Tab  cycle the current row's items.
 *   - ⌘↑ / ⌘↓     reorder the selected node (persisted via commitCanvasConfig).
 *   - Enter        focus the right-rail Edit form's first field.
 *   - Esc          deselect to the dashboard root.
 *
 * Works across the FULL incl-nested tree (it reuses the breadcrumbNav model that
 * VIS-903 + G-2 share). Driven against `nested-layouts-dashboard` so the nested
 * descent / sibling stepping is exercised end-to-end.
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=dtrack bash scripts/sandbox.sh start
 *   # then: VIS_KBD_BASE=http://localhost:3050 npx playwright test canvas-keyboard-nav
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_KBD_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'nested-layouts-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1600 } });

const selectedKey = page =>
  page.evaluate(() => window.useStore.getState().workspaceOutlineSelectedKey);

const setKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-keyboard-region')).toBeAttached({ timeout: WAIT });
  await page.waitForTimeout(600);
};

const focusRegion = async page => {
  await page.getByTestId('canvas-keyboard-region').evaluate(el => el.focus());
};

test.describe('Canvas keyboard navigation (VIS-790 / D-7)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the canvas exposes a focusable application region with ARIA contract', async () => {
    await openCanvas(page);
    const region = page.getByTestId('canvas-keyboard-region');
    await expect(region).toHaveAttribute('role', 'application');
    await expect(region).toHaveAttribute('tabindex', '0');
    await expect(region).toHaveAttribute('aria-keyshortcuts', /Arrow/);
    const announce = page.getByTestId('canvas-keyboard-announce');
    await expect(announce).toHaveAttribute('aria-live', 'polite');
    await page.screenshot({ path: `${SCREENS}/vis790-01-a11y-region.png`, fullPage: true });
  });

  test('arrow keys move the selection DOWN into and ACROSS the tree', async () => {
    await openCanvas(page);
    await setKey(page, 'dashboard');
    await focusRegion(page);

    // ↓ descends: dashboard → row.0 → row.0.item.0 …
    await page.keyboard.press('ArrowDown');
    expect(await selectedKey(page)).toBe('row.0');
    await page.keyboard.press('ArrowDown');
    expect(await selectedKey(page)).toBe('row.0.item.0');

    // ↓ goes back UP a row, ↑ to parent; ←/→ cycles siblings at depth.
    // Move to a row that has multiple items to exercise ←/→.
    await setKey(page, 'row.1.item.0');
    await focusRegion(page);
    await page.keyboard.press('ArrowRight');
    expect(await selectedKey(page)).toBe('row.1.item.1');
    await page.keyboard.press('ArrowUp'); // up to the parent row
    expect(await selectedKey(page)).toBe('row.1');

    await page.screenshot({ path: `${SCREENS}/vis790-02-arrow-nav.png`, fullPage: true });
  });

  test('arrow keys navigate INTO a nested container (incl-nested tree)', async () => {
    await openCanvas(page);
    // row.1.item.1 is a container in the nested-layouts fixture (sidebar stack).
    await setKey(page, 'row.1.item.1');
    await focusRegion(page);
    // ↓ descends into the container's first sub-row, then its first item.
    await page.keyboard.press('ArrowDown');
    expect(await selectedKey(page)).toBe('row.1.item.1.row.0');
    await page.keyboard.press('ArrowDown');
    expect(await selectedKey(page)).toBe('row.1.item.1.row.0.item.0');
    // ↑ climbs back out to the sub-row, then to the container.
    await page.keyboard.press('ArrowUp');
    expect(await selectedKey(page)).toBe('row.1.item.1.row.0');
    await page.screenshot({ path: `${SCREENS}/vis790-03-nested-nav.png`, fullPage: true });
  });

  test('⌘↑/⌘↓ reorders the selected row and the selection follows it', async () => {
    await openCanvas(page);
    const heightsBefore = await page.evaluate(name => {
      const s = window.useStore.getState();
      const d = (s.dashboards || []).find(x => x.name === name);
      const cfg = d ? d.config || d : null;
      return (cfg?.rows || []).map(r => r.height);
    }, DASHBOARD);
    expect(heightsBefore.length).toBeGreaterThanOrEqual(2);

    // Select row 0 and move it down one.
    await setKey(page, 'row.0');
    await focusRegion(page);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+ArrowDown');

    await expect
      .poll(
        async () =>
          page.evaluate(name => {
            const s = window.useStore.getState();
            const d = (s.dashboards || []).find(x => x.name === name);
            const cfg = d ? d.config || d : null;
            return (cfg?.rows || []).map(r => r.height).join(',');
          }, DASHBOARD),
        { timeout: WAIT }
      )
      .not.toBe(heightsBefore.join(','));
    // The selection follows the moved row to index 1.
    expect(await selectedKey(page)).toBe('row.1');
    await page.screenshot({ path: `${SCREENS}/vis790-04-keyboard-reorder.png`, fullPage: true });
  });

  test('Escape deselects to the dashboard root', async () => {
    await openCanvas(page);
    await setKey(page, 'row.1.item.0');
    await focusRegion(page);
    await page.keyboard.press('Escape');
    expect(await selectedKey(page)).toBe('dashboard');
  });

  test('focusing the region announces the current position to screen readers', async () => {
    await openCanvas(page);
    await setKey(page, 'row.1.item.0');
    await focusRegion(page);
    await expect(page.getByTestId('canvas-keyboard-announce')).toHaveText(/Row 2, item 1 selected/, {
      timeout: WAIT,
    });
  });

  test('no console errors across the keyboard gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'react-cool', 'ResizeObserver', 'compile'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    expect(real).toHaveLength(0);
  });
});
