/**
 * Story: Initial Layout — Right Panel Ordering and Auto-Created Insight
 *
 * Bug: ExplorerRightPanel renders insights ABOVE the chart section. The correct
 * order is chart section at top (it's the container), insights below (showing
 * hierarchy). Also, no insight is auto-created on first visit — the user should
 * see an open insight below the chart immediately.
 *
 * These tests document what SHOULD happen and will FAIL until the bug is fixed.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer } from '../helpers/explorer.mjs';

test.describe('Initial Layout — Right Panel Ordering', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });
  });

  test('Step 1: Chart section appears above insight sections on first visit', async ({
    page,
  }) => {
    await loadExplorer(page);

    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    const insightSections = page.locator('[data-testid^="insight-crud-section-"]');

    await expect(chartSection).toBeVisible({ timeout: 5000 });

    // If there are insight sections, chart should be above them
    const insightCount = await insightSections.count();
    if (insightCount > 0) {
      const chartBox = await chartSection.boundingBox();
      const insightBox = await insightSections.first().boundingBox();

      expect(chartBox).not.toBeNull();
      expect(insightBox).not.toBeNull();

      // Chart's top Y should be less than (above) insight's top Y
      expect(chartBox.y).toBeLessThan(insightBox.y);
    }
  });

  test('Step 2: An insight is auto-created on first visit', async ({ page }) => {
    await loadExplorer(page);

    // An insight section should be visible immediately without clicking "Add Insight"
    const insightSections = page.locator('[data-testid^="insight-crud-section-"]');
    await expect(insightSections.first()).toBeVisible({ timeout: 5000 });
  });

  test('Step 3: Auto-created insight appears below chart section', async ({ page }) => {
    await loadExplorer(page);

    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    const insightSections = page.locator('[data-testid^="insight-crud-section-"]');

    await expect(chartSection).toBeVisible({ timeout: 5000 });
    await expect(insightSections.first()).toBeVisible({ timeout: 5000 });

    const chartBox = await chartSection.boundingBox();
    const insightBox = await insightSections.first().boundingBox();

    expect(chartBox).not.toBeNull();
    expect(insightBox).not.toBeNull();
    expect(chartBox.y).toBeLessThan(insightBox.y);
  });

  test('Step 4: Auto-created insight is expanded by default', async ({ page }) => {
    await loadExplorer(page);

    // The auto-created insight should be expanded (type select visible)
    const typeSelect = page.locator('[data-testid^="insight-type-select-"]');
    await expect(typeSelect.first()).toBeVisible({ timeout: 5000 });
  });

  test('Step 5: Add Insight button is below existing insights', async ({ page }) => {
    await loadExplorer(page);

    const addInsightBtn = page.locator('[data-testid="right-panel-add-insight"]');
    await expect(addInsightBtn).toBeVisible({ timeout: 5000 });

    // If there's an auto-created insight, the button should be below it
    const insightSections = page.locator('[data-testid^="insight-crud-section-"]');
    const insightCount = await insightSections.count();

    if (insightCount > 0) {
      const lastInsightBox = await insightSections.last().boundingBox();
      const addBtnBox = await addInsightBtn.boundingBox();

      expect(lastInsightBox).not.toBeNull();
      expect(addBtnBox).not.toBeNull();

      // Add button should be below the last insight
      expect(addBtnBox.y).toBeGreaterThan(lastInsightBox.y);
    }

    // Add Insight button should also be below chart section
    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    const chartBox = await chartSection.boundingBox();
    const addBtnBox = await addInsightBtn.boundingBox();

    expect(chartBox).not.toBeNull();
    expect(addBtnBox).not.toBeNull();
    expect(addBtnBox.y).toBeGreaterThan(chartBox.y);
  });

  test('Step 6: First visit has save enabled due to auto-created insight', async ({ page }) => {
    await loadExplorer(page);

    // Auto-created insight has isNew=true, which means hasModifications should be true
    const saveBtn = page.locator('[data-testid="explorer-save-button"]');
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
  });

  test('Step 7: Adding second insight places it below first, both below chart', async ({
    page,
  }) => {
    await loadExplorer(page);

    // There should already be one auto-created insight
    const insightsBefore = page.locator('[data-testid^="insight-crud-section-"]');
    await expect(insightsBefore.first()).toBeVisible({ timeout: 5000 });

    // Add a second insight
    await page.getByRole('button', { name: 'Add Insight' }).first().click();
    await page.waitForTimeout(500);

    // Now there should be two insight sections
    const insightsAfter = page.locator('[data-testid^="insight-crud-section-"]');
    expect(await insightsAfter.count()).toBeGreaterThanOrEqual(2);

    // Both should be below the chart section
    const chartSection = page.locator('[data-testid="chart-crud-section"]');
    const chartBox = await chartSection.boundingBox();

    for (let i = 0; i < (await insightsAfter.count()); i++) {
      const insightBox = await insightsAfter.nth(i).boundingBox();
      expect(chartBox).not.toBeNull();
      expect(insightBox).not.toBeNull();
      expect(chartBox.y).toBeLessThan(insightBox.y);
    }
  });

  test('Step 8: Chart header says "Chart: Untitled" with insight below', async ({ page }) => {
    await loadExplorer(page);

    // Chart header should show "Chart: Untitled"
    const chartHeader = page.locator('[data-testid="chart-header"]');
    await expect(chartHeader).toBeVisible({ timeout: 5000 });
    await expect(chartHeader).toContainText('Chart: Untitled');

    // Insight section should exist below the chart
    const insightSections = page.locator('[data-testid^="insight-crud-section-"]');
    await expect(insightSections.first()).toBeVisible({ timeout: 5000 });

    const chartBox = await chartHeader.boundingBox();
    const insightBox = await insightSections.first().boundingBox();

    expect(chartBox).not.toBeNull();
    expect(insightBox).not.toBeNull();
    expect(chartBox.y).toBeLessThan(insightBox.y);
  });
});
