/**
 * Story: KPI tiles stay legible in short rows
 *
 * /project/kpi-dashboard (fixture: test-projects/integration/kpi_dashboard.visivo.yml)
 * holds an `xsmall` (128px) and a `small` (256px) row, each with a number+delta
 * indicator and a titled one. For every tile, at a wide and a stacked phone
 * viewport, the rendered number, delta and title must sit inside the tile, the
 * number must be at least twice the theme's 12px body text, and the delta at
 * least body-text size.
 *
 * Precondition: sandbox serving test-projects/integration, e.g.
 *   VISIVO_SANDBOX_BACKEND_PORT=8079 VISIVO_SANDBOX_FRONTEND_PORT=3079 \
 *     VISIVO_SANDBOX_NAME=fix1477 bash scripts/sandbox.sh start
 *   PLAYWRIGHT_BASE_URL=http://localhost:3079 npx playwright test e2e/stories/dashboard-kpi.spec.mjs
 */

import { test, expect } from '@playwright/test';

const SCREENS = 'e2e/stories/__screens__';
const BODY_FONT_PX = 12;
const MIN_NUMBER_FONT_PX = 2 * BODY_FONT_PX;

const VIEWPORTS = [
  { name: 'wide', width: 1440, height: 1000 },
  { name: 'phone', width: 390, height: 900 },
];

const measureTiles = page =>
  page.evaluate(() => {
    const textBox = el => {
      if (!el) return null;
      const { top, bottom, left, right } = el.getBoundingClientRect();
      const fontPx = parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a;
      return { top, bottom, left, right, fontPx, text: el.textContent };
    };
    return [...document.querySelectorAll('[data-testid^="dashboard-row-"] > [data-canvas-path]')].map(
      slot => {
        const { top, bottom, left, right, height } = slot.getBoundingClientRect();
        return {
          path: slot.dataset.canvasPath,
          slot: { top, bottom, left, right, height },
          number: textBox(slot.querySelector('text.number')),
          delta: textBox(slot.querySelector('text.delta')),
          title: textBox(slot.querySelector('text.title')),
        };
      }
    );
  });

const expectInside = (box, slot, label) => {
  expect(box.top, `${label} top`).toBeGreaterThanOrEqual(slot.top);
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(slot.bottom);
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(slot.left);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(slot.right);
};

test.describe('KPI tiles in short rows', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} (${viewport.width}px): number, delta and title fit and are legible`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/project/kpi-dashboard');
      const dashboard = page.getByTestId('dashboard_kpi-dashboard');
      await expect(dashboard).toBeVisible({ timeout: 15000 });
      await expect(dashboard.locator('.js-plotly-plot')).toHaveCount(4, { timeout: 30000 });
      await expect(dashboard.locator('text.number')).toHaveCount(4);

      const tiles = await measureTiles(page);
      expect(tiles).toHaveLength(4);
      if (viewport.name === 'wide') {
        expect(Math.round(tiles[0].slot.height)).toBe(128);
      }

      for (const tile of tiles) {
        expectInside(tile.number, tile.slot, `${tile.path} number`);
        expectInside(tile.delta, tile.slot, `${tile.path} delta`);
        expect(tile.number.fontPx, `${tile.path} number font`).toBeGreaterThanOrEqual(
          MIN_NUMBER_FONT_PX
        );
        expect(tile.delta.fontPx, `${tile.path} delta font`).toBeGreaterThanOrEqual(BODY_FONT_PX);
        if (tile.title.text) expectInside(tile.title, tile.slot, `${tile.path} title`);
      }
      expect(tiles.filter(tile => tile.title.text)).toHaveLength(2);

      await page.screenshot({ path: `${SCREENS}/kpi-${viewport.name}.png` });
    });
  }
});
