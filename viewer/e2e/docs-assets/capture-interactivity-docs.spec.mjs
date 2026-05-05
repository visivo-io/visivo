import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ baseURL: 'http://localhost:3001', viewport: { width: 1280, height: 720 } });

const ASSET_DIR = path.resolve(process.cwd(), '..', 'mkdocs', 'assets');

const waitForPlot = async page => {
  await page.waitForSelector('.js-plotly-plot', { timeout: 30000 });
  // Wait until at least one bar trace path exists in the SVG
  await page
    .waitForFunction(
      () => document.querySelectorAll('.js-plotly-plot .barlayer .point').length > 0,
      null,
      { timeout: 15000 }
    )
    .catch(() => {});
  await page.waitForTimeout(1500);
};

test('capture interactivity doc screenshots (default + selected)', async ({ page }) => {
  test.setTimeout(180000);

  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));

  await page.goto('/project/Sales', { waitUntil: 'networkidle' });
  await waitForPlot(page);

  const dashboardEl = page.locator('[data-testid^="dashboard_"]');
  await expect(dashboardEl).toBeVisible();

  await dashboardEl.screenshot({
    path: path.join(ASSET_DIR, 'interactivity-default.png'),
  });
  console.log('Saved interactivity-default.png');

  // Click the dropdown trigger
  await page.getByText('North', { exact: true }).first().click();
  await page.waitForTimeout(500);

  // Click "West" in the open menu
  await page.getByText('West', { exact: true }).first().click();
  await page.waitForTimeout(500);

  // Click outside to close any lingering dropdown
  await page.locator('body').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(500);

  // Wait for chart to re-render with West data
  await waitForPlot(page);

  await dashboardEl.screenshot({
    path: path.join(ASSET_DIR, 'interactivity-selected.png'),
  });
  console.log('Saved interactivity-selected.png');

  expect(true).toBe(true);
});
