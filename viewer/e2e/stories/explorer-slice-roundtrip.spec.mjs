/**
 * Slice round-trip across explorer state (B13 follow-up).
 *
 * Verifies that a slice authored via the chip+badge UI survives
 * subsequent edits to the chip body, and that switching slice
 * options keeps the chip body intact. Uses the realistic flow:
 *
 *   1. Drop a metric onto an indicator's `value` (auto-applies [0]).
 *   2. Confirm badge labelled "First (0)".
 *   3. Switch to "Last (-1)" via the menu.
 *   4. Confirm badge updates without losing the chip body.
 *   5. Switch back to "First (0)" — round-trip survives in both
 *      directions.
 *
 * Precondition: sandbox running on :3001/:8001.
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

test.describe('Slice round-trip (B13)', () => {
  test.setTimeout(90000);

  test('slice changes preserve the chip body across switches', async ({ page }) => {
    await loadExplorer(page);
    await page.locator('[data-testid="insight-type-select-insight"]').selectOption('indicator');

    const valueDrop = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueDrop).toBeVisible({ timeout: 5000 });
    const metricSource = page.locator('[data-testid^="draggable-metric-"]').first();
    await expect(metricSource).toBeVisible({ timeout: 5000 });
    await dragAndDrop(page, metricSource, valueDrop);

    // Capture the chip body text — what's inside the contenteditable
    // area, excluding the slice badge label.
    const editor = valueDrop.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 3000 });
    const bodyAfterDrop = await editor.textContent();

    // Dismiss the banner via "First (0)" so the badge appears.
    await page.locator('[data-testid="slice-banner-first"]').click();
    const badge = page.locator('[data-testid="slice-badge"]');
    await expect(badge).toContainText('First (0)');

    // Switch to Last (-1) — chip body unchanged.
    await badge.click();
    await page.locator('[data-testid="slice-option-last"]').click();
    await expect(badge).toContainText('Last (-1)');
    expect(await editor.textContent()).toBe(bodyAfterDrop);

    // Switch back to First (0) — body still unchanged.
    await badge.click();
    await page.locator('[data-testid="slice-option-first"]').click();
    await expect(badge).toContainText('First (0)');
    expect(await editor.textContent()).toBe(bodyAfterDrop);
  });

  test('chip body has no bracket characters at any point', async ({ page }) => {
    await loadExplorer(page);
    await page.locator('[data-testid="insight-type-select-insight"]').selectOption('indicator');
    const valueDrop = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueDrop).toBeVisible({ timeout: 5000 });
    const metricSource = page.locator('[data-testid^="draggable-metric-"]').first();
    await dragAndDrop(page, metricSource, valueDrop);

    // Banner present; brackets must not have leaked into the chip body.
    const editor = valueDrop.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 3000 });
    let body = await editor.textContent();
    expect(body).not.toContain('[');
    expect(body).not.toContain(']');

    // After committing First (0), still no brackets in the chip body
    // (they live in the badge label, which is a sibling element).
    await page.locator('[data-testid="slice-banner-first"]').click();
    body = await editor.textContent();
    expect(body).not.toContain('[');
    expect(body).not.toContain(']');
  });
});
