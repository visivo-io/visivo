/**
 * Story: VIS-1461 - hyphenated input names substitute in static props, and the
 * slider accepts string options in list order.
 *
 *   I4: `mode: ${ref(mode-toggle).value}` must reach Plotly as the toggle's value
 *       (it used to stay literal text because the regex only matched \w+ names).
 *   I6: a slider over ['low','mid','high'] is an index in list order, labels show
 *       the option text and the store receives the option value.
 *
 * Precondition: sandbox serving test-projects/integration.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3034 npx playwright test inputs-substitution
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3034';
const DASHBOARD = 'input-substitution-dashboard';
const SCREENS = 'e2e/stories/__screens__';

const plotData = (page, index) =>
  page.evaluate(i => {
    const plots = [...document.querySelectorAll('.js-plotly-plot')];
    const p = plots[i];
    return p && p.data ? p.data.map(t => ({ mode: t.mode, x: t.x ? [...t.x] : [] })) : null;
  }, index);

test.describe('VIS-1461 input substitution', () => {
  for (const viewport of [
    { width: 1400, height: 900 },
    { width: 900, height: 900 },
  ]) {
    test(`hyphenated toggle drives mode; string slider drives filter @${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
      await expect(page.locator('.js-plotly-plot svg.main-svg').first()).toBeVisible({
        timeout: 60000,
      });
      await expect(page.locator('.js-plotly-plot')).toHaveCount(2, { timeout: 60000 });

      // I4: default 'lines', then flip the toggle to 'markers'.
      await expect.poll(async () => (await plotData(page, 0))?.[0]?.mode).toBe('lines');
      await page.getByRole('switch').click();
      await expect.poll(async () => (await plotData(page, 0))?.[0]?.mode).toBe('markers');
      await page.getByRole('switch').click();
      await expect.poll(async () => (await plotData(page, 0))?.[0]?.mode).toBe('lines');

      // I6: labels in list order, text (not numbers).
      const ticks = await page.locator('span.text-xs').allTextContents();
      expect(ticks.filter(t => ['low', 'mid', 'high'].includes(t))).toEqual(['low', 'mid', 'high']);
      await expect(page.locator('span.text-lg', { hasText: 'low' })).toBeVisible();
      await expect.poll(async () => (await plotData(page, 1))?.[0]?.x?.length).toBe(3);

      const slider = page.getByRole('slider');
      await slider.fill('1');
      await expect(page.locator('span.text-lg', { hasText: 'mid' })).toBeVisible();
      await expect.poll(async () => (await plotData(page, 1))?.[0]?.x?.length).toBe(5);
      await slider.fill('2');
      await expect(page.locator('span.text-lg', { hasText: 'high' })).toBeVisible();
      await expect.poll(async () => (await plotData(page, 1))?.[0]?.x?.length).toBe(7);

      await page.screenshot({ path: `${SCREENS}/inputs-substitution-${viewport.width}.png` });
    });
  }
});
