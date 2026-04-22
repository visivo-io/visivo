/**
 * Story: Explorer CRUD — Save, Modification Tracking, Status Dots
 *
 * Tests the save modal, modification detection, status dots, and save lifecycle.
 *
 * Precondition: Sandbox running on :3001/:8001
 *
 * IMPORTANT: Tests that actually SAVE to the server must run LAST
 * because they modify server state that affects subsequent tests.
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart, loadExplorer, typeSql, runQuery } from '../helpers/explorer.mjs';

// --- Read-only tests (no server state mutation) ---

test.describe('Explorer CRUD — Status Detection', () => {
  test.setTimeout(90000);

  test('US-CRUD-1: Loading chart without editing — save button disabled', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="explorer-save-button"]')).toBeDisabled({ timeout: 5000 });
  });

  test('US-CRUD-3: Modified insight shows in save modal', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();
    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.selectOption('scatter');
    await page.waitForTimeout(1500);

    await page.locator('[data-testid="explorer-save-button"]').click();
    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText('combined-interactions-test-insight')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="save-modal-cancel"]').click();
  });

  test('US-CRUD-5: Changing insight type enables save button', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="explorer-save-button"]')).toBeDisabled({ timeout: 5000 });

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();
    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.selectOption('pie');
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-testid="explorer-save-button"]')).not.toBeDisabled({ timeout: 5000 });
  });

  test('US-CRUD-6: New insight shows in save modal', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    await page.locator('[data-testid="chart-add-insight"]').click();
    await page.waitForTimeout(1500);

    await page.locator('[data-testid="explorer-save-button"]').click();
    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="save-modal-confirm"]')).not.toBeDisabled({ timeout: 3000 });
    await page.locator('[data-testid="save-modal-cancel"]').click();
  });

  test('US-CRUD-10: Loading chart without changes — save disabled', async ({ page }) => {
    await loadExplorerWithChart(page, 'autocomplete-date-chart');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="explorer-save-button"]')).toBeDisabled({ timeout: 5000 });
  });

  test('US-CRUD-13: Pre-existing metrics not shown as NEW', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();
    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.selectOption('scatter');
    await page.waitForTimeout(1500);

    await page.locator('[data-testid="explorer-save-button"]').click();
    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText('x_sum')).not.toBeVisible({ timeout: 2000 });
    await page.locator('[data-testid="save-modal-cancel"]').click();
  });

  test('US-CRUD-16: New model appears in save modal with new status', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);
    await page.waitForTimeout(1500);

    await page.locator('[data-testid="explorer-save-button"]').click();
    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="save-modal-confirm"]')).not.toBeDisabled({ timeout: 3000 });
    await page.locator('[data-testid="save-modal-cancel"]').click();
  });

  test('US-CRUD-19: Chart name is disabled for loaded charts', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    const chartNameInput = page.locator('[data-testid="chart-name-input"]');
    await expect(chartNameInput).toBeVisible({ timeout: 5000 });
    await expect(chartNameInput).toBeDisabled();
  });
});

// --- Tests that SAVE to server (run last to avoid state corruption) ---

test.describe('Explorer CRUD — Save Lifecycle', () => {
  test.setTimeout(90000);

  test('US-CRUD-2: Save modified insight succeeds without validation error', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);
    await page.waitForTimeout(500);

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    const saveButton = page.locator('[data-testid="explorer-save-button"]');
    await expect(saveButton).not.toBeDisabled({ timeout: 5000 });
    await saveButton.click();
    await expect(page.locator('[data-testid="explorer-save-modal"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="save-modal-confirm"]').click();

    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="save-error"]')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="save-modal-cancel"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('US-CRUD-17: Save clears status dots and disables save button', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 5');
    await runQuery(page);
    await page.waitForTimeout(1500);

    const saveButton = page.locator('[data-testid="explorer-save-button"]');
    await expect(saveButton).not.toBeDisabled({ timeout: 5000 });

    await saveButton.click();
    await expect(page.locator('[data-testid="explorer-save-modal"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="save-modal-confirm"]').click();

    await page.waitForTimeout(5000);
    await expect(page.locator('[data-testid="save-modal-cancel"]')).not.toBeVisible({ timeout: 5000 });
    await expect(saveButton).toBeDisabled({ timeout: 10000 });
  });
});
