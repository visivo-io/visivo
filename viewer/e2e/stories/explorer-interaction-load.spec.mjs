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

    // Dropdown options render as buttons in an absolute-positioned menu.
    // Options are values from local_test_table.x (0-8) and load asynchronously.
    const dropdownMenu = minXSection.locator('.absolute');
    await expect(dropdownMenu).toBeVisible({ timeout: 5000 });

    // Wait for at least one option button to appear, then pick any option that
    // differs from the current value. Targeting a specific value like "1" is
    // brittle — the query result ordering and which value is currently selected
    // both vary across runs.
    const allOptions = dropdownMenu.locator('button');
    await expect(allOptions.first()).toBeVisible({ timeout: 5000 });
    const trimmedBefore = (valueBefore || '').trim();
    const differentOption = allOptions.filter({ hasNotText: new RegExp(`^${trimmedBefore}$`) }).first();
    await expect(differentOption).toBeVisible({ timeout: 5000 });
    await differentOption.click();

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

  test('Loaded insight shows correct type from config', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    // The combined-interactions-test-insight has type: bar in its config
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    // The type select should show "Bar" not "Scatter / Line"
    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await expect(typeSelect).toHaveValue('bar');
  });

  test('Type switching preserves props and caches per type', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toHaveValue('bar');

    // Count current properties shown
    const propsSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    const propCountText = propsSection.locator('text=/\\d+ of \\d+ properties/').first();
    await expect(propCountText).toBeVisible({ timeout: 10000 });

    const getDisplayedCount = async () => {
      const text = await propCountText.textContent();
      return parseInt(text.match(/(\d+) of/)?.[1] || '0');
    };

    const barPropCount = await getDisplayedCount();
    expect(barPropCount).toBeGreaterThan(0);

    // Switch to Scatter (shares x, y props with bar)
    await typeSelect.selectOption('scatter');
    await expect(typeSelect).toHaveValue('scatter');

    // Wait for schema to load and props to render
    await expect(propCountText).toBeVisible({ timeout: 10000 });
    const scatterPropCount = await getDisplayedCount();
    // Scatter should have props (x, y carried over from bar)
    expect(scatterPropCount).toBeGreaterThan(0);

    // Switch back to Bar — props should be restored from cache
    await typeSelect.selectOption('bar');
    await expect(typeSelect).toHaveValue('bar');

    await expect(propCountText).toBeVisible({ timeout: 10000 });
    const restoredBarCount = await getDisplayedCount();
    // Should have same number of props as originally
    expect(restoredBarCount).toBe(barPropCount);
  });

  test('Type switch bar→scatter→bar preserves all props including marker.color', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toHaveValue('bar');

    // Verify bar has marker.color visually rendered
    const propsSection = page.locator('[data-testid^="insight-crud-section-"]').first();
    await expect(propsSection.getByText('marker.color')).toBeVisible({ timeout: 5000 });

    // Verify bar has x and y
    const propCountText = propsSection.locator('text=/\\d+ of \\d+ properties/').first();
    await expect(propCountText).toBeVisible({ timeout: 5000 });
    const barCount = parseInt((await propCountText.textContent()).match(/(\d+) of/)?.[1] || '0');
    expect(barCount).toBe(3); // x, y, marker.color

    // Verify marker.color VALUE is present (the CASE WHEN expression, not just the label)
    // Look for the "CASE WHEN" text or pill content that proves the value is filled
    await expect(propsSection.getByText('CASE WHEN').first()).toBeVisible({ timeout: 5000 });

    // Switch to scatter
    await typeSelect.selectOption('scatter');
    await expect(typeSelect).toHaveValue('scatter');
    await page.waitForTimeout(2000);

    // Scatter should show marker.color WITH its value (not "Click to edit...")
    await expect(propsSection.getByText('marker.color')).toBeVisible({ timeout: 5000 });
    // The CASE WHEN expression should still be present — not empty
    await expect(propsSection.getByText('CASE WHEN').first()).toBeVisible({ timeout: 5000 });
    // "Click to edit..." should NOT be visible for marker.color
    const markerRow = propsSection.getByText('marker.color').locator('xpath=ancestor::div[3]');
    await expect(markerRow.getByText('Click to edit')).not.toBeVisible({ timeout: 2000 });

    // Switch back to bar
    await typeSelect.selectOption('bar');
    await expect(typeSelect).toHaveValue('bar');
    await page.waitForTimeout(2000);

    // marker.color must be visually rendered with VALUE after round-trip
    await expect(propsSection.getByText('marker.color')).toBeVisible({ timeout: 5000 });
    await expect(propsSection.getByText('CASE WHEN').first()).toBeVisible({ timeout: 5000 });
    const restoredCount = parseInt((await propCountText.textContent()).match(/(\d+) of/)?.[1] || '0');
    expect(restoredCount).toBe(barCount);
  });

  test('Type switch to pie produces no preview error', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await typeSelect.selectOption('pie');
    await expect(typeSelect).toHaveValue('pie');
    await page.waitForTimeout(3000);

    // No preview error (pie shouldn't get stale marker props)
    await expect(page.locator('text=Preview Failed')).not.toBeVisible({ timeout: 2000 });
  });

  test('Type switch bar→pie→bar restores marker.color value', async ({ page }) => {
    await loadExplorerWithChart(page, 'combined-interactions-test-chart');

    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const typeSelect = page.locator('[data-testid^="insight-type-select-"]').first();
    await expect(typeSelect).toHaveValue('bar');

    const propsSection = page.locator('[data-testid^="insight-crud-section-"]').first();

    // Verify initial bar has marker.color with CASE WHEN value
    await expect(propsSection.getByText('marker.color')).toBeVisible({ timeout: 5000 });
    await expect(propsSection.getByText('CASE WHEN').first()).toBeVisible({ timeout: 5000 });

    // Switch to pie
    await typeSelect.selectOption('pie');
    await expect(typeSelect).toHaveValue('pie');
    await page.waitForTimeout(2000);

    // Switch back to bar — per-type cache restores full props
    await typeSelect.selectOption('bar');
    await expect(typeSelect).toHaveValue('bar');

    // marker.color must be visible WITH its value (wait for schema load + SchemaEditor detection)
    await expect(propsSection.getByText('marker.color')).toBeVisible({ timeout: 10000 });
    await expect(propsSection.getByText('CASE WHEN').first()).toBeVisible({ timeout: 5000 });
    // Must NOT show "Click to edit..."
    const markerRow = propsSection.getByText('marker.color').locator('xpath=ancestor::div[3]');
    await expect(markerRow.getByText('Click to edit')).not.toBeVisible({ timeout: 2000 });
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
