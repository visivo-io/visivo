/**
 * Story: Explorer Save Flow
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, typeSql } from '../helpers/explorer.mjs';

test.describe('Explorer Save Flow', () => {
  test.setTimeout(60000);

  test('Step 1: Save button enabled on fresh page (auto-created insight)', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created insight is isNew=true, so save is enabled immediately
    const saveButton = page.getByRole('button', { name: 'Save to Project' });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });

  test('Step 2: Creating new model with SQL enables save', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created empty model tab does not enable save;
    // typing SQL into it is a real user action that enables save
    await typeSql(page, 'SELECT 1');
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled();
  });

  test('Step 3: Clicking save opens modal', async ({ page }) => {
    await loadExplorer(page);

    // Type SQL to enable save (empty auto-created model does not enable save)
    await typeSql(page, 'SELECT 1');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Save to Project' }).click();
    await page.waitForTimeout(500);

    // Modal buttons appear
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
  });

  test('Step 4: Loaded unchanged chart keeps save disabled', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({ timeout: 5000 });
  });
});
