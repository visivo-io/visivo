/**
 * Story Group 1: SQL Execution
 *
 * US-1: Select source and run a basic query
 * US-2: SQL syntax error shows error state
 * US-3: Fix SQL error and re-run successfully
 * US-3B: Run query, change source, re-run with new source
 * US-3C: Run query on tab A, switch to tab B, switch back — results persist
 * US-4: Run with no source selected shows warning
 * US-4B: Select source then deselect — Run re-disables
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

test.describe('Explorer SQL Execution', () => {
  test.setTimeout(60000);

  test('US-1: Select source and run a basic query', async ({ page }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');

    await typeSql(page, 'SELECT * FROM test_table');
    await runQuery(page);

    // Data table should appear with rows
    await expect(page.getByText('Run a query to see results')).not.toBeVisible({ timeout: 10000 });
    // Row count should be visible (some number of rows)
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 10000 });
  });

  test('US-2: SQL syntax error shows error state', async ({ page }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');

    await typeSql(page, 'SELECTT * FROMM bad_table');
    await runQuery(page);

    // Error message should appear
    await expect(page.locator('[data-testid="query-error"]')).toBeVisible({ timeout: 10000 });
  });

  test('US-3: Fix SQL error and re-run successfully', async ({ page }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');

    // First: cause an error
    await typeSql(page, 'SELECT * FROM nonexistent_table_xyz');
    await runQuery(page);
    await expect(page.locator('[data-testid="query-error"]')).toBeVisible({ timeout: 10000 });

    // Fix: type valid SQL
    await typeSql(page, 'SELECT 1 as x, 2 as y');
    await runQuery(page);

    // Error should be gone, data visible
    await expect(page.locator('[data-testid="query-error"]')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 10000 });
  });

  test('US-3C: Run query on tab A, switch to tab B (no query), switch back — results persist', async ({ page }) => {
    await loadExplorer(page);

    // Tab A: the auto-created "model" tab already exists; create a new one via helper
    // createModelWithSource clicks "Add model" creating "model_2" as tab A
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT 1 as val');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 10000 });

    // Tab B: create another (empty) — this becomes "model_3"
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Should show empty state on tab B
    await expect(page.getByText('Run a query to see results')).toBeVisible({ timeout: 5000 });

    // Switch back to tab A ("model_2") via its tab
    await page.locator('[data-testid="model-tab-model_2"]').click();
    await page.waitForTimeout(1000);

    // Data should still be visible from tab A's query
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 5000 });
  });

  test('US-4: New model tab auto-selects default source — Run is enabled', async ({ page }) => {
    await loadExplorer(page);

    // Create tab — source should auto-select (project default or first available)
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Run button should be ENABLED (source was auto-selected)
    const runButton = page.getByRole('button', { name: 'Run' });
    await expect(runButton).toBeEnabled({ timeout: 5000 });

    // "No source selected" warning should NOT be visible
    await expect(page.getByText('No source selected')).not.toBeVisible();
  });

  test('US-4B: Deselect source — Run disables, reselect — Run re-enables', async ({ page }) => {
    await loadExplorer(page);
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Source is auto-selected, Run is enabled
    const runButton = page.getByRole('button', { name: 'Run' });
    await expect(runButton).toBeEnabled({ timeout: 3000 });

    // Deselect source — Run disables
    const sourceSelect = page.locator('select');
    await sourceSelect.first().selectOption('');
    await page.waitForTimeout(300);
    await expect(runButton).toBeDisabled({ timeout: 3000 });

    // Reselect source — Run re-enables
    await sourceSelect.first().selectOption('local-sqlite');
    await page.waitForTimeout(300);
    await expect(runButton).toBeEnabled({ timeout: 3000 });
  });
});
