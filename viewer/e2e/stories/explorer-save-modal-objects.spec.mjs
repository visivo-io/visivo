/**
 * Story: Save Modal — Computed Columns as Metrics/Dimensions
 *
 * Bug: ExplorerSaveModal only shows models and insights. Computed columns
 * (metrics/dimensions from modelStates[name].computedColumns[]) are saved
 * by saveExplorerObjects() but never shown as pills in the modal.
 *
 * These tests document what SHOULD happen and will FAIL until the bug is fixed.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

/** Add a computed column via the popover. Returns true if successful. */
async function addComputedColumn(page, name, expression) {
  const addBtn = page.locator('[data-testid="add-computed-column-btn"]');
  if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) return false;

  await addBtn.click();

  const popover = page.locator('[data-testid="add-computed-column-popover"]');
  await popover.waitFor({ state: 'visible', timeout: 5000 });
  await popover.locator('input').first().fill(name);
  await popover.locator('textarea, input').last().fill(expression);

  const confirmBtn = popover.getByRole('button', { name: /add/i });
  if (!(await confirmBtn.isEnabled({ timeout: 5000 }).catch(() => false))) return false;

  await confirmBtn.click();
  return true;
}

/** Set up a model with query results so computed columns can be added. */
async function setupModelWithData(page) {
  await loadExplorer(page);
  await createModelWithSource(page, 'local-sqlite');
  await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
  await runQuery(page);
  await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });
}

test.describe('Save Modal — Computed Column Objects', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Step 1: Metric computed column appears as pill in save modal', async ({ page }) => {
    await setupModelWithData(page);

    const added = await addComputedColumn(page, 'total_x', 'SUM(x)');
    expect(added).toBe(true);

    // Open save modal
    await page.getByRole('button', { name: 'Save to Project' }).click();

    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible();

    // Metric pill should be visible in the modal
    await expect(modal.getByText('total_x')).toBeVisible({ timeout: 3000 });
  });

  test('Step 2: Dimension computed column appears as pill in save modal', async ({ page }) => {
    await setupModelWithData(page);

    const added = await addComputedColumn(page, 'x_label', 'CAST(x AS VARCHAR)');
    expect(added).toBe(true);

    await page.getByRole('button', { name: 'Save to Project' }).click();

    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible();

    // Dimension pill should be visible in the modal
    await expect(modal.getByText('x_label')).toBeVisible({ timeout: 3000 });
  });

  test('Step 3: Both metric and dimension computed columns shown in save modal', async ({
    page,
  }) => {
    await setupModelWithData(page);

    await addComputedColumn(page, 'total_x', 'SUM(x)');
    await addComputedColumn(page, 'x_label', 'CAST(x AS VARCHAR)');

    await page.getByRole('button', { name: 'Save to Project' }).click();

    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible();

    // Both pills should be visible
    await expect(modal.getByText('total_x')).toBeVisible({ timeout: 3000 });
    await expect(modal.getByText('x_label')).toBeVisible({ timeout: 3000 });
  });

  test('Step 4: Save modal shows model, insight, and computed columns together', async ({
    page,
  }) => {
    await setupModelWithData(page);

    // Add computed column
    await addComputedColumn(page, 'total_x', 'SUM(x)');

    // Auto-created insight already exists from first visit

    // Open save modal
    await page.getByRole('button', { name: 'Save to Project' }).click();

    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible();

    // "New" section should be visible
    const newSection = modal.locator('text=New').first();
    await expect(newSection).toBeVisible();

    // Computed column pill should be visible
    await expect(modal.getByText('total_x')).toBeVisible({ timeout: 3000 });
  });

  test('Step 5: Removed computed column does not appear in save modal', async ({ page }) => {
    await setupModelWithData(page);

    await addComputedColumn(page, 'total_x', 'SUM(x)');

    // Remove the computed column via pill × button in toolbar
    const pill = page.locator('[data-testid="computed-pill-total_x"]');
    await expect(pill).toBeVisible({ timeout: 3000 });
    const removeBtn = pill.locator('[data-testid="pill-remove"]');
    await removeBtn.click();

    // Open save modal
    await page.getByRole('button', { name: 'Save to Project' }).click();

    const modal = page.locator('[data-testid="explorer-save-modal"]');
    await expect(modal).toBeVisible();

    // Removed column should NOT be in the modal
    await expect(modal.getByText('total_x')).not.toBeVisible({ timeout: 2000 });
  });

  test('Step 6: Save button enabled when computed column added (model is modified)', async ({
    page,
  }) => {
    await setupModelWithData(page);

    // Before adding computed column, save might already be enabled due to new model
    // The key assertion: after adding a computed column, save is definitely enabled
    await addComputedColumn(page, 'total_x', 'SUM(x)');

    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled();
  });
});
