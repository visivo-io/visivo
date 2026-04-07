/**
 * Story: Input-Driven Interactions
 *
 * Tests dragging inputs from the left nav into interaction fields,
 * verifying default accessors (.value for single-select, .values for multi-select).
 *
 * Stories: US-INT-10, US-INT-11
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithChart } from '../helpers/explorer.mjs';

async function dragAndDrop(page, sourceLocator, targetLocator) {
  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error(`Cannot drag: source=${!!sourceBox}, target=${!!targetBox}`);
  }

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('Input-Driven Interactions', () => {
  test.setTimeout(90000);

  test('US-INT-10: Drag single-select input to interaction — default .value accessor', async ({
    page,
  }) => {
    await loadExplorer(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Use the search to filter to the input we want (avoids scrolling issues)
    await page.locator('[data-testid="left-panel-search"]').fill('sort_direction');
    await page.waitForTimeout(500);

    const inputItem = page.locator('[data-testid="draggable-input-sort_direction"]');
    await expect(inputItem).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    await dragAndDrop(page, inputItem, dropZone);

    // Should show a pill with the input name and .value accessor
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });

    // The pill text should contain the input name
    const pillText = await dropZone.textContent();
    expect(pillText).toContain('sort_direction');
    expect(pillText).toContain('.value');
  });

  test('US-INT-11: Drag multi-select input to interaction — default .values accessor', async ({
    page,
  }) => {
    await loadExplorer(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Use search to filter to the input
    await page.locator('[data-testid="left-panel-search"]').fill('selected_x');
    await page.waitForTimeout(500);

    const inputItem = page.locator('[data-testid="draggable-input-selected_x_values"]');
    await expect(inputItem).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    await dragAndDrop(page, inputItem, dropZone);

    // Should show a pill with the input name and .values accessor
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });

    // The pill text should contain the input name with .values
    const pillText = await dropZone.textContent();
    expect(pillText).toContain('selected_x_values');
    expect(pillText).toContain('.values');
  });

  test('US-INT-12: Click input pill accessor to change it', async ({ page }) => {
    await loadExplorerWithChart(page, 'checkboxes-filter-chart');

    // Expand the insight section
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // The interaction should have a pill for selected_x_values with .values accessor
    const interactionField = page.locator('[data-testid^="interaction-value-field-"]').first();
    await expect(interactionField).toBeVisible({ timeout: 10000 });

    // Find the clickable accessor text on the pill
    const accessorBtn = page.locator('[data-testid="accessor-selected_x_values"]');
    await expect(accessorBtn).toBeVisible({ timeout: 5000 });
    expect(await accessorBtn.textContent()).toBe('.values');

    // Click to open the accessor dropdown
    await accessorBtn.click();

    // Dropdown should appear with multi-select options
    const dropdown = page.locator('[data-testid="accessor-dropdown-selected_x_values"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Should have all multi-select accessor options
    await expect(page.locator('[data-testid="accessor-option-values"]')).toBeVisible();
    await expect(page.locator('[data-testid="accessor-option-first"]')).toBeVisible();
    await expect(page.locator('[data-testid="accessor-option-last"]')).toBeVisible();
    await expect(page.locator('[data-testid="accessor-option-min"]')).toBeVisible();
    await expect(page.locator('[data-testid="accessor-option-max"]')).toBeVisible();

    // Select .first
    await page.locator('[data-testid="accessor-option-first"]').click();

    // Accessor should now show .first
    await expect(accessorBtn).toHaveText('.first', { timeout: 3000 });

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();
  });
});
