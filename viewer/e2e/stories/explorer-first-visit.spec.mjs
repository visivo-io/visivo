/**
 * Story: Explorer First Visit (Design Spec Story 1)
 *
 * Validates the full first-visit flow: empty state → layout → objects → interactions.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

/** Navigate to explorer and wait for full render */
async function loadExplorer(page) {
  await page.goto('/explorer-new');
  await page.waitForLoadState('networkidle');
  await page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE });
}

test.describe('Explorer First Visit', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Step 1: Three-panel layout renders without errors', async ({ page }) => {
    await loadExplorer(page);

    // Left panel: object lists load
    await expect(page.getByText('Models (7)')).toBeVisible();

    // Center panel: empty state
    await expect(page.getByText('Run a query to see results')).toBeVisible();

    // Right panel: save button
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeVisible();

    // No console errors
    const realErrors = page._consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('DevTools') && !e.includes('react-cool')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Step 2: Source tree shows sources', async ({ page }) => {
    await loadExplorer(page);

    await expect(page.getByText('local-sqlite').first()).toBeVisible();
    await expect(page.getByText('local-duckdb').first()).toBeVisible();
  });

  test('Step 3: All object type sections render', async ({ page }) => {
    await loadExplorer(page);

    await expect(page.getByText('Models (7)')).toBeVisible();
    await expect(page.getByText('Metrics (5)')).toBeVisible();
    await expect(page.getByText('Dimensions (3)')).toBeVisible();
    await expect(page.getByText('Insights (20)')).toBeVisible();
    await expect(page.getByText('Charts (26)')).toBeVisible();
    await expect(page.getByText('Inputs (15)')).toBeVisible();
  });

  test('Step 4: Clicking a model loads it into a tab', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(2000);

    await expect(page.getByText('No models')).not.toBeVisible({ timeout: 5000 });
  });

  test('Step 5: Search filters objects', async ({ page }) => {
    await loadExplorer(page);

    await page.getByPlaceholder('Search...').fill('fibonacci');
    await page.waitForTimeout(500);

    await expect(page.getByText('fibonacci').first()).toBeVisible();
  });

  test('Step 6: Right panel has chart CRUD and disabled save', async ({ page }) => {
    await loadExplorer(page);

    await expect(page.getByText('Chart: Untitled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Insight' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled();
  });

  test('Step 7: Adding an insight enables save', async ({ page }) => {
    await loadExplorer(page);

    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled();
  });
});
