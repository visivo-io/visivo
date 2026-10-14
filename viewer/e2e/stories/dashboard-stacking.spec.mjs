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

    // Row 0 of simple-dashboard has multiple items. At a wide canvas they MUST
    // sit side-by-side, not stacked. Target the row's TOP-LEVEL item slots by
    // their `data-canvas-path` via the direct-child combinator (`:scope >`), which
    // (a) maps 1:1 to items even though each item is wrapped in extra layout divs
    // and (b) excludes any deeper nested-container paths. We assert "multiple
    // items, first two side-by-side" rather than a brittle exact count.
    const row0 = page.getByTestId('dashboard-row-0');
    await expect(row0).toBeVisible({ timeout: 15000 });
    const items = row0.locator(':scope > [data-canvas-path]');
    expect(await items.count()).toBeGreaterThanOrEqual(2);

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
    // Top-level slots only (direct-child combinator) — exclude the nested
    // container's deeper item paths.
    const topSlots = section1.locator(':scope > [data-canvas-path]');
    expect(await topSlots.count()).toBeGreaterThanOrEqual(2);
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
    await page.goto('/project/simple-dashboard');
    await page.waitForLoadState('networkidle');

    const dashboard = page.getByTestId('dashboard_simple-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    const row0 = page.getByTestId('dashboard-row-0');
    await expect(row0).toBeVisible({ timeout: 15000 });
    const items = row0.locator(':scope > [data-canvas-path]');
    expect(await items.count()).toBeGreaterThanOrEqual(2);

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

/**
 * VIS-1459 / L2: nested containers decide stacking from their OWN slot — a
 * nested item narrower than MIN_NESTED_ITEM_WIDTH (160px) stacks its sub-row;
 * otherwise the sub-row stays a grid. Before the fix `shouldStack(slotWidth)`
 * compared the slot against the dashboard-wide breakpoint (1024 in /project),
 * so the 2x2 KPI cluster in Section 2 of nested-layouts-dashboard (a 1/3 slot,
 * ~372px at 1200 / ~505px at 1600) always collapsed into a 1x4 column, with
 * each stacked cell handed the FULL sub-row height (clipped indicators).
 *
 * Reproduced 2026-10-11 at both widths before the fix (see PR screenshots
 * vis1459-l2-before-1200.png / -1600.png); this story pins the 2x2.
 */
test.describe('Nested 2x2 lays out 2x2 from its slot width (VIS-1459 L2)', () => {
  for (const width of [1200, 1600]) {
    test(`Project View-mode: Section 2 KPI cluster is 2x2 at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/project/nested-layouts-dashboard');
      await page.waitForLoadState('networkidle');

      const dashboard = page.getByTestId('dashboard_nested-layouts-dashboard');
      await expect(dashboard).toBeVisible({ timeout: 15000 });

      // Section 2 is row index 3 (0: header md, 1: Section 1, 2: header md).
      // Its first item is the width-1 container holding two 2-item sub-rows.
      const subRow0 = page.locator('[data-canvas-path="row.3.item.0.row.0"]');
      const subRow1 = page.locator('[data-canvas-path="row.3.item.0.row.1"]');
      await expect(subRow0).toBeVisible({ timeout: 15000 });
      await expect(subRow1).toBeVisible({ timeout: 15000 });
      // Wait for the indicators to actually plot so the geometry is settled.
      await expect(subRow1.locator('.main-svg').first()).toBeVisible({ timeout: 20000 });

      await expect(subRow0).toHaveCSS('display', 'grid');
      await expect(subRow1).toHaveCSS('display', 'grid');

      const cells = [];
      for (const subRow of [subRow0, subRow1]) {
        const items = subRow.locator(':scope > [data-canvas-path]');
        expect(await items.count()).toBe(2);
        const a = await items.nth(0).boundingBox();
        const b = await items.nth(1).boundingBox();
        expect(a).toBeTruthy();
        expect(b).toBeTruthy();
        expect(
          sideBySide(a, b),
          `sub-row cells should be side-by-side at ${width}px. a=${JSON.stringify(a)} b=${JSON.stringify(b)}`
        ).toBe(true);
        cells.push(a, b);
      }
      // Row 0's cells sit above row 1's → a 2x2, not a 1x4 column.
      expect(stacked(cells[0], cells[2]), '2x2: second sub-row below the first').toBe(true);
      expect(stacked(cells[1], cells[3]), '2x2: second sub-row below the first').toBe(true);
      // The two sub-rows share the same two column bands.
      expect(Math.abs(cells[0].x - cells[2].x)).toBeLessThan(2);
      expect(Math.abs(cells[1].x - cells[3].x)).toBeLessThan(2);
      // Every cell clears the slot-relative minimum item width.
      for (const c of cells) expect(c.width).toBeGreaterThanOrEqual(160);

      await page.screenshot({
        path: `${SCREENS}/vis1459-nested-2x2-${width}.png`,
        clip: { x: 0, y: Math.max(0, cells[0].y - 80), width, height: cells[3].y + cells[3].height - cells[0].y + 120 },
      });
    });
  }

  test('Workspace canvas: when a nested sub-row DOES stack, its items split the height', async ({
    page,
  }) => {
    // In /project (1024 breakpoint) Section 2's slot can never starve: below
    // ~1010px the top level has already stacked and the container owns the
    // full width. The Workspace canvas (768 breakpoint) loses ~600px to the
    // rails, so at 1600px its Section 2 slot is ~300px → ~150px cells < 160
    // → the sub-row stacks, and its two cells must each get about half of the
    // sub-row height (8px gap) with the plotted svg inside its cell — not the
    // full sub-row height each, overflowing (the pre-fix behaviour).
    await page.setViewportSize(WIDE);
    await page.goto('/workspace/dashboard/nested-layouts-dashboard');
    await page.waitForLoadState('networkidle');
    const canvasOption = page.getByTestId('workspace-lens-picker-option-preview');
    await expect(canvasOption).toBeVisible({ timeout: 15000 });
    await canvasOption.click();
    await expect(page.getByTestId('dashboard_nested-layouts-dashboard')).toBeVisible({ timeout: 15000 });

    const subRow0 = page.locator('[data-canvas-path="row.3.item.0.row.0"]');
    await expect(subRow0).toBeVisible({ timeout: 15000 });
    await subRow0.scrollIntoViewIfNeeded();
    const items = subRow0.locator(':scope > [data-canvas-path]');
    expect(await items.count()).toBe(2);
    const display = await subRow0.evaluate(el => getComputedStyle(el).display);
    const subRowBox = await subRow0.boundingBox();
    const a = await items.nth(0).boundingBox();
    const b = await items.nth(1).boundingBox();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    await page.screenshot({ path: `${SCREENS}/vis1459-canvas-nested-split.png` });
    if (display === 'flex') {
      expect(stacked(a, b), `cells should stack. a=${JSON.stringify(a)} b=${JSON.stringify(b)}`).toBe(true);
      expect(a.height + b.height).toBeLessThanOrEqual(subRowBox.height + 2);
      expect(Math.abs(a.height - b.height)).toBeLessThan(2);
      // Each cell is the whole slot wide (stacked items span the slot)…
      expect(Math.abs(a.width - subRowBox.width)).toBeLessThan(2);
      // …and under the slot-relative minimum (that is WHY it stacked).
      expect(subRowBox.width / 2).toBeLessThan(160);
    } else {
      // The canvas was wide enough for two ≥160px cells: a grid, side-by-side.
      expect(sideBySide(a, b)).toBe(true);
      expect(a.width).toBeGreaterThanOrEqual(160);
    }
  });
});


/**
 * A nested sub-row that stacks must give each stacked item a box at least as
 * tall as the chart drawn in it. The canvas at 1600px (both panels open) stacks
 * Section 2's KPI pairs; the row grows so each keeps the 160px stacked floor.
 */
test.describe('Stacked nested items fit the box they are given', () => {
  const measureNestedItems = page =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="dashboard-nested-item"]')].flatMap(item => {
        const svg = item.querySelector('.main-svg');
        if (!svg) return [];
        const box = item.getBoundingClientRect();
        const chart = svg.getBoundingClientRect();
        return [
          {
            path: item.dataset.canvasPath,
            stacked: getComputedStyle(item.parentElement).display === 'flex',
            height: box.height,
            overflowTop: box.top - chart.top,
            overflowBottom: chart.bottom - box.bottom,
          },
        ];
      })
    );

  const expectChartsInsideItems = items => {
    for (const item of items) {
      expect(item.overflowTop, `${item.path} chart starts above its box`).toBeLessThanOrEqual(1);
      expect(item.overflowBottom, `${item.path} chart runs past its box`).toBeLessThanOrEqual(1);
    }
  };

  const section2Charts = page => page.locator('[data-canvas-path="row.3.item.0"] .js-plotly-plot');

  test('Workspace canvas at 1600px: stacked KPI pairs keep the floor and draw inside their boxes', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/workspace/dashboard/nested-layouts-dashboard');
    await page.waitForLoadState('networkidle');
    const canvasOption = page.getByTestId('workspace-lens-picker-option-preview');
    await expect(canvasOption).toBeVisible({ timeout: 15000 });
    await canvasOption.click();
    await expect(page.getByTestId('dashboard_nested-layouts-dashboard')).toBeVisible({ timeout: 15000 });
    await expect(section2Charts(page)).toHaveCount(4, { timeout: 20000 });

    const section2 = page.locator('[data-canvas-path="row.3"]');
    await section2.scrollIntoViewIfNeeded();
    await section2.screenshot({ path: `${SCREENS}/stacked-nested-fit-canvas-1600.png` });

    const items = await measureNestedItems(page);
    const stackedKpis = items.filter(i => i.path.startsWith('row.3.item.0.') && i.stacked);
    expect(stackedKpis, 'Section 2 KPI pairs stack on the canvas at 1600px').toHaveLength(4);
    expectChartsInsideItems(items);
    for (const kpi of stackedKpis) expect(kpi.height).toBeGreaterThanOrEqual(159);
  });

  test('Project View-mode at 1600px: the 2x2 keeps its declared row height and fits', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/project/nested-layouts-dashboard');
    await page.waitForLoadState('networkidle');
    await expect(section2Charts(page)).toHaveCount(4, { timeout: 20000 });

    const section2 = page.getByTestId('dashboard-row-3');
    expect(Math.round((await section2.boundingBox()).height)).toBe(396);
    const items = await measureNestedItems(page);
    expect(items.filter(i => i.stacked)).toHaveLength(0);
    expectChartsInsideItems(items);
  });
});
