/**
 * Story: Canvas ROW drag shows a "Row" preview, not a chart pill (VIS-901 #5).
 *
 * Regression guard for the acceptance bug: a canvas ROW drag used to render the
 * chart drag pill in the shared <DragOverlay> because handleDragStart defaulted
 * every canvas drag's `type` to 'chart' (a row has no `refType`). The fix routes
 * the drag-start mapping through `mapDragStartData`, which gives a row its own
 * `canvasKind: 'row'` shape rendered by <CanvasRowDragPreview> — a mulberry "Row"
 * pill (data-testid="canvas-row-drag-preview"), NOT the chart pill
 * (data-testid="library-drag-preview").
 *
 * This spec starts a real row drag (grip → between-rows gap, pointer held down)
 * and asserts the ROW preview is visible while the chart pill is NOT, then
 * releases without asserting a reorder (covered by canvas-dnd.spec.mjs).
 *
 * Precondition: an isolated sandbox running the integration project.
 *   VISIVO_SANDBOX_BACKEND_PORT=8048 VISIVO_SANDBOX_FRONTEND_PORT=3048 \
 *   VISIVO_SANDBOX_NAME=vis901 bash scripts/sandbox.sh start
 *   # then: VIS_CANVAS_DND_BASE=http://localhost:3048 npx playwright test canvas-row-drag-preview
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_CANVAS_DND_BASE || 'http://localhost:3008';
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

// Grips are gated on selection — selecting an item in the row reveals the row grip.
const revealRowHandle = async (page, rowIndex) => {
  await page
    .locator(`[data-canvas-path="row.${rowIndex}.item.0"]`)
    .first()
    .click({ position: { x: 6, y: 6 }, force: true });
  const handle = page.getByTestId(`canvas-drag-handle-row.${rowIndex}`);
  await expect(handle).toBeVisible({ timeout: WAIT });
  return handle;
};

// Arm dnd-kit's PointerSensor by dispatching pointerdown on the grip node itself
// (the overlay grip is occluded for coordinate hit-testing — see canvas-dnd.spec
// for the full rationale), then travel to the target centre. Leaves pointer DOWN.
const startRowDrag = async (page, source, target) => {
  await expect(source).toBeVisible();
  await page.waitForTimeout(150);
  const tb = await target.boundingBox();
  expect(tb, 'target has a box').toBeTruthy();
  const tx = tb.x + tb.width / 2;
  const ty = tb.y + tb.height / 2;
  await source.evaluate(el => {
    const r = el.getBoundingClientRect();
    window.__rowDndSrc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const ev = (x, y) => ({
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      pointerType: 'mouse',
      isPrimary: true,
      view: window,
    });
    el.dispatchEvent(new PointerEvent('pointerdown', ev(window.__rowDndSrc.x, window.__rowDndSrc.y)));
  });
  await page.waitForTimeout(40);
  await page.evaluate(
    ([tx, ty]) => {
      const s = window.__rowDndSrc;
      const ev = (x, y) => ({
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      });
      document.dispatchEvent(new PointerEvent('pointermove', ev(s.x + 10, s.y + 10)));
      document.dispatchEvent(new PointerEvent('pointermove', ev((s.x + tx) / 2, (s.y + ty) / 2)));
      document.dispatchEvent(new PointerEvent('pointermove', ev(tx, ty)));
      document.dispatchEvent(new PointerEvent('pointermove', ev(tx, ty)));
    },
    [tx, ty]
  );
  await page.waitForTimeout(40);
};

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('canvas-dnd-layer')).toBeAttached({ timeout: WAIT });
};

test.describe('Canvas row drag preview (VIS-901 #5)', () => {
  test.setTimeout(120000);

  test('dragging a ROW shows the "Row" preview pill, NOT the chart pill', async ({ page }) => {
    await openCanvas(page);
    const rows = await readRows(page);
    expect(rows.length, 'dashboard has ≥2 rows').toBeGreaterThanOrEqual(2);

    const rowHandle = await revealRowHandle(page, 0);
    const gapZone = page.getByTestId(`canvas-dropzone-row-before-${rows.length}`);
    await startRowDrag(page, rowHandle, gapZone);

    // Mid-drag: the ROW preview is visible and the chart pill is NOT (the bug
    // was the chart pill showing for a row drag).
    await expect(page.getByTestId('canvas-row-drag-preview')).toBeVisible({ timeout: 4000 });
    await expect(page.getByTestId('canvas-row-drag-preview')).toContainText('Row');
    await expect(page.getByTestId('library-drag-preview')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis901-05-row-drag-preview.png`, fullPage: false });
    await page.mouse.up();
  });
});
