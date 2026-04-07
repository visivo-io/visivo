/**
 * Story: Insight Props — Pill-Based Editing
 *
 * Stories: US-PROP-6
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Insight Props — Pill Display', () => {
  test.setTimeout(60000);

  test('US-PROP-6: Loaded chart shows prop values as pills, no ?{ visible', async ({ page }) => {
    await loadExplorerWithChart(page, 'simple-scatter-chart');

    // Expand insight section
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // Properties should be visible
    const propsSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    const propCountText = propsSection.locator('text=/\\d+ of \\d+ properties/').first();
    await expect(propCountText).toBeVisible({ timeout: 10000 });

    // Should have at least x and y props
    const count = parseInt((await propCountText.textContent()).match(/(\d+) of/)?.[1] || '0');
    expect(count).toBeGreaterThanOrEqual(2);

    // Props should show pills (inline-flex spans) not raw text
    const pills = propsSection.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });

    // No ?{ should be visible anywhere in the props section
    const propsText = await propsSection.textContent();
    expect(propsText).not.toContain('?{');
  });
});
