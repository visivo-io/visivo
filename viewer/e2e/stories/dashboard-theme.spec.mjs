/**
 * Story: a viewer switches a dashboard between the built-in light and dark themes.
 *
 * Precondition: sandbox running (integration project, no project `theme`) on :3001/:8001.
 * Read-only apart from the per-browser localStorage override.
 */
import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const DASHBOARD = 'simple-dashboard';
const LIGHT = { bg: 'rgb(246, 245, 241)', surface: 'rgb(255, 255, 255)', paper: '#ffffff' };
const DARK = { bg: 'rgb(18, 21, 42)', surface: 'rgb(27, 31, 54)', paper: '#1b1f36' };

const themeRoot = page => page.getByTestId('dashboard-theme-root');

const plotPaperColors = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('.js-plotly-plot')]
      .map(p => p._fullLayout?.paper_bgcolor)
      .filter(Boolean)
  );

const expectThemed = async (page, mode, colors) => {
  await expect(themeRoot(page)).toHaveAttribute('data-theme', mode);
  await expect(themeRoot(page)).toHaveCSS('background-color', colors.bg);
  const card = page
    .locator('.js-plotly-plot')
    .first()
    .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await expect(card).toHaveCSS('background-color', colors.surface);
  await expect.poll(() => plotPaperColors(page)).toContain(colors.paper);
  const papers = await plotPaperColors(page);
  expect(papers.every(c => c === colors.paper)).toBe(true);
};

test.describe('Dashboard theme toggle', () => {
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/project/${DASHBOARD}`);
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter(k => k.startsWith('visivo:dashboard-theme:'))
        .forEach(k => localStorage.removeItem(k))
    );
    await page.reload();
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: 30000 });
  });

  test('defaults to the built-in light theme', async ({ page }) => {
    await expectThemed(page, 'light', LIGHT);
    await expect(page.getByRole('radio', { name: 'Light theme' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('switching to dark re-themes charts and cards, and survives a reload', async ({ page }) => {
    await page.getByRole('radio', { name: 'Dark theme' }).click();
    await expectThemed(page, 'dark', DARK);

    await page.reload();
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: 30000 });
    await expectThemed(page, 'dark', DARK);
  });

  test('auto follows the operating system preference', async ({ page }) => {
    await page.getByRole('radio', { name: 'Match system theme' }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(themeRoot(page)).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(themeRoot(page)).toHaveAttribute('data-theme', 'light');
  });
});
