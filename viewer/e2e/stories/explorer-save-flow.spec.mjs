/**
 * Story: Explorer Save Flow
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

async function loadExplorer(page) {
  await page.goto('/explorer-new');
  await page.waitForLoadState('networkidle');
  await page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE });
}

test.describe('Explorer Save Flow', () => {
  test.setTimeout(60000);

  test('Step 1: Save button disabled on fresh page', async ({ page }) => {
    await loadExplorer(page);

    const saveButton = page.getByRole('button', { name: 'Save to Project' });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();
  });

  test('Step 2: Creating new model enables save', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled();
  });

  test('Step 3: Clicking save opens modal', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'Add model' }).click();
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
