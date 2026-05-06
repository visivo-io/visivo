/**
 * Story: Right-click "Preview 100 rows" on a table
 *
 * Validates the new context menu + DataPreviewModal flow on the schema tree.
 * The user navigates to /explorer, expands a source, right-clicks a table,
 * picks "Preview 100 rows", and sees the actual data in a modal.
 *
 * Precondition: Sandbox running on :3018/:8018
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

async function loadExplorer(page) {
  await page.goto('/explorer');
  await page.waitForLoadState('networkidle');
  await page.getByText('Run a query to see results').waitFor({ timeout: WAIT_FOR_PAGE });
}

test.describe('Source preview rows action', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('right-click a table → Preview 100 rows opens the data modal', async ({ page }) => {
    await loadExplorer(page);

    // Expand local-sqlite to expose its tables
    await page.getByText('local-sqlite').first().click();
    await expect(page.getByText('test_table').first()).toBeVisible({
      timeout: 10000,
    });

    // Right-click on the table tree node. Use the testid the SourceBrowser
    // assigns to each table tree entry.
    const tableNode = page
      .locator('[data-testid^="tree-node-table-test_table"]')
      .first();
    await tableNode.click({ button: 'right' });

    // Context menu appears with the preview action
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });
    const previewAction = page.getByTestId('context-menu-preview');
    await expect(previewAction).toBeVisible();

    // Click the action
    await previewAction.click();

    // Modal becomes visible
    const modal = page.getByTestId('data-preview-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Wait for table to appear OR an error/empty state
    await expect(
      page
        .getByTestId('preview-table')
        .or(page.getByTestId('preview-empty'))
        .or(page.getByTestId('preview-error'))
    ).toBeVisible({ timeout: 15000 });

    // We expect data for the integration project's seeded test_table
    await expect(page.getByTestId('preview-table')).toBeVisible({ timeout: 15000 });

    // At least one row should be present
    await expect(page.getByTestId('preview-row-0')).toBeVisible();

    // Headers/columns should be rendered
    const table = page.getByTestId('preview-table');
    const headerCells = table.locator('thead th');
    expect(await headerCells.count()).toBeGreaterThan(0);

    // Take a screenshot for visual record
    await page.screenshot({
      path: 'e2e/screenshots/preview-rows-modal.png',
      fullPage: false,
    });

    // Close via the close button
    await page.getByTestId('preview-close-button').click();
    await expect(page.getByTestId('data-preview-modal')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('clicking outside the context menu dismisses it', async ({ page }) => {
    await loadExplorer(page);

    await page.getByText('local-sqlite').first().click();
    await expect(page.getByText('test_table').first()).toBeVisible({
      timeout: 10000,
    });

    const tableNode = page
      .locator('[data-testid^="tree-node-table-test_table"]')
      .first();
    await tableNode.click({ button: 'right' });

    await expect(page.getByTestId('context-menu')).toBeVisible({ timeout: 5000 });

    // Click on an empty area to dismiss
    await page.mouse.click(10, 10);
    await expect(page.getByTestId('context-menu')).not.toBeVisible({ timeout: 5000 });
  });

  test('Escape closes the preview modal', async ({ page }) => {
    await loadExplorer(page);

    await page.getByText('local-sqlite').first().click();
    await expect(page.getByText('test_table').first()).toBeVisible({
      timeout: 10000,
    });

    const tableNode = page
      .locator('[data-testid^="tree-node-table-test_table"]')
      .first();
    await tableNode.click({ button: 'right' });

    await page.getByTestId('context-menu-preview').click();

    await expect(page.getByTestId('data-preview-modal')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('data-preview-modal')).not.toBeVisible({
      timeout: 5000,
    });
  });
});
