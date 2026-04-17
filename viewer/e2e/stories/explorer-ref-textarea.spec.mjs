/**
 * Story: RefTextArea Inline Pill Editor
 *
 * Tests the inline contentEditable pill editor that replaced the Monaco editor.
 * Users type directly around pills, use @ mentions to insert refs, and DnD
 * drops insert at cursor position.
 *
 * Stories: US-REF-1, US-REF-2, US-REF-3, US-REF-4, US-REF-8, US-REF-10
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';
import { loadExplorer, loadExplorerWithChart, typeSql, runQuery } from '../helpers/explorer.mjs';

async function dragAndDrop(page, sourceLocator, targetLocator) {
  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Cannot drag: missing bounding box');
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

test.describe('RefTextArea — Inline Pill Editing', () => {
  test.setTimeout(90000);
  test.setTimeout(60000);

  test('US-REF-1: Type text around pill inserted via @ mention', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction and wait for it
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');

    // Use @ mention to insert a pill
    await editable.click();
    await page.keyboard.type('@', { delay: 50 });
    const dropdown = page.locator('[data-testid="mention-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });
    const firstItem = dropdown.locator('[data-testid^="mention-item-"]').first();
    await firstItem.click();

    // Pill should be visible
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 3000 });

    // Cursor should be after the pill — type additional text
    await page.keyboard.type(' > 10', { delay: 30 });

    // Click away to commit
    await page.locator('[data-testid="insight-interaction-0"]').locator('select').click();
    await page.waitForTimeout(300);

    // Pill should still be visible
    await expect(pills.first()).toBeVisible();

    // The typed text should be visible alongside the pill
    const fieldText = await dropZone.textContent();
    expect(fieldText).toContain('> 10');

    // No ?{ should be visible
    expect(fieldText).not.toContain('?{');
  });

  test('US-REF-2: Remove interaction clears pills', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction and use @ mention to insert pill
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');

    await editable.click();
    await page.keyboard.type('@', { delay: 50 });
    const dropdown = page.locator('[data-testid="mention-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });
    await dropdown.locator('[data-testid^="mention-item-"]').first().click();

    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 3000 });

    // Remove the interaction via the X button
    await page.locator('[data-testid="insight-remove-interaction-0"]').click();

    // Interaction row should be gone
    await expect(page.locator('[data-testid="insight-interaction-0"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('US-REF-11: Click on pill places cursor on correct side', async ({ page }) => {
    await loadExplorerWithChart(page, 'sort-input-test-chart');

    // Expand the insight
    const insightHeader = page.locator('[data-testid^="insight-header-"]').first();
    await insightHeader.click();

    const interactionField = page.locator('[data-testid^="interaction-value-field-"]').first();
    await expect(interactionField).toBeVisible({ timeout: 10000 });

    const pills = interactionField.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });

    // Wait for React to settle so the pill DOM stays attached during click.
    // Use element-relative click (position option) instead of page.mouse.click —
    // Playwright auto-waits for stability and re-resolves the element.
    await page.waitForTimeout(500);
    await pills.first().click({ position: { x: 1, y: 4 } });
    await page.waitForTimeout(200);

    // Type text — it should appear near the pill
    await page.keyboard.type('ABC', { delay: 30 });

    const fieldText = await interactionField.textContent();
    expect(fieldText).toContain('ABC');
  });
});

test.describe('RefTextArea — @ Mention System', () => {
  test.setTimeout(90000);

  test('US-REF-3: @ mention inserts ref pill inline', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    // Click into the interaction value field
    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');
    await editable.click();

    // Type @ to trigger mention dropdown
    await page.keyboard.type('@', { delay: 50 });

    // Mention dropdown should appear
    const dropdown = page.locator('[data-testid="mention-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Should show available objects
    const items = dropdown.locator('[data-testid^="mention-item-"]');
    await expect(items.first()).toBeVisible({ timeout: 3000 });

    // Click on the first item
    await items.first().click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible({ timeout: 2000 });

    // A pill should appear in the field
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 3000 });

    // No @ should remain visible
    const fieldText = await dropZone.textContent();
    expect(fieldText).not.toContain('@');
  });

  test('US-REF-4: @ mention dropdown filters as you type', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');
    await editable.click();

    // Type @local to filter
    await page.keyboard.type('@local', { delay: 50 });

    const dropdown = page.locator('[data-testid="mention-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Should show items matching "local"
    const items = dropdown.locator('[data-testid^="mention-item-"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // All visible items should contain "local" in their name
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent();
      expect(text.toLowerCase()).toContain('local');
    }

    // Backspace past @ should close dropdown
    await page.keyboard.press('Backspace'); // l
    await page.keyboard.press('Backspace'); // a
    await page.keyboard.press('Backspace'); // c
    await page.keyboard.press('Backspace'); // o
    await page.keyboard.press('Backspace'); // l
    await page.keyboard.press('Backspace'); // @

    await expect(dropdown).not.toBeVisible({ timeout: 2000 });
  });

  test('US-REF-8: @ mention works in interaction fields with correct types', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');
    await editable.click();

    // Type @ to open mention
    await page.keyboard.type('@', { delay: 50 });

    const dropdown = page.locator('[data-testid="mention-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Should have items (models, metrics, dimensions, inputs are allowed in interactions)
    const items = dropdown.locator('[data-testid^="mention-item-"]');
    await expect(items.first()).toBeVisible({ timeout: 3000 });

    // Select item and verify pill inserted
    await items.first().click();
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 3000 });
  });

  test('US-REF-10: Keyboard navigation in @ mention dropdown', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');
    await editable.click();

    // Type @ to open mention
    await page.keyboard.type('@', { delay: 50 });

    const dropdown = page.locator('[data-testid="mention-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(dropdown).not.toBeVisible({ timeout: 2000 });

    // Type @ again and use Enter to select
    await page.keyboard.type('@', { delay: 50 });
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Press ArrowDown then Enter
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Dropdown should close and pill should appear
    await expect(dropdown).not.toBeVisible({ timeout: 2000 });
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe('RefTextArea — Copy/Paste', () => {
  test.setTimeout(90000);

  test('US-REF-7: Paste text with ref pattern renders as pill', async ({ page }) => {
    await loadExplorer(page);
    await typeSql(page, 'SELECT x, y FROM test_table LIMIT 10');
    await runQuery(page);

    // Add an interaction
    await page.locator('[data-testid^="insight-add-interaction-"]').first().click();
    await expect(page.locator('[data-testid="insight-interaction-0"]')).toBeVisible({ timeout: 5000 });

    const dropZone = page.locator('[data-testid="interaction-value-field-0"]');
    const editable = dropZone.locator('[contenteditable="true"]');
    await editable.click();

    // Paste a ref string via clipboard
    await page.evaluate(() => {
      const text = '${ref(test_model).x} > 5';
      const el = document.querySelector('[data-testid="ref-textarea-editable"]');
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);

    // Should render as a pill + text, not raw ref syntax
    const pills = dropZone.locator('span.inline-flex');
    await expect(pills.first()).toBeVisible({ timeout: 3000 });

    // The "> 5" text should be visible
    const fieldText = await dropZone.textContent();
    expect(fieldText).toContain('> 5');

    // No raw ${ref should be visible
    expect(fieldText).not.toContain('${ref');
  });
});
