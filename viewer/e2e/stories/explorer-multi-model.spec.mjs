/**
 * Story: Multi-Model Explorer Flow
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

test.describe('Explorer Multi-Model', () => {
  test.setTimeout(60000);

  test('Step 1: Create model tab via Add model button', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('No models')).not.toBeVisible();
  });

  test('Step 2: Load two models creates tabs', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'local_test_table' }).first().click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText('No models')).not.toBeVisible();
  });

  test('Step 3: Collapse sidebar hides search', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByPlaceholder('Search...')).not.toBeVisible();
  });
});
