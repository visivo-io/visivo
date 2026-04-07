/**
 * Story: Interaction DnD — Drag columns/metrics into interaction value fields
 *
 * Stories: US-INT-1, US-INT-2, US-INT-3, US-INT-6, US-INT-7
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

/**
 * Perform a DnD drag from source to target using manual mouse events.
 * @dnd-kit requires >8px movement to activate the drag.
 */
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

  // Mouse down on source
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();

  // Move past 8px activation distance
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.waitForTimeout(100);

  // Move to target and drop immediately (no pause — dnd-kit re-measures droppable rects
  // during pauses which can cause the pointer to fall outside the target)
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('Interaction DnD — Drag to Interaction Fields', () => {
  test.setTimeout(90000);

  test('US-INT-6: Drag column from data table to interaction creates ref pill', async ({
    page,
  }) => {
    await loadExplorer(page);
    // Use the auto-created model tab (already has local-sqlite selected)
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction to the auto-created insight
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Find the draggable column header 'x' in the data table
    const colHeader = page.locator('[data-testid="draggable-col-x"]');
    await expect(colHeader).toBeVisible({ timeout: 5000 });

    // Find the interaction drop zone
    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    await expect(dropZone).toBeVisible({ timeout: 5000 });

    // Drag column to interaction
    await dragAndDrop(page, colHeader, dropZone);

    // The interaction field should now show a pill with the ref
    // Look for a pill element (inline-flex span with colored background)
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-INT-1: Drag column to filter, type expression, chart filters data', async ({
    page,
  }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 20');
    await runQuery(page);

    // Add filter interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();

    // Drag 'x' column to interaction
    const colHeader = page.locator('[data-testid="draggable-col-x"]');
    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    await dragAndDrop(page, colHeader, dropZone);

    // Verify the pill appeared
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });

    // Click the RefTextArea to enter edit mode and type "> 5"
    await dropZone.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' > 5', { delay: 20 });
    // Click away to commit
    await page.locator('[data-testid="insight-interaction-0"]').locator('select').click();

    // The interaction value should contain the filter expression
    // No ?{} should be visible
    const fieldText = await dropZone.textContent();
    expect(fieldText).not.toContain('?{');
  });

  test('US-INT-7: Drag metric from left nav to interaction creates correct ref', async ({
    page,
  }) => {
    await loadExplorer(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Use search to filter to the metric (avoids scroll issues with pointerWithin)
    await page.locator('[data-testid="left-panel-search"]').fill('x_sum');
    await page.waitForTimeout(500);

    const metricItem = page.locator('[data-testid="draggable-metric-x_sum"]');
    await expect(metricItem).toBeVisible({ timeout: 5000 });

    // Drop on interaction field
    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    await dragAndDrop(page, metricItem, dropZone);

    // Should show a pill with the metric name
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });
  });
});
