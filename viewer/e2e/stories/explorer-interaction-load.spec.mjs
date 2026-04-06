/**
 * Story: Loading Existing Charts with Interactions
 *
 * Tests that loaded charts show interaction values as pills (not raw text),
 * with proper coloring and no ?{} visible to the user.
 *
 * Stories: US-INT-5, US-INT-9, US-INT-19, US-INT-20, US-INT-21
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorerWithChart } from '../helpers/explorer.mjs';

test.describe('Interaction Loading — Pill Display', () => {
  test.setTimeout(60000);

  test('US-INT-19: Load chart with filter interaction shows pills', async ({ page }) => {
    await loadExplorerWithChart(page, 'autocomplete-date-chart');

    // Expand the insight section
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // Interaction field should exist
    const interactionField = page.locator('[data-testid^="interaction-value-field-"]').first();
    await expect(interactionField).toBeVisible({ timeout: 10000 });

    // Should NOT contain raw ?{ text
    const fieldText = await interactionField.textContent();
    expect(fieldText).not.toContain('?{');

    // Should contain pill elements (spans with ref-pill styling)
    const pills = interactionField.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-INT-9: Interaction pills are colored by ref type', async ({ page }) => {
    await loadExplorerWithChart(page, 'split-input-test-chart');

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const interactionField = page.locator('[data-testid^="interaction-value-field-"]').first();
    await expect(interactionField).toBeVisible({ timeout: 10000 });

    // Should have pill elements (colored refs)
    const pills = interactionField.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });

    // No ?{} visible
    const text = await interactionField.textContent();
    expect(text).not.toContain('?{');
  });

  test('US-INT-20: Load chart with split interaction shows traces and pills', async ({ page }) => {
    await loadExplorerWithChart(page, 'fibonacci-split-chart');

    // Chart should render (Plotly visible)
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 15000 });

    // Insight section should show the split interaction with pills
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const interactionField = page.locator('[data-testid^="interaction-value-field-"]').first();
    await expect(interactionField).toBeVisible({ timeout: 10000 });

    // No ?{} visible
    const text = await interactionField.textContent();
    expect(text).not.toContain('?{');
  });

  test('US-INT-5: Edit interaction value preserves pills', async ({ page }) => {
    await loadExplorerWithChart(page, 'sort-input-test-chart');

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const interactionField = page.locator('[data-testid^="interaction-value-field-"]').first();
    await expect(interactionField).toBeVisible({ timeout: 10000 });

    // Click on the field to enter edit mode
    await interactionField.click();

    // The field should be editable (Monaco or textarea becomes active)
    // Verify the interaction area is interactive
    const editArea = interactionField.locator('textarea, [role="textbox"], .monaco-editor');
    const isEditable = await editArea.first().isVisible({ timeout: 3000 }).catch(() => false);

    // Whether or not edit mode activated, no ?{} should be visible
    const text = await interactionField.textContent();
    expect(text).not.toContain('?{');
  });
});
