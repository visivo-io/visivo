/**
 * Story: Load Existing Chart (Design Spec Story 3)
 *
 * Precondition: Sandbox running on :3001/:8001 with integration test project.
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

async function loadExplorer(page) {
  await page.goto('/explorer-new');
  await page.waitForLoadState('networkidle');
  await page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE });
}

test.describe('Explorer Load Existing Chart', () => {
  test.setTimeout(60000);

  test('Step 1: Click chart in left nav loads it', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByText('simple-scatter-chart').first()).toBeVisible({ timeout: 10000 });
  });

  test('Step 2: Loaded chart has disabled save', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({ timeout: 5000 });
  });
});
