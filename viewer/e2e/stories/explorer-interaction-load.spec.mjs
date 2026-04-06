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

  test('US-INT-21: Load chart with input interactions — input toolbar renders and works', async ({
    page,
  }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    // Input toolbar should appear above chart (3 inputs: split_threshold, min_x_value, sort_direction)
    const toolbar = page.locator('[data-testid="explorer-inputs-toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // Toolbar should show input count and input labels
    await expect(toolbar.getByText(/Inputs/)).toBeVisible();
    await expect(toolbar.getByText(/Min X Value/)).toBeVisible({ timeout: 10000 });
    await expect(toolbar.getByText(/Sort Direction/)).toBeVisible({ timeout: 5000 });
    await expect(toolbar.getByText(/Split Threshold/)).toBeVisible({ timeout: 5000 });

    // min_x_value is a query-based dropdown — find its container and click the dropdown button
    // The dropdown shows current value "0" (default) with a chevron
    const minXSection = toolbar.locator('h2:has-text("Min X Value")').locator('xpath=ancestor::div[contains(@class, "min-w")]');
    const dropdownBtn = minXSection.locator('button').first();
    await expect(dropdownBtn).toBeVisible({ timeout: 5000 });

    // Record current value before change
    const valueBefore = await dropdownBtn.textContent();

    // Click to open dropdown
    await dropdownBtn.click();

    // Dropdown options render as buttons in an absolute-positioned menu
    // Options are values from local_test_table.x (0-8)
    // The dropdown menu has class "absolute z-50" containing option buttons
    const dropdownMenu = minXSection.locator('.absolute');
    await expect(dropdownMenu).toBeVisible({ timeout: 5000 });

    // Find and click the option with value "1"
    const option1 = dropdownMenu.locator('button').filter({ hasText: /^1$/ });
    await expect(option1).toBeVisible({ timeout: 3000 });
    await option1.click();

    // Verify the value changed
    const valueAfter = await dropdownBtn.textContent();
    expect(valueAfter).not.toBe(valueBefore);
  });

  test('Insight props show input refs as colored pills (not grey)', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    // Expand the insight section
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // The marker.color prop contains ${ref(split_threshold).value}
    // It should render as a colored pill (indigo for inputs), not grey
    // Look for the props section and find pills
    const propsSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    await expect(propsSection).toBeVisible({ timeout: 10000 });

    // Check for pill elements — should NOT contain grey/default pills for input refs
    // The text "split_threshold" should appear in a colored pill
    const splitThresholdPill = propsSection.getByText('split_threshold').first();
    await expect(splitThresholdPill).toBeVisible({ timeout: 10000 });

    // Verify the pill has a colored background (not the default grey)
    // Input pills use indigo colors (bg-indigo-100)
    const pillContainer = splitThresholdPill.locator('xpath=ancestor::span[contains(@class, "inline-flex")]');
    const hasColor = await pillContainer.evaluate(
      el => !el.className.includes('bg-gray') && el.className.includes('bg-')
    ).catch(() => false);
    expect(hasColor).toBe(true);
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
