/**
 * Story: J-3 / VIS-782 — "Open in Explorer" + return chip.
 *
 * Right-clicking a CHART or TABLE leaf on the Workspace canvas offers "Open in
 * Explorer", which navigates to
 * /explorer?insight|table=<name>&return_to=workspace&dashboard=<name>. The entry
 * is absent for markdown leaves and for container / row (non-leaf) selections.
 *
 * Explorer then shows a "Back to dashboard '<name>'" return chip in a top bar
 * ONLY when entered with ?return_to=workspace&dashboard; clicking it returns to
 * /workspace/dashboard/<name>. A normal Explorer entry shows no chip/bar.
 *
 * Precondition: sandbox (integration project).
 */

import { test, expect } from '@playwright/test';

const DASHBOARD = 'simple-dashboard';
// table-dashboard row 3 (index 2) holds: markdown, table, chart — perfect for
// asserting the entry shows for chart/table leaves but NOT for markdown.
const MIXED_DASHBOARD = 'table-dashboard';

async function rightClickCanvasItem(page, selector) {
  const item = page.locator(selector).first();
  await expect(item).toBeVisible({ timeout: 20000 });
  await item.click({ button: 'right' });
  await expect(page.locator('[data-testid="canvas-context-menu"]')).toBeVisible({ timeout: 5000 });
}

for (const viewport of [
  { name: 'desktop', width: 1600, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test.describe(`J-3 — return chip (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.setTimeout(90000);

    test('return bar/chip is absent on a normal Explorer entry', async ({ page }) => {
      await page.goto('/explorer');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="explorer-return-bar"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="explorer-return-chip"]')).toHaveCount(0);
    });

    test('return chip is absent when return_to is set but dashboard is missing', async ({
      page,
    }) => {
      await page.goto('/explorer?return_to=workspace');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="explorer-return-chip"]')).toHaveCount(0);
    });

    test('return chip appears with ?return_to=workspace&dashboard and navigates back', async ({
      page,
    }) => {
      await page.goto(`/explorer?return_to=workspace&dashboard=${DASHBOARD}`);
      await page.waitForLoadState('networkidle');
      const chip = page.locator('[data-testid="explorer-return-chip"]');
      await expect(chip).toBeVisible({ timeout: 15000 });
      await expect(chip).toContainText(DASHBOARD);
      await chip.click();
      await page.waitForURL(new RegExp(`/workspace/dashboard/${DASHBOARD}`), { timeout: 15000 });
      expect(page.url()).toContain(`/workspace/dashboard/${DASHBOARD}`);
    });
  });
}

// Context-menu assertions are desktop-only (right-click affordance over canvas).
test.describe('J-3 — "Open in Explorer" context-menu entry (desktop)', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });
  test.setTimeout(90000);

  test('chart leaf right-click offers "Open in Explorer" and navigates correctly', async ({
    page,
  }) => {
    await page.goto(`/workspace/dashboard/${DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    // simple-dashboard row 0 item 0 is a chart leaf.
    await rightClickCanvasItem(page, '[data-canvas-path="row.0.item.0"]');
    const openItem = page.locator('[data-testid="canvas-ctx-open-in-explorer"]');
    await expect(openItem).toBeVisible({ timeout: 5000 });
    await openItem.click();
    await page.waitForURL(/\/explorer\?/, { timeout: 15000 });
    const url = page.url();
    expect(url).toContain('return_to=workspace');
    expect(url).toContain(`dashboard=${DASHBOARD}`);
    expect(url).toContain('insight=');
  });

  test('table leaf right-click offers "Open in Explorer" with a ?table= target', async ({
    page,
  }) => {
    await page.goto(`/workspace/dashboard/${MIXED_DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    // row index 2 holds markdown(0) / table(1) / chart(2).
    await rightClickCanvasItem(page, '[data-canvas-path="row.2.item.1"]');
    const openItem = page.locator('[data-testid="canvas-ctx-open-in-explorer"]');
    await expect(openItem).toBeVisible({ timeout: 5000 });
    await openItem.click();
    await page.waitForURL(/\/explorer\?/, { timeout: 15000 });
    expect(page.url()).toContain('table=');
    expect(page.url()).toContain('return_to=workspace');
  });

  test('markdown leaf right-click does NOT offer "Open in Explorer"', async ({ page }) => {
    await page.goto(`/workspace/dashboard/${MIXED_DASHBOARD}`);
    await page.waitForLoadState('networkidle');
    // row index 2 item 0 is markdown.
    await rightClickCanvasItem(page, '[data-canvas-path="row.2.item.0"]');
    // The menu is open but carries no Explorer entry for a markdown leaf.
    await expect(page.locator('[data-testid="canvas-ctx-open-in-explorer"]')).toHaveCount(0);
  });

  // NOTE on non-leaf (row / container) selections: the canvas resolves a
  // right-click to the INNERMOST data-canvas-path, and rows here are fully filled
  // by their chart/table items, so a click reliably lands on the leaf — a pure
  // row/container target is not deterministically clickable in the browser. The
  // markdown-leaf case above already proves "not every selection offers Open in
  // Explorer" at the e2e layer; the explicit row-right-click and
  // container-right-click negatives are exhaustively covered at the unit level in
  // CanvasContextMenu.test.jsx ("a row right-click does not offer Open in
  // Explorer" / "a container item does not offer Open in Explorer").
});
