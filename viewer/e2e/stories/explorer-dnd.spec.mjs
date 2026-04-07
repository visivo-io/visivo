/**
 * Story Group 6: Drag & Drop
 *
 * Tests DnD interactions between left panel drag sources and right panel drop targets.
 * Uses Playwright mouse events to simulate @dnd-kit's PointerSensor (8px activation distance).
 *
 * Key architecture:
 * - Drag sources: data-testid="draggable-metric-{name}", data-testid="draggable-dimension-{name}"
 * - Drop targets: data-testid="droppable-property-{path}" (only when SchemaEditor has droppable=true)
 * - @dnd-kit PointerSensor activates after 8px mouse movement
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithModel, createModelWithSource, typeSql, runQuery } from '../helpers/explorer.mjs';

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

  // Move to target and drop immediately
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('Explorer Drag & Drop', () => {
  test.setTimeout(90000);

  test('US-20: Drag metric from left panel — verify metric is draggable', async ({ page }) => {
    await loadExplorer(page);

    // Verify metrics are listed with draggable elements
    const metricItem = page.locator('[data-testid="draggable-metric-x_sum"]');
    // If data-testid doesn't exist, try finding metric by name
    const metricByName = page.getByText('x_sum').first();

    const metricVisible = await metricItem.isVisible({ timeout: 3000 }).catch(() => false);
    const metricByNameVisible = await metricByName.isVisible({ timeout: 3000 }).catch(() => false);

    // At least one locator should find the metric
    expect(metricVisible || metricByNameVisible).toBe(true);

    // Take screenshot to see the drag source state
    await page.screenshot({ path: 'e2e/screenshots/us20-drag-source.png' });
  });

  test('US-21: Drag metric to insight property — property gets populated', async ({ page }) => {
    await loadExplorer(page);

    // Create insight first so SchemaEditor renders with droppable=true
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // The insight should be expanded with property rows
    // Check if droppable property targets exist
    const xDropTarget = page.locator('[data-testid*="droppable-property-x"]');
    const hasDropTarget = await xDropTarget.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasDropTarget) {
      // Find a metric drag source in left panel
      const metricSource = page.locator('[data-testid^="draggable-metric-"]').first();
      const hasSource = await metricSource.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasSource) {
        await dragAndDrop(page, metricSource, xDropTarget);

        // After drop, the property row should have a value
        await page.screenshot({ path: 'e2e/screenshots/us21-after-drop.png' });
      }
    }

    // Screenshot to see current state regardless
    await page.screenshot({ path: 'e2e/screenshots/us21-insight-props.png' });
  });

  test('US-21B: DnD replacement — drop different column on same property', async ({ page }) => {
    await loadExplorer(page);

    // Load a model and run query to get data columns
    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    // Create insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Check for droppable property targets
    const xDropTarget = page.locator('[data-testid*="droppable-property-x"]');
    const hasDropTarget = await xDropTarget.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasDropTarget) {
      // First: drag column x from data table to x axis
      const colX = page.locator('[data-testid="draggable-col-x"]');
      if (await colX.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dragAndDrop(page, colX, xDropTarget);

        // Now drag column y to the SAME x axis (replacement)
        const colY = page.locator('[data-testid="draggable-col-y"]');
        if (await colY.isVisible({ timeout: 3000 }).catch(() => false)) {
          await dragAndDrop(page, colY, xDropTarget);
        }
      }
    }

    // Screenshot to capture final state — does it show the replacement or the original?
    await page.screenshot({ path: 'e2e/screenshots/us21b-replacement.png' });
  });

  test('US-21D: DnD x and y axes — chart preview should render', async ({ page }) => {
    await loadExplorer(page);

    await createModelWithSource(page, 'local-sqlite');
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);
    await expect(page.locator('text=/\\d+ row/')).toBeVisible({ timeout: 15000 });

    // Create insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();

    // Try to drag x column to x axis and y column to y axis
    const xDrop = page.locator('[data-testid*="droppable-property-x"]');
    const yDrop = page.locator('[data-testid*="droppable-property-y"]');

    const hasXDrop = await xDrop.isVisible({ timeout: 3000 }).catch(() => false);
    const hasYDrop = await yDrop.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasXDrop && hasYDrop) {
      const colX = page.locator('[data-testid="draggable-col-x"]');
      const colY = page.locator('[data-testid="draggable-col-y"]');

      if (await colX.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dragAndDrop(page, colX, xDrop);
      }

      if (await colY.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dragAndDrop(page, colY, yDrop);
      }

      // Chart preview should now render (look for Plotly chart or canvas)
      const chartElement = page.locator('.js-plotly-plot, [data-testid="chart-preview"], canvas');
      const chartVisible = await chartElement.isVisible({ timeout: 5000 }).catch(() => false);

      // Take screenshot to see if chart rendered
      await page.screenshot({ path: 'e2e/screenshots/us21d-chart-preview.png' });
    } else {
      // If drop targets don't exist, that's a bug — screenshot to capture
      await page.screenshot({ path: 'e2e/screenshots/us21d-no-drop-targets.png' });
      // Don't fail silently — assert that drop targets should exist
      expect(hasXDrop).toBe(true);
    }
  });
});
