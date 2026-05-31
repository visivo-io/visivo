/**
 * Story: Canvas selection state + hover overlays (VIS-D2 / VIS-768)
 *
 * The Workspace dashboard canvas (<ProjectCanvas> wrapping the render-only
 * <DashboardNew>) now carries an editing-affordance OVERLAY layer:
 *
 *   - Clicking an item / row / empty canvas writes the workspace selection to
 *     `workspaceOutlineSelectedKey` — the SAME store field the OutlineTreePanel
 *     uses, so the canvas + tree are one selection source of truth.
 *   - Selected item/row gets a persistent mulberry ring; dashboard-chrome
 *     selection (click empty canvas) gets a subtle inset outer border.
 *   - Hovering an item/row paints a subtle outline + a resize-handle
 *     PLACEHOLDER (no resize gesture — that's D-3).
 *
 * The right rail is NOT exercised here (that's G-1); D-2 only sets selection
 * state + renders overlays.
 *
 * Precondition: sandbox running on :3012/:8012 (VIS-768 isolated ports)
 *   VISIVO_SANDBOX_BACKEND_PORT=8012 VISIVO_SANDBOX_FRONTEND_PORT=3012 \
 *   VISIVO_SANDBOX_NAME=vis768 bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3012';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const WAIT = 20000;

const readSelectedKey = page =>
  page.evaluate(() => window.useStore.getState().workspaceOutlineSelectedKey);

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  // The wrapped DashboardNew rendered the real dashboard (rows present).
  const dash = page.getByTestId(`dashboard_${DASHBOARD}`);
  await expect(dash).toBeVisible({ timeout: WAIT });
  await expect(dash.locator('[data-row-index]').first()).toBeVisible({ timeout: WAIT });
  // The overlay layer mounted on top of the render.
  await expect(page.getByTestId('canvas-overlay-layer')).toBeAttached({ timeout: WAIT });
};

test.describe('Canvas selection + hover overlays (VIS-768)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  test('clicking an item selects it (mulberry ring) + writes the shared key', async ({
    page,
  }) => {
    await openCanvas(page);

    // Click the first item slot inside the first row.
    const firstItem = page
      .locator('[data-row-index="0"] [data-canvas-item-index="0"]')
      .first();
    await expect(firstItem).toBeVisible({ timeout: WAIT });
    await firstItem.click({ position: { x: 6, y: 6 } });

    // The workspace selection key updates to the item's key (shared with the
    // Outline tree — VIS-793's scheme).
    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toBe('row.0.item.0');

    // The persistent mulberry selection ring renders over the item.
    const ring = page.getByTestId('canvas-overlay-selected-item');
    await expect(ring).toBeVisible({ timeout: WAIT });
    await expect(ring).toHaveClass(/ring-\[#713b57\]/);

    await page.screenshot({ path: `${SCREENS}/vis768-01-item-selected.png` });
  });

  test('clicking a row selects the row', async ({ page }) => {
    await openCanvas(page);

    // Click the second row's chrome (away from an item, near the left edge).
    const secondRow = page.locator('[data-row-index="1"]').first();
    await expect(secondRow).toBeVisible({ timeout: WAIT });
    const box = await secondRow.boundingBox();
    // Click near the top-left of the row block, just inside it but off the item
    // grid where possible; the overlay resolves the nearest row either way.
    await page.mouse.click(box.x + 3, box.y + 3);

    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toMatch(/^row\.1(\.|$)/);

    await page.screenshot({ path: `${SCREENS}/vis768-02-row-selected.png` });
  });

  test('clicking empty canvas selects the dashboard chrome (inset border)', async ({
    page,
  }) => {
    await openCanvas(page);

    // First select an item so we can observe the change back to chrome.
    await page
      .locator('[data-row-index="0"] [data-canvas-item-index="0"]')
      .first()
      .click({ position: { x: 6, y: 6 } });
    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toBe('row.0.item.0');

    // Click empty canvas chrome: the left padding gutter beside the first row
    // (between the canvas edge and the row's left edge) — guaranteed in-viewport
    // and resolves to the dashboard chrome (no row/item ancestor). Avoids the
    // bottom-padding area, which can fall below shorter test viewports.
    const canvas = page.getByTestId('project-canvas');
    const cBox = await canvas.boundingBox();
    const rBox = await page.locator('[data-row-index="0"]').first().boundingBox();
    await page.mouse.click(cBox.x + 4, rBox.y + 20);

    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toBe('dashboard');
    await expect(page.getByTestId('canvas-overlay-chrome-selected')).toBeVisible({
      timeout: WAIT,
    });

    await page.screenshot({ path: `${SCREENS}/vis768-03-chrome-selected.png` });
  });

  test('hovering an item shows the outline overlay + resize-handle placeholder', async ({
    page,
  }) => {
    await openCanvas(page);

    // Select a row first so the hovered item is not the active selection
    // (which suppresses the hover hint).
    const secondRow = page.locator('[data-row-index="1"]').first();
    const rowBox = await secondRow.boundingBox();
    await page.mouse.click(rowBox.x + 3, rowBox.y + 3);
    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toMatch(/^row\.1(\.|$)/);

    const firstItem = page
      .locator('[data-row-index="0"] [data-canvas-item-index="0"]')
      .first();
    await firstItem.hover({ position: { x: 20, y: 20 } });

    await expect(page.getByTestId('canvas-overlay-hover-item')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('canvas-overlay-resize-handle')).toBeVisible({
      timeout: WAIT,
    });

    await page.screenshot({ path: `${SCREENS}/vis768-04-hover-overlay.png` });
  });
});
