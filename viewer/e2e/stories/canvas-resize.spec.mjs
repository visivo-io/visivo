/**
 * Story: Canvas resize handles (VIS-777 / Track D D-4, design D-3).
 *
 * The Workspace dashboard canvas (<ProjectCanvas>) mounts a resize-gesture layer
 * (<CanvasResizeLayer>) over the render-only <Dashboard>. Selecting an item or
 * row reveals edge handles; dragging them mutates the dashboard config and
 * persists it through the shell's shared commitCanvasConfig (optimistic update +
 * debounced save, backend-valid via sanitize):
 *
 *   1. Item RIGHT-EDGE handle (↔ width)  — drag changes the item's integer
 *      col-span; siblings rebalance (relative grid).
 *   2. Row BOTTOM-EDGE handle (↕ height) — drag snaps the row to a HeightEnum
 *      tick stop (tick mode).
 *   3. Shift held during a height drag    — writes a numeric pixel int to
 *      Row.height (fluid mode; Row.height accepts Union[HeightEnum, int]).
 *
 * The chart inside the slot stays STATIC during the drag (the overlay paints a
 * mulberry ghost; the Dashboard re-renders once, at drag-end).
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8044 VISIVO_SANDBOX_FRONTEND_PORT=3044 \
 *   VISIVO_SANDBOX_NAME=vis777 bash scripts/sandbox.sh start
 *   # then: VIS_RESIZE_BASE=http://localhost:3044 npx playwright test canvas-resize
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_RESIZE_BASE || 'http://localhost:3044';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

// A wide viewport keeps the canvas ≥768px so rows lay out side-by-side and the
// item slots get real pixel boxes for the edge handles.
test.use({ viewport: { width: 1600, height: 1400 } });

const readRows = page =>
  page.evaluate(name => {
    const s = window.useStore.getState();
    const d = (s.dashboards || []).find(x => x.name === name);
    const cfg = d ? d.config || d : null;
    return cfg && Array.isArray(cfg.rows) ? cfg.rows : [];
  }, DASHBOARD);

const selectKey = (page, key) =>
  page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), key);

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
};

// Raw pointer drag of a resize handle: down on the handle centre, nudge, travel
// to (centre + dx,dy), release. The handle uses pointer capture, so a reflow
// mid-drag can't drop the gesture.
const dragHandle = async (page, handle, dx, dy, { shift = false } = {}) => {
  await handle.scrollIntoViewIfNeeded();
  const b = await handle.boundingBox();
  expect(b, 'the resize handle has a box').toBeTruthy();
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + Math.sign(dx) * 4, sy + Math.sign(dy) * 4, { steps: 4 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 20 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
};

test.describe('Canvas resize handles (VIS-777 / D-4)', () => {
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

  test('selecting an item reveals its width resize handle', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    const ri = rows.findIndex(r => (r.items || []).length >= 2);
    expect(ri, 'a row with ≥2 items exists').toBeGreaterThanOrEqual(0);

    const itemKey = `row.${ri}.item.0`;
    await selectKey(page, itemKey);
    await expect(page.getByTestId('canvas-resize-layer')).toBeAttached({ timeout: WAIT });
    await expect(page.getByTestId(`canvas-resize-width-${itemKey}`)).toBeVisible({
      timeout: WAIT,
    });
    await page.screenshot({ path: `${SCREENS}/vis777-01-handles.png`, fullPage: true });
  });

  test('dragging an item right-edge handle changes its width and persists', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    const ri = rows.findIndex(r => (r.items || []).length >= 2);
    const itemKey = `row.${ri}.item.0`;
    const beforeWidth = rows[ri].items[0].width || 1;

    await selectKey(page, itemKey);
    const handle = page.getByTestId(`canvas-resize-width-${itemKey}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    // Drag the right edge LEFT by ~1/4 of the row → at least one column smaller
    // (or right if already at the floor). We assert the width simply CHANGED and
    // stayed a valid integer col-span, which is the resize contract.
    const rowBox = await page.locator(`[data-canvas-path="row.${ri}"]`).first().boundingBox();
    const colPx = rowBox.width / (rows[ri].items.reduce((s, it) => s + (it.width || 1), 0) || 1);
    const dir = beforeWidth > 1 ? -1 : 1;
    await dragHandle(page, handle, dir * Math.round(colPx * 2), 0);

    await expect
      .poll(async () => (await readRows(page))[ri].items[0].width, { timeout: WAIT })
      .not.toBe(beforeWidth);
    const after = (await readRows(page))[ri].items[0].width;
    expect(Number.isInteger(after)).toBe(true);
    expect(after).toBeGreaterThanOrEqual(1);
    expect(after).toBeLessThanOrEqual(12);
    await page.screenshot({ path: `${SCREENS}/vis777-02-width-resized.png`, fullPage: true });
  });

  test('dragging a row bottom-edge handle changes its height (tick mode)', async () => {
    await openCanvas(page);
    const rows = await readRows(page);
    const ri = 0;
    const beforeHeight = rows[ri].height;

    await selectKey(page, `row.${ri}`);
    const handle = page.getByTestId(`canvas-resize-height-row.${ri}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    // Drag the bottom edge DOWN ~140px → steps up at least one HeightEnum stop.
    await dragHandle(page, handle, 0, 140);

    await expect
      .poll(async () => (await readRows(page))[ri].height, { timeout: WAIT })
      .not.toBe(beforeHeight);
    const after = (await readRows(page))[ri].height;
    // Tick mode → an enum token (string), not a raw pixel int.
    expect(typeof after).toBe('string');
    await page.screenshot({ path: `${SCREENS}/vis777-03-height-tick.png`, fullPage: true });
  });

  test('Shift-dragging a row height handle writes a numeric pixel value (fluid)', async () => {
    await openCanvas(page);
    const ri = 1;
    await selectKey(page, `row.${ri}`);
    const handle = page.getByTestId(`canvas-resize-height-row.${ri}`);
    await expect(handle).toBeVisible({ timeout: WAIT });

    await dragHandle(page, handle, 0, 90, { shift: true });

    await expect
      .poll(async () => typeof (await readRows(page))[ri].height, { timeout: WAIT })
      .toBe('number');
    const after = (await readRows(page))[ri].height;
    expect(Number.isInteger(after)).toBe(true);
    await page.screenshot({ path: `${SCREENS}/vis777-04-height-fluid.png`, fullPage: true });
  });

  test('no console errors AND no auto-save 400 across the resize gestures', async () => {
    const NOISE = [
      'favicon',
      'DevTools',
      'react-cool',
      'ResizeObserver',
      'Download the React DevTools',
    ];
    const real = page._consoleErrors.filter(e => !NOISE.some(n => e.includes(n)));
    const saveFailures = page._consoleErrors.filter(
      e => e.includes('400') || e.toLowerCase().includes('bad request')
    );
    expect(saveFailures, 'resize must persist backend-valid config (sanitize)').toHaveLength(0);
    expect(real).toHaveLength(0);
  });
});
