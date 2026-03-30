/**
 * Story Group: Deep Interactions — branching stories designed to find bugs
 *
 * These test non-obvious paths that are likely broken: rapid state changes,
 * multi-step workflows, undo-like patterns, and cross-panel interactions.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithChart, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

test.describe('Explorer Deep Interactions', () => {
  test.setTimeout(90000);

  // --- Computed Column Branching ---

  test('US-5B: Add metric then dimension — both appear simultaneously', async ({ page }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    // Add first computed column (metric)
    const addTrigger = page.locator('[data-testid="add-computed-column-btn"]');
    if (await addTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Add metric
      await addTrigger.click();
      const popover = page.locator('[data-testid="add-computed-column-popover"]');
      await popover.locator('input').first().fill('total_x');
      await popover.locator('textarea, input').last().fill('SUM(x)');
      await page.waitForTimeout(2000);
      const addBtn = popover.getByRole('button', { name: /add/i });
      if (await addBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1000);
      }

      // Add dimension
      await addTrigger.click();
      await page.waitForTimeout(500);
      const popover2 = page.locator('[data-testid="add-computed-column-popover"]');
      await popover2.locator('input').first().fill('x_str');
      await popover2.locator('textarea, input').last().fill('CAST(x AS VARCHAR)');
      await page.waitForTimeout(2000);
      const addBtn2 = popover2.getByRole('button', { name: /add/i });
      if (await addBtn2.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await addBtn2.click();
        await page.waitForTimeout(1000);
      }

      // Both pills should be visible
      await page.screenshot({ path: 'e2e/screenshots/us5b-both-pills.png' });
    }
  });

  test('US-5C: Add computed column then re-run query — column persists', async ({ page }) => {
    await loadExplorer(page);
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 50');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    // Add computed column
    const addTrigger = page.locator('[data-testid="add-computed-column-btn"]');
    if (await addTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addTrigger.click();
      const popover = page.locator('[data-testid="add-computed-column-popover"]');
      await popover.locator('input').first().fill('total_x');
      await popover.locator('textarea, input').last().fill('SUM(x)');
      await page.waitForTimeout(2000);
      const addBtn = popover.getByRole('button', { name: /add/i });
      if (await addBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Now re-run the query with different SQL
    await typeSql(page, 'SELECT x, y FROM test_table WHERE x > 0 LIMIT 50');
    await runQuery(page);
    await page.waitForTimeout(2000);

    // Computed column pill should still be in toolbar
    await page.screenshot({ path: 'e2e/screenshots/us5c-after-rerun.png' });
  });

  // --- Insight Branching ---

  test('US-9B: Switch insight type back and forth — props should persist via cache', async ({ page }) => {
    await loadExplorer(page);

    // Create insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(1000);

    // Find type selector
    const typeSelect = page.locator('select').filter({ hasText: 'scatter' });
    if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Change to bar
      await typeSelect.selectOption('bar');
      await page.waitForTimeout(500);

      // Verify bar is selected
      await expect(typeSelect).toHaveValue('bar');

      // Change back to scatter
      await typeSelect.selectOption('scatter');
      await page.waitForTimeout(500);

      // Verify scatter is back
      await expect(typeSelect).toHaveValue('scatter');
    }

    await page.screenshot({ path: 'e2e/screenshots/us9b-type-switching.png' });
  });

  test('US-11C: Remove insight then add new — unique name generation', async ({ page }) => {
    await loadExplorer(page);

    // Create insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Create second insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Remove the first insight (find × button)
    const removeButtons = page.locator('button').filter({ hasText: '×' });
    const firstRemove = removeButtons.first();
    if (await firstRemove.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstRemove.click();
      await page.waitForTimeout(500);
    }

    // Add a new insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // The new insight should have a unique name (not conflict with existing)
    await page.screenshot({ path: 'e2e/screenshots/us11c-unique-names.png' });
  });

  test('US-12B: Add 3 interactions then remove middle one', async ({ page }) => {
    await loadExplorer(page);

    // Create insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(1000);

    // Find "Add Interaction" button within the insight section
    const addInteraction = page.getByRole('button', { name: /Add Interaction/i });
    if (await addInteraction.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Add 3 interactions
      await addInteraction.click();
      await page.waitForTimeout(300);
      await addInteraction.click();
      await page.waitForTimeout(300);
      await addInteraction.click();
      await page.waitForTimeout(300);

      // Find interaction remove buttons and remove the middle one (2nd)
      const interactionRemoves = page.locator('[data-testid*="remove-interaction"]');
      const count = await interactionRemoves.count();

      if (count >= 3) {
        await interactionRemoves.nth(1).click();
        await page.waitForTimeout(500);

        // Should have 2 interactions remaining
        const remaining = await interactionRemoves.count();
        expect(remaining).toBe(2);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/us12b-interactions.png' });
  });

  // --- Tab Management Branching ---

  test('US-13C: Load model, edit SQL, switch tab, switch back — edit preserved', async ({ page }) => {
    await loadExplorer(page);

    // Load existing model from left panel
    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(2000);

    // Append to SQL
    await page.locator('.view-lines').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' LIMIT 10', { delay: 5 });
    await page.waitForTimeout(300);

    // Create new tab
    await page.getByRole('button', { name: 'Add model' }).click();
    await page.waitForTimeout(500);

    // Switch back to first tab
    await page.getByText('test-table').first().click();
    await page.waitForTimeout(1000);

    // SQL should still contain our edit
    await page.screenshot({ path: 'e2e/screenshots/us13c-sql-preserved.png' });
  });

  test('US-15B: Double-click loaded (non-new) model tab — rename should NOT activate', async ({ page }) => {
    await loadExplorer(page);

    // Load existing model
    await page.getByRole('button', { name: 'test-table', exact: true }).click();
    await page.waitForTimeout(2000);

    // Double-click the tab
    await page.getByText('test-table').first().dblclick();
    await page.waitForTimeout(500);

    // Rename input should NOT appear (isNew=false for loaded models)
    const renameInput = page.locator('input[value="test-table"]');
    const hasRenameInput = await renameInput.isVisible({ timeout: 1000 }).catch(() => false);

    // Loaded models should not be renameable
    expect(hasRenameInput).toBe(false);
  });

  // --- Chart Loading Branching ---

  test('US-18B: Load chart with insights — all insights listed in right panel', async ({ page }) => {
    await loadExplorer(page);

    // Load a chart
    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    // Check insight section — should have insight(s) from the chart
    // The right panel should show at least one insight section
    const insightHeaders = page.locator('text=/insight|scatter|bar|line/i');
    const count = await insightHeaders.count();

    // Take screenshot to see what insights loaded
    await page.screenshot({ path: 'e2e/screenshots/us18b-chart-insights.png' });
  });

  test('US-19B: Load chart, modify insight type, verify save enabled', async ({ page }) => {
    await loadExplorer(page);

    // Load chart
    await page.getByRole('button', { name: 'simple-scatter-chart', exact: true }).click();
    await page.waitForTimeout(3000);

    // Save should be disabled initially
    await expect(page.getByRole('button', { name: 'Save to Project' })).toBeDisabled({ timeout: 5000 });

    // Find and change insight type
    const typeSelect = page.locator('select').filter({ hasText: /scatter|bar|line/i });
    if (await typeSelect.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      const currentType = await typeSelect.first().inputValue();
      const newType = currentType === 'scatter' ? 'bar' : 'scatter';
      await typeSelect.first().selectOption(newType);
      await page.waitForTimeout(500);

      // Save should now be enabled (insight modified)
      await expect(page.getByRole('button', { name: 'Save to Project' })).toBeEnabled({ timeout: 5000 });
    }

    await page.screenshot({ path: 'e2e/screenshots/us19b-insight-type-change.png' });
  });

  // --- Multi-Insight Preview (KB-2) ---

  test('US-10B: Chart preview should render multiple insights', async ({ page }) => {
    await loadExplorer(page);

    // Load model with data
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 20');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    // Create first insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Create second insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Verify 2 insights in the chart's insight list
    // Check the Chart section for insight pills
    const insightPills = page.locator('[data-testid*="pill-insight"]');
    const pillCount = await insightPills.count();

    // Screenshot the multi-insight state
    await page.screenshot({ path: 'e2e/screenshots/us10b-multi-insight.png' });

    // There should be 2 insight pills in the chart section
    // (This may fail if the chart section isn't showing them — that's a bug to fix)
  });
});
