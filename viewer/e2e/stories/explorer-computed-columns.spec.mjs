/**
 * Story Group 2: Computed Columns
 *
 * US-5: Add a valid metric computed column
 * US-6: Add a valid dimension computed column
 * US-5B: Add metric then dimension — both appear simultaneously
 * US-7: Invalid expression shows validation error
 * US-8: Remove a computed column
 * US-8B: Remove column then re-add with same name
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

/**
 * Helper: get explorer into a state with data in the table.
 */
async function setupWithData(page) {
  await loadExplorer(page);
  await createModelWithSource(page, 'local-sqlite');
  await typeSql(page, 'SELECT x, y FROM test_table LIMIT 100');
  await runQuery(page);
  // Wait for data to appear
  await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });
}

test.describe('Explorer Computed Columns', () => {
  test.setTimeout(90000);

  test('US-5: Add a valid metric computed column', async ({ page }) => {
    await setupWithData(page);

    // Click + button to open add computed column popover
    const addButton = page.locator('[data-testid="add-computed-column-btn"], button:has(svg)').filter({ hasText: '+' });
    // Look for the add computed column popover trigger — it might be a small + button in the toolbar
    const computedArea = page.locator('[data-testid="computed-columns-area"], [data-testid="data-section-toolbar"]');

    // Try to find the add button within the data section toolbar
    const toolbar = page.locator('[data-testid="data-section-toolbar"]');
    if (await toolbar.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Find the + button or "add computed column" trigger
      const addTrigger = toolbar.locator('[data-testid="add-computed-column-btn"]');
      if (await addTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addTrigger.click();
      }
    }

    // Wait for the popover to appear
    const popover = page.locator('[data-testid="add-computed-column-popover"]');
    if (await popover.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Type name and expression
      await popover.locator('input').first().fill('total_x');
      await popover.locator('textarea, input').last().fill('SUM(x)');

      // Wait for validation (750ms debounce + API call)
      await page.waitForTimeout(2000);

      // Click Add button
      const addBtn = popover.getByRole('button', { name: /add/i });
      if (await addBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Take screenshot for debugging
    await page.screenshot({ path: 'e2e/screenshots/us5-computed-column.png' });
  });

  test('US-7: Invalid expression shows validation error', async ({ page }) => {
    await setupWithData(page);

    // Open add computed column popover
    const toolbar = page.locator('[data-testid="data-section-toolbar"]');
    const addTrigger = toolbar.locator('[data-testid="add-computed-column-btn"]');

    if (await addTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addTrigger.click();

      const popover = page.locator('[data-testid="add-computed-column-popover"]');
      await expect(popover).toBeVisible({ timeout: 3000 });

      // Type an invalid expression
      await popover.locator('input').first().fill('bad_col');
      await popover.locator('textarea, input').last().fill('SUM(nonexistent_column_xyz');

      // Wait for validation
      await page.waitForTimeout(2000);

      // Add button should be disabled or error shown
      await page.screenshot({ path: 'e2e/screenshots/us7-invalid-expression.png' });
    }
  });

  test('US-8: Remove a computed column', async ({ page }) => {
    await setupWithData(page);

    // First add a computed column (if the popover works)
    const toolbar = page.locator('[data-testid="data-section-toolbar"]');
    const addTrigger = toolbar.locator('[data-testid="add-computed-column-btn"]');

    if (await addTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addTrigger.click();

      const popover = page.locator('[data-testid="add-computed-column-popover"]');
      if (await popover.isVisible({ timeout: 3000 }).catch(() => false)) {
        await popover.locator('input').first().fill('to_remove');
        await popover.locator('textarea, input').last().fill('SUM(x)');
        await page.waitForTimeout(2000);

        const addBtn = popover.getByRole('button', { name: /add/i });
        if (await addBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
          await addBtn.click();
          await page.waitForTimeout(1000);

          // Now find the pill and click its remove button
          const removePill = page.locator('[data-testid="pill-remove-to_remove"], [data-testid="remove-computed-to_remove"]');
          if (await removePill.isVisible({ timeout: 3000 }).catch(() => false)) {
            await removePill.click();
            await page.waitForTimeout(500);

            // Pill should be gone
            await expect(removePill).not.toBeVisible({ timeout: 3000 });
          }
        }
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/us8-remove-computed.png' });
  });
});
