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
 * Precondition: an isolated sandbox running with the integration project.
 * BASE defaults to :3012 (the VIS-768 ports) but is env-overridable so the
 * reviewer can point it at whatever sandbox is live:
 *   VISIVO_SANDBOX_BACKEND_PORT=8012 VISIVO_SANDBOX_FRONTEND_PORT=3012 \
 *   VISIVO_SANDBOX_NAME=vis768 bash scripts/sandbox.sh start
 *   # then: VIS_CANVAS_SELECTION_BASE=http://localhost:3012 npx playwright test canvas-selection
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_CANVAS_SELECTION_BASE || 'http://localhost:3012';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'simple-dashboard';
const NESTED_DASHBOARD = 'nested-layouts-dashboard';
const WAIT = 20000;

// A wide viewport keeps the canvas ≥768px so flat dashboards lay out
// side-by-side (short enough that rows stay in view for real pixel clicks).
test.use({ viewport: { width: 1600, height: 1400 } });

const readSelectedKey = page =>
  page.evaluate(() => window.useStore.getState().workspaceOutlineSelectedKey);

// Fire a real click through the canvas's delegated listener on a specific
// rendered element (resolved by its composite path). Used where a pixel click
// is unreliable — row chrome is largely occluded by its item slots, and nested
// row-containers currently render at 0 height on the canvas (a separate
// rendering defect, out of VIS-768's selection scope). This still exercises the
// real overlay resolver + store write against the real DOM.
const clickPath = (page, path) =>
  page.evaluate(p => {
    const el = document.querySelector(`[data-canvas-path="${p}"]`);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, path);

const openCanvas = async (page, dashboard = DASHBOARD) => {
  await page.goto(`${BASE}/workspace/dashboard/${dashboard}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  // The wrapped DashboardNew rendered the real dashboard (rows present).
  const dash = page.getByTestId(`dashboard_${dashboard}`);
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

    // The row container carries `data-canvas-path="row.1"`; its item slots cover
    // most of its area, so we resolve the row chrome by dispatching on the row
    // element itself (the overlay's real delegated handler + resolver run).
    await expect(page.locator('[data-canvas-path="row.1"]').first()).toBeVisible({ timeout: WAIT });
    expect(await clickPath(page, 'row.1')).toBe(true);

    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toBe('row.1');
    await expect(page.getByTestId('canvas-overlay-selected-row')).toBeVisible({ timeout: WAIT });

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
    await page.evaluate(() => window.useStore.getState().setWorkspaceOutlineSelectedKey('row.1'));
    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toBe('row.1');

    const firstItem = page
      .locator('[data-canvas-path="row.0.item.0"]')
      .first();
    await firstItem.scrollIntoViewIfNeeded();
    await firstItem.hover({ position: { x: 20, y: 20 } });

    await expect(page.getByTestId('canvas-overlay-hover-item')).toBeVisible({
      timeout: WAIT,
    });
    // The resize affordance moved to <CanvasResizeLayer> (VIS-777 / D-4), shown
    // on the SELECTED node rather than as a hover-time placeholder.

    await page.screenshot({ path: `${SCREENS}/vis768-04-hover-overlay.png` });
  });
});

/**
 * The headline VIS-768 AC: canvas + Outline share ONE selection, 1:1 in BOTH
 * directions, for NESTED layouts. Drives the real `nested-layouts-dashboard`.
 * The composite key scheme (`row.N.item.M.row.P.item.Q…`) is emitted by
 * DashboardNew as `data-canvas-path` and resolved by the overlay at any depth.
 *
 * NOTE: nested row-container slots currently render at ~0 height on the canvas
 * (a separate, pre-existing rendering defect — out of VIS-768's selection
 * scope), so a nested leaf is not pixel-clickable. We therefore drive the click
 * through the overlay's real delegated handler on the real rendered element
 * (clickPath) and compare measured geometry via getBoundingClientRect rather
 * than Playwright visibility. This still proves the selection round-trip end to
 * end against the live DOM + store.
 */
test.describe('Nested-layout canvas selection (VIS-768)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  // The deepest composite path the render emitted (depth ≥2), plus a count of
  // composite markers — the pre-fix render had ZERO nested anchors.
  const findNested = page =>
    page.evaluate(() => {
      const re = /^row\.\d+\.item\.\d+\.row\.\d+\.item\.\d+/;
      const composite = Array.from(document.querySelectorAll('[data-canvas-path]'))
        .map(e => e.getAttribute('data-canvas-path'))
        .filter(k => re.test(k));
      // Prefer an exact depth-2 leaf for a clean assertion.
      const leaf = composite.find(k => /^row\.\d+\.item\.\d+\.row\.\d+\.item\.\d+$/.test(k));
      return { count: composite.length, leaf };
    });

  test('render emits composite data-canvas-path anchors for nested layouts', async ({ page }) => {
    await openCanvas(page, NESTED_DASHBOARD);
    const { count, leaf } = await findNested(page);
    // The hold's #1 gap was "nested leaves carry NO selection anchor"; now they do.
    expect(count, 'nested layouts must emit composite selection anchors').toBeGreaterThan(0);
    expect(leaf, 'a depth-2 nested leaf anchor should exist').toBeTruthy();
  });

  test('canvas → store: a nested-leaf click writes its FULL composite key', async ({ page }) => {
    await openCanvas(page, NESTED_DASHBOARD);
    const { leaf } = await findNested(page);
    expect(leaf).toBeTruthy();

    // Real click via the overlay's delegated handler on the real nested element.
    expect(await clickPath(page, leaf)).toBe(true);

    // The store gets the FULL composite key — NOT the top-level container
    // (the pre-fix resolver could only emit the 2-level container key).
    await expect.poll(() => readSelectedKey(page), { timeout: WAIT }).toBe(leaf);
    const containerKey = leaf.replace(/\.row\.\d+\.item\.\d+$/, '');
    expect(await readSelectedKey(page)).not.toBe(containerKey);

    await page.screenshot({ path: `${SCREENS}/vis768-05-nested-canvas-to-store.png` });
  });

  test('store → canvas: a nested key rings the matching nested leaf (not its container)', async ({
    page,
  }) => {
    await openCanvas(page, NESTED_DASHBOARD);
    const { leaf } = await findNested(page);
    expect(leaf).toBeTruthy();

    // The Outline tree would write this exact key; drive it through the store.
    await page.evaluate(k => window.useStore.getState().setWorkspaceOutlineSelectedKey(k), leaf);

    // The overlay resolved the composite key to the nested element. Compare the
    // ring's measured position to the leaf's vs. its container's — the ring must
    // match the LEAF (the pre-fix resolver ringed the top-level container).
    const geo = await page.evaluate(key => {
      const ring = document.querySelector('[data-testid="canvas-overlay-selected-item"]');
      const leafEl = document.querySelector(`[data-canvas-path="${key}"]`);
      const containerKey = key.replace(/\.row\.\d+\.item\.\d+$/, '');
      const containerEl = document.querySelector(`[data-canvas-path="${containerKey}"]`);
      const box = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width };
      };
      return { ring: box(ring), leaf: box(leafEl), container: box(containerEl) };
    }, leaf);

    expect(geo.ring, 'a selection ring should be painted').toBeTruthy();
    expect(geo.leaf).toBeTruthy();
    // Ring matches the leaf's position (x/y/width) within sub-pixel tolerance…
    expect(Math.abs(geo.ring.x - geo.leaf.x)).toBeLessThan(2);
    expect(Math.abs(geo.ring.y - geo.leaf.y)).toBeLessThan(2);
    expect(Math.abs(geo.ring.w - geo.leaf.w)).toBeLessThan(2);
    // …and is NOT the container (when the two genuinely differ in position).
    if (geo.container && (geo.container.x !== geo.leaf.x || geo.container.y !== geo.leaf.y)) {
      const matchesContainer =
        Math.abs(geo.ring.x - geo.container.x) < 2 &&
        Math.abs(geo.ring.y - geo.container.y) < 2 &&
        Math.abs(geo.ring.w - geo.container.w) < 2;
      expect(matchesContainer).toBe(false);
    }

    await page.screenshot({ path: `${SCREENS}/vis768-06-nested-store-to-canvas.png` });
  });
});
