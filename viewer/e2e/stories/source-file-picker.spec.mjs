/**
 * Story: Source File Picker
 *
 * Validates that the Browse... button on SQLite/DuckDB/CSV path fields:
 *   1. Renders for those source types
 *   2. Triggers the hidden file input
 *   3. Uploads via POST /api/source/upload-temp/
 *   4. Auto-fills the path field with the returned absolute path
 *
 * Precondition: Sandbox running on :3015/:8015 — invoked via
 *   VISIVO_SANDBOX_BACKEND_PORT=8015 VISIVO_SANDBOX_FRONTEND_PORT=3015
 *   VISIVO_SANDBOX_NAME=file-picker bash scripts/sandbox.sh start
 */

import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'test.db');

const WAIT_FOR_PAGE = 15000;

// Pin to the file-picker sandbox (8015 backend / 3015 frontend) so tests run
// against the worktree's code, not the user's :3000/:3001 default sandbox.
test.use({ baseURL: process.env.PW_FILE_PICKER_BASE_URL || 'http://localhost:3015' });

async function openCreateSourcePanel(page) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');
  await page
    .getByText(/^Sources \(\d+\)/)
    .first()
    .waitFor({ timeout: WAIT_FOR_PAGE });

  // FAB → Source.
  await page.getByRole('button', { name: 'Create new object' }).click();
  await page.getByRole('button', { name: 'Source', exact: true }).click();

  // Wait for the create panel to render the Source Type select.
  const typeSelect = page.locator('select');
  await typeSelect.first().waitFor({ timeout: WAIT_FOR_PAGE });
  return typeSelect.first();
}

test.describe('Source file picker', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Browse button on SQLite source uploads a file and fills the path', async ({ page }) => {
    const typeSelect = await openCreateSourcePanel(page);
    await typeSelect.selectOption('sqlite');

    // Browse... button + hidden file input must both exist.
    const browseBtn = page.getByTestId('file-picker-button-database');
    await expect(browseBtn).toBeVisible({ timeout: 10000 });

    const fileInput = page.getByTestId('file-picker-input-database');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Path field auto-fills with the returned absolute path.
    const pathField = page.locator('input#database');
    await expect(pathField).toHaveValue(/\/data\/test\.db$/, { timeout: 10000 });
  });

  test('CSV source shows Browse + delimiter/encoding/has_header options', async ({ page }) => {
    const typeSelect = await openCreateSourcePanel(page);
    await typeSelect.selectOption('csv');

    await expect(page.getByTestId('file-picker-button-file')).toBeVisible({ timeout: 10000 });

    // CSV-specific options below the path picker.
    await expect(page.locator('input#delimiter')).toBeVisible();
    await expect(page.locator('select#encoding')).toBeVisible();
    await expect(page.locator('input#has_header')).toBeChecked();
  });

  test('No console errors during file picker flow', async ({ page }) => {
    const typeSelect = await openCreateSourcePanel(page);
    await typeSelect.selectOption('sqlite');

    await expect(page.getByTestId('file-picker-button-database')).toBeVisible({ timeout: 10000 });

    const fileInput = page.getByTestId('file-picker-input-database');
    await fileInput.setInputFiles(FIXTURE_PATH);

    await expect(page.locator('input#database')).toHaveValue(/\/data\/test\.db$/, {
      timeout: 10000,
    });

    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
