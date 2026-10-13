/**
 * Story: a builder customizes the dashboard theme from the project editor.
 *
 * Precondition: sandbox running (integration project) on :3001/:8001. Writes a draft theme
 * into the backend cache and discards it afterwards; never commits.
 */
import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const API_URL = process.env.VISIVO_API_URL || 'http://localhost:8001';

const discardDrafts = request => request.post(`${API_URL}/api/projects/id/discard/`);

test.describe('Theme editing', () => {
  test.describe.configure({ mode: 'serial', timeout: 90000 });

  test.afterEach(async ({ request }) => {
    await discardDrafts(request);
  });

  test('a saved theme becomes a pending change and restyles dashboards', async ({
    page,
    request,
  }) => {
    await page.goto(`${BASE_URL}/workspace?view=project`);
    await page.getByTestId('project-editor-theme').click();
    const dialog = page.getByRole('dialog', { name: 'Dashboard theme' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Default mode').selectOption('dark');
    await dialog.getByRole('tab', { name: 'Dark only' }).click();
    await dialog.getByLabel('Card surface', { exact: true }).fill('#202020');
    await expect(dialog.getByTestId('theme-preview')).toHaveAttribute('data-theme', 'dark');

    await dialog.getByRole('button', { name: 'Save theme' }).click();
    await expect(dialog.getByText('Saved as a draft')).toBeVisible();

    const theme = await (await request.get(`${API_URL}/api/theme/`)).json();
    expect(theme).toMatchObject({ mode: 'dark', dark: { surface: '#202020' } });
    const pending = await (await request.get(`${API_URL}/api/commit/pending/`)).json();
    expect(pending.pending).toContainEqual(expect.objectContaining({ type: 'theme' }));

    await page.goto(`${BASE_URL}/project/simple-dashboard`);
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter(k => k.startsWith('visivo:dashboard-theme:'))
        .forEach(k => localStorage.removeItem(k))
    );
    await page.reload();
    const root = page.getByTestId('dashboard-theme-root');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('.js-plotly-plot')?._fullLayout?.paper_bgcolor)
      )
      .toBe('#202020');
  });

  test('invalid colors are rejected by the server and reported in the form', async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace?view=project`);
    await page.getByTestId('project-editor-theme').click();
    const dialog = page.getByRole('dialog', { name: 'Dashboard theme' });

    await dialog.getByLabel('Accent', { exact: true }).fill('purple');
    await dialog.getByRole('button', { name: 'Save theme' }).click();

    await expect(dialog.getByText(/not a hex color/)).toBeVisible();
  });
});
