/**
 * Story: Dashboard Stacking Breakpoint (VIS-829)
 *
 * Validates the lowered, container-relative stacking breakpoint and the
 * slot-relative nested-container layout in DashboardNew.jsx.
 *
 * The bug: `widthBreakpoint` was 1024 and gated `isColumn`. `width` comes from a
 * ResizeObserver on the dashboard container (NOT the viewport), and the
 * Workspace canvas loses width to the left + right rails, so its container is
 * routinely < 1024px even on a wide screen — forcing every row to stack into a
 * single vertical column. The fix lowers the breakpoint to 768 and makes the
 * nested-container stacking decision slot-relative.
 *
 * What we assert at a WIDE window:
 *   1. simple-dashboard in the Workspace CANVAS lens lays its multi-item row
 *      out SIDE-BY-SIDE (item boxes share a Y, differ in X) — not stacked.
 *   2. nested-layouts-dashboard in the canvas lays out the nested-container
 *      Section 1 correctly (big chart left + nested stack right side-by-side
 *      at the top level; the nested sub-rows stack vertically within the slot).
 *   3. simple-dashboard in the /project View-mode still lays out side-by-side
 *      (no regression).
 *
 * NOTE (VIS-827): charts may show loading spinners in the Workspace canvas — a
 * separate known issue. We assert LAYOUT (item box geometry), not chart render.
 *
 * Precondition: Sandbox running on :3001/:8001
 *   VISIVO_SANDBOX_BACKEND_PORT=8025 VISIVO_SANDBOX_FRONTEND_PORT=3025 \
 *     VISIVO_SANDBOX_NAME=vis829 bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';

const WIDE = { width: 1600, height: 1000 };
const SCREENS = 'e2e/stories/__screens__';

// Two boxes are "side-by-side" when they overlap vertically (share a row band)
// and are horizontally separated (one strictly left of the other).
const sideBySide = (a, b) => {
  const verticalOverlap =
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const horizontallySeparated = a.x + a.width <= b.x + 2 || b.x + b.width <= a.x + 2;
  return verticalOverlap > 0 && horizontallySeparated;
};

// Two boxes are "stacked" when one sits below the other (vertical separation)
// and they share a horizontal band (same column).
const stacked = (a, b) => {
  const horizontalOverlap =
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const verticallySeparated = a.y + a.height <= b.y + 2 || b.y + b.height <= a.y + 2;
  return horizontalOverlap > 0 && verticallySeparated;
};

test.describe('Dashboard stacking breakpoint (VIS-829)', () => {
  test.use({ viewport: WIDE });

  test('Workspace canvas: simple-dashboard row items lay out side-by-side', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/workspace/dashboard/simple-dashboard');
    await page.waitForLoadState('networkidle');

    // Switch the middle pane to the Canvas (preview) lens.
    const canvasOption = page.getByTestId('workspace-lens-picker-option-preview');
    await expect(canvasOption).toBeVisible({ timeout: 15000 });
    await canvasOption.click();

    const canvas = page.getByTestId('workspace-middle-dashboard-canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // The dashboard renderer mounts inside the canvas.
    const dashboard = page.getByTestId('dashboard_simple-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    // Row 0 of simple-dashboard has two items (width 9 + width 2). At a wide
    // canvas they MUST sit side-by-side, not stacked.
    const row0 = page.getByTestId('dashboard-row-0');
    await expect(row0).toBeVisible({ timeout: 15000 });
    const items = row0.locator(':scope > div');
    await expect(items).toHaveCount(2);

    const boxA = await items.nth(0).boundingBox();
    const boxB = await items.nth(1).boundingBox();
    expect(boxA).toBeTruthy();
    expect(boxB).toBeTruthy();

    await page.screenshot({ path: `${SCREENS}/vis829-canvas-simple-dashboard.png`, fullPage: true });

    expect(
      sideBySide(boxA, boxB),
      `Row items should be side-by-side in the canvas. boxA=${JSON.stringify(
        boxA
      )} boxB=${JSON.stringify(boxB)}`
    ).toBe(true);
  });

  test('Workspace canvas: nested-layouts-dashboard lays nested containers out correctly', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/workspace/dashboard/nested-layouts-dashboard');
    await page.waitForLoadState('networkidle');

    const canvasOption = page.getByTestId('workspace-lens-picker-option-preview');
    await expect(canvasOption).toBeVisible({ timeout: 15000 });
    await canvasOption.click();

    const canvas = page.getByTestId('workspace-middle-dashboard-canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const dashboard = page.getByTestId('dashboard_nested-layouts-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    // Section 1 is row index 1 (row 0 is the markdown header): a big chart
    // (width 2) on the LEFT and a row-container (width 1) on the RIGHT. At a
    // wide canvas these top-level slots sit side-by-side.
    const section1 = page.getByTestId('dashboard-row-1');
    await expect(section1).toBeVisible({ timeout: 15000 });
    const topSlots = section1.locator(':scope > div');
    await expect(topSlots).toHaveCount(2);
    const leftBox = await topSlots.nth(0).boundingBox();
    const rightBox = await topSlots.nth(1).boundingBox();
    expect(leftBox).toBeTruthy();
    expect(rightBox).toBeTruthy();

    // The right slot is a nested row-container; its sub-rows stack vertically.
    const nestedRows = page.getByTestId('dashboard-nested-rows');
    await expect(nestedRows.first()).toBeVisible({ timeout: 15000 });
    const subRows = page.getByTestId('dashboard-nested-subrow');
    expect(await subRows.count()).toBeGreaterThanOrEqual(3);
    const sub0 = await subRows.nth(0).boundingBox();
    const sub1 = await subRows.nth(1).boundingBox();
    expect(sub0).toBeTruthy();
    expect(sub1).toBeTruthy();

    await page.screenshot({ path: `${SCREENS}/vis829-canvas-nested.png`, fullPage: true });

    expect(
      sideBySide(leftBox, rightBox),
      `Section 1 top-level slots should be side-by-side. left=${JSON.stringify(
        leftBox
      )} right=${JSON.stringify(rightBox)}`
    ).toBe(true);

    expect(
      stacked(sub0, sub1),
      `Nested sub-rows should stack vertically within the slot. sub0=${JSON.stringify(
        sub0
      )} sub1=${JSON.stringify(sub1)}`
    ).toBe(true);
  });

  test('Project View-mode: simple-dashboard still lays out side-by-side (no regression)', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/project-new/simple-dashboard');
    await page.waitForLoadState('networkidle');

    const dashboard = page.getByTestId('dashboard_simple-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    const row0 = page.getByTestId('dashboard-row-0');
    await expect(row0).toBeVisible({ timeout: 15000 });
    const items = row0.locator(':scope > div');
    await expect(items).toHaveCount(2);

    const boxA = await items.nth(0).boundingBox();
    const boxB = await items.nth(1).boundingBox();
    expect(boxA).toBeTruthy();
    expect(boxB).toBeTruthy();

    await page.screenshot({ path: `${SCREENS}/vis829-project-simple-dashboard.png`, fullPage: true });

    expect(
      sideBySide(boxA, boxB),
      `Project View-mode row items should be side-by-side. boxA=${JSON.stringify(
        boxA
      )} boxB=${JSON.stringify(boxB)}`
    ).toBe(true);
  });
});
