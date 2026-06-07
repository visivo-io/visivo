/**
 * Story: Canvas wrap-in-container (VIS-781 / Track D D-5).
 *
 * Right-clicking a leaf item on the Workspace dashboard canvas opens a context
 * menu (<CanvasContextMenu>) with the D-5 structural actions:
 *   - Wrap in container   (leaf → `Item.rows` container holding the original)
 *   - Add row inside       (container → +empty sub-row)
 *   - Add item to row       (row → +empty slot)
 *   - Unwrap container      (trivial 1×1 container → back to the leaf)
 *
 * Each commits through the shell's shared commitCanvasConfig (sanitize →
 * optimistic → save) and fires `canvas_action`. No depth limit (Q12).
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8050 VISIVO_SANDBOX_FRONTEND_PORT=3050 \
 *   VISIVO_SANDBOX_NAME=dtrack bash scripts/sandbox.sh start
 *   # then: VIS_WRAP_BASE=http://localhost:3050 npx playwright test canvas-wrap-container
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_WRAP_BASE || 'http://localhost:3050';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1400 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

// Read the item object at `row.A.item.B` (top-level only — enough for this story).
const readItem = async (page, ri, ii) => {
  const rows = await readRows(page);
  return rows[ri]?.items?.[ii] ?? null;
};

// A deterministic two-row layout — row 0 has TWO leaf items, row 1 has one — so
// every test starts from the same shape regardless of what a prior run's real
// saves left on disk (the canvas persists structural edits). Seeded through the
// store's optimistic + save path (the same path the menu commits through).
const SEED_CONFIG = {
  rows: [
    {
      height: 'medium',
      items: [
        { width: 9, chart: 'ref(a-very-fibonacci-waterfall)' },
        { width: 2, chart: 'ref(aggregated-fib)' },
      ],
    },
    { height: 'medium', items: [{ width: 3, chart: 'ref(fibonacci-plane)' }] },
  ],
};

const seedConfig = async page => {
  await page.evaluate(
    ([name, cfg]) => {
      const s = window.useStore.getState();
      s.updateDashboardConfigOptimistic(name, cfg);
      s.saveDashboard(name, cfg);
    },
    [DASHBOARD, SEED_CONFIG]
  );
  // Let the optimistic swap reflow the canvas to the seeded shape.
  await page.waitForTimeout(400);
};

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await page.waitForTimeout(400);
  // Reset to the canonical two-leaf layout so each test is deterministic.
  await seedConfig(page);
  await expect(page.locator('[data-canvas-path="row.0.item.1"]').first()).toBeVisible({
    timeout: WAIT,
  });
  await page.waitForTimeout(300);
};

// Right-click the item slot at `itemPath`. `force` so the Plotly chart overlay
// (which sits above the selection overlay) doesn't intercept the contextmenu.
// Settles the canvas first so a prior commit's reflow can't detach the freshly
// opened menu mid-click.
const rightClickItem = async (page, itemPath) => {
  await page.waitForTimeout(250); // let any prior optimistic commit reflow settle
  const slot = page.locator(`[data-canvas-path="${itemPath}"]`).first();
  await expect(slot).toBeVisible({ timeout: WAIT });
  await slot.click({ button: 'right', position: { x: 8, y: 8 }, force: true });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible({ timeout: WAIT });
  await page.waitForTimeout(120); // let the menu paint fully before interacting
};

// Click a menu item, tolerating a single reflow-driven detach (the menu can
// re-render once as the optimistic config swap settles before the click lands).
const clickMenuItem = async (page, testid) => {
  const item = page.getByTestId(testid);
  await expect(item).toBeVisible({ timeout: WAIT });
  await item.click({ force: true });
};

test.describe('Canvas wrap-in-container (VIS-781 / D-5)', () => {
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

  test('right-click a leaf item → context menu offers Wrap in container', async () => {
    await openCanvas(page);
    await rightClickItem(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-ctx-wrap')).toBeVisible();
    await expect(page.getByTestId('canvas-ctx-add-item')).toBeVisible();
    // A leaf has no Unwrap / Add-row-inside.
    await expect(page.getByTestId('canvas-ctx-unwrap')).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}/vis781-01-context-menu.png`, fullPage: true });
    await page.keyboard.press('Escape');
  });

  test('Wrap converts the leaf into a row-container holding the original', async () => {
    await openCanvas(page);
    const before = await readItem(page, 0, 0);
    expect(before, 'a leaf item exists at row.0.item.0').toBeTruthy();
    expect(Array.isArray(before.rows)).toBeFalsy();
    const beforeWidth = before.width || 1;

    await rightClickItem(page, 'row.0.item.0');
    await clickMenuItem(page, 'canvas-ctx-wrap');

    // The item becomes a container holding the original leaf as its single inner.
    await expect
      .poll(async () => Array.isArray((await readItem(page, 0, 0))?.rows), { timeout: WAIT })
      .toBe(true);
    const after = await readItem(page, 0, 0);
    expect(after.width).toBe(beforeWidth); // container inherits the slot width
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].items).toHaveLength(1);
    await page.screenshot({ path: `${SCREENS}/vis781-02-wrapped.png`, fullPage: true });
  });

  test('a wrapped (container) item offers Add row inside + Unwrap', async () => {
    await openCanvas(page);
    // Wrap the fresh leaf at row.0.item.0 → it becomes a trivial container.
    await rightClickItem(page, 'row.0.item.0');
    await clickMenuItem(page, 'canvas-ctx-wrap');
    await expect
      .poll(async () => Array.isArray((await readItem(page, 0, 0))?.rows), { timeout: WAIT })
      .toBe(true);

    // Right-clicking the container (its inner leaf fills the slot) still offers
    // the container actions via the nearest-container-ancestor resolution.
    await rightClickItem(page, 'row.0.item.0');
    await expect(page.getByTestId('canvas-ctx-add-row-inside')).toBeVisible();
    await expect(page.getByTestId('canvas-ctx-unwrap')).toBeVisible();

    // Add a row inside → the container now has 2 sub-rows.
    await clickMenuItem(page, 'canvas-ctx-add-row-inside');
    await expect
      .poll(async () => (await readItem(page, 0, 0))?.rows?.length, { timeout: WAIT })
      .toBe(2);
    await page.screenshot({ path: `${SCREENS}/vis781-03-add-row-inside.png`, fullPage: true });
  });

  test('Unwrap a trivial container restores the leaf (round-trip)', async () => {
    await openCanvas(page);
    // Wrap the fresh leaf at row.0.item.1 → trivial 1×1 container.
    await rightClickItem(page, 'row.0.item.1');
    await clickMenuItem(page, 'canvas-ctx-wrap');
    await expect
      .poll(async () => Array.isArray((await readItem(page, 0, 1))?.rows), { timeout: WAIT })
      .toBe(true);

    // Now unwrap it back to a leaf.
    await rightClickItem(page, 'row.0.item.1');
    await expect(page.getByTestId('canvas-ctx-unwrap')).toBeVisible();
    await clickMenuItem(page, 'canvas-ctx-unwrap');

    // The container collapses back to a leaf (no `rows`); the chart ref survives.
    await expect
      .poll(async () => Array.isArray((await readItem(page, 0, 1))?.rows), { timeout: WAIT })
      .toBe(false);
    const leaf = await readItem(page, 0, 1);
    expect(typeof leaf.chart === 'string' || (leaf.chart && leaf.chart.name)).toBeTruthy();
    await page.screenshot({ path: `${SCREENS}/vis781-04-unwrapped.png`, fullPage: true });
  });

  test('no console errors AND no auto-save 400 across the wrap gestures', async () => {
    const NOISE = ['favicon', 'DevTools', 'react-cool', 'ResizeObserver', 'compile'];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    const saveFailures = page._consoleErrors.filter(
      e => e.includes('400') || e.toLowerCase().includes('bad request')
    );
    expect(saveFailures, 'wrap must persist backend-valid config (sanitize)').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
