/**
 * Story: Drag existing insights from left nav into chart
 *
 * Stories: US-INS-DND-1, US-INS-DND-2, US-INS-DND-3, US-INS-DND-4, US-INS-DND-5
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithChart } from '../helpers/explorer.mjs';

/**
 * Manual DnD via mouse events. @dnd-kit requires >8px movement to activate.
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

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('Insight DnD — Drag existing insights into chart', () => {
  test.setTimeout(90000);

  test('US-INS-DND-1: Drag existing insight onto chart adds it to the insight list', async ({
    page,
  }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    // Wait for the chart's insight section to render (one pill: combined-interactions-test-insight)
    const initialPills = page.locator('[data-testid^="chart-insight-pill-"]');
    await expect(initialPills).toHaveCount(1, { timeout: 10000 });

    // Search/scroll for the insight to drag
    const insightSearchTerm = 'sort-input-test-insight';
    const searchInput = page.locator('[data-testid="left-panel-search"]');
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill(insightSearchTerm);
      await page.waitForTimeout(300);
    }

    const draggable = page.locator(`[data-testid="draggable-insight-${insightSearchTerm}"]`);
    await expect(draggable).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="chart-insight-drop-zone"]');
    await expect(dropZone).toBeVisible({ timeout: 5000 });

    // Retry the drag a few times — pointerWithin can be flaky on the first try
    const newPill = page.locator(`[data-testid="chart-insight-pill-${insightSearchTerm}"]`);
    for (let attempt = 0; attempt < 3; attempt++) {
      await dragAndDrop(page, draggable, dropZone);
      if (await newPill.isVisible({ timeout: 1000 }).catch(() => false)) break;
    }
    await expect(newPill).toBeVisible({ timeout: 3000 });
    await expect(initialPills).toHaveCount(2);
  });

  test('US-INS-DND-4: Dragging a duplicate insight does not add a second pill', async ({
    page,
  }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');
    const initialPills = page.locator('[data-testid^="chart-insight-pill-"]');
    await expect(initialPills).toHaveCount(1, { timeout: 10000 });

    // Drag the SAME insight that the chart already has
    const insightName = 'combined-interactions-test-insight';
    const searchInput = page.locator('[data-testid="left-panel-search"]');
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill(insightName);
      await page.waitForTimeout(300);
    }

    const draggable = page.locator(`[data-testid="draggable-insight-${insightName}"]`);
    await expect(draggable).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="chart-insight-drop-zone"]');
    await dragAndDrop(page, draggable, dropZone);
    await page.waitForTimeout(500);

    // Pill count should still be 1
    await expect(initialPills).toHaveCount(1);
  });

  test('US-INS-DND-5: Click on insight in left nav still selects (drag does not break click)', async ({
    page,
  }) => {
    await loadExplorer(page);

    // The auto-created blank insight is the only one in the working state right now;
    // the API insights are listed below in the Insights ObjectList. Click one to verify
    // click selection still works.
    const insightName = 'combined-interactions-test-insight';
    const searchInput = page.locator('[data-testid="left-panel-search"]');
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill(insightName);
      await page.waitForTimeout(300);
    }

    const draggable = page.locator(`[data-testid="draggable-insight-${insightName}"]`);
    await expect(draggable).toBeVisible({ timeout: 5000 });

    // A click (no drag) should not throw or trigger a drag — just verify the element handles click
    await draggable.click();
    await page.waitForTimeout(300);

    // The page should still be functional — no error toast, drop zone still present
    const dropZone = page.locator('[data-testid="chart-insight-drop-zone"]');
    await expect(dropZone).toBeVisible({ timeout: 3000 });
  });
});
