/**
 * Indicator slice authoring (B13 follow-up).
 *
 * Verifies the chip-attached slice badge UX:
 *   - Drop a metric chip onto an indicator's `value` prop.
 *   - Educational SliceBanner appears (one-time, scalar-only slot).
 *   - Click "First (0)" — banner dismisses, SliceBadge labelled
 *     "First (0)" appears next to the chip.
 *   - Open menu via the badge — confirm "Rows…" and "All values" are
 *     disabled (scalar-only policy) with explanatory tooltips.
 *
 * Precondition: sandbox running on :3001/:8001 with the integration
 * project (8 models, 5 metrics).
 */

import { test, expect } from '@playwright/test';
import { loadExplorer } from '../helpers/explorer.mjs';

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

test.describe('Indicator slice authoring (B13)', () => {
  test.setTimeout(90000);

  test('drop → banner → First (0) → badge → menu policy', async ({ page }) => {
    await loadExplorer(page);

    // Switch the auto-created insight to an indicator.
    const typeSelect = page.locator('[data-testid="insight-type-select-insight"]');
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.selectOption('indicator');

    // Indicator's `value` prop is a droppable scalar slot.
    const valueDrop = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueDrop).toBeVisible({ timeout: 5000 });

    // Find any metric drag source and drop it onto value.
    const metricSource = page.locator('[data-testid^="draggable-metric-"]').first();
    await expect(metricSource).toBeVisible({ timeout: 5000 });
    await dragAndDrop(page, metricSource, valueDrop);

    // Educational banner appears one-time.
    const banner = page.locator('[data-testid="slice-banner"]');
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Click "First (0)" — banner dismisses, badge appears.
    await page.locator('[data-testid="slice-banner-first"]').click();
    await expect(banner).not.toBeVisible({ timeout: 3000 });

    const badge = page.locator('[data-testid="slice-badge"]');
    await expect(badge).toBeVisible({ timeout: 3000 });
    await expect(badge).toContainText('First (0)');

    // Open the menu — verify scalar-only policy: Range/All disabled.
    await badge.click();
    await expect(page.locator('[data-testid="slice-menu"]')).toBeVisible({ timeout: 3000 });

    await expect(page.locator('[data-testid="slice-option-range"]')).toBeDisabled();
    await expect(page.locator('[data-testid="slice-option-all"]')).toBeDisabled();
    await expect(page.locator('[data-testid="slice-option-first"]')).not.toBeDisabled();
    await expect(page.locator('[data-testid="slice-option-last"]')).not.toBeDisabled();
  });

  test('badge label updates when user changes the slice', async ({ page }) => {
    await loadExplorer(page);
    await page.locator('[data-testid="insight-type-select-insight"]').selectOption('indicator');

    const valueDrop = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueDrop).toBeVisible({ timeout: 5000 });
    const metricSource = page.locator('[data-testid^="draggable-metric-"]').first();
    await dragAndDrop(page, metricSource, valueDrop);

    // Dismiss the banner via the First (0) quick action.
    await page.locator('[data-testid="slice-banner-first"]').click();
    const badge = page.locator('[data-testid="slice-badge"]');
    await expect(badge).toContainText('First (0)');

    // Switch to Last (-1).
    await badge.click();
    await page.locator('[data-testid="slice-option-last"]').click();
    await expect(badge).toContainText('Last (-1)');
  });
});
