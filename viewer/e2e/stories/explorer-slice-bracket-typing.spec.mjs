/**
 * Bracket-typing prevention in RefTextArea (B13 follow-up).
 *
 * The slice badge is the ONLY supported authoring path for slice
 * suffixes. Users typing `[`, `]` directly in the chip-editor must be
 * silently blocked at the input layer; pasting bracketed text must
 * have brackets stripped. This guards against `[0]` ending up inside
 * the chip body where it'd be interpreted as literal SQL text.
 *
 * Precondition: sandbox running on :3001/:8001.
 */

import { test, expect } from '@playwright/test';
import { loadExplorer } from '../helpers/explorer.mjs';

test.describe('RefTextArea blocks bracket typing (B13)', () => {
  test.setTimeout(60000);

  test('typed [ and ] characters do not appear in the editor body', async ({ page }) => {
    await loadExplorer(page);

    // Switch to indicator and ensure value editor renders as
    // RefTextArea (the contenteditable chip editor).
    await page.locator('[data-testid="insight-type-select-insight"]').selectOption('indicator');

    const valueDrop = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueDrop).toBeVisible({ timeout: 5000 });

    // Find the contenteditable inside the value drop's row and click
    // to focus it.
    const editor = valueDrop.locator('[contenteditable="true"]').first();
    if (!(await editor.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'RefTextArea editor not exposed in current UI');
    }
    await editor.click();

    // Type some plain text plus brackets; the brackets should be
    // dropped at the input layer.
    await page.keyboard.type('foo[0]bar', { delay: 5 });
    await page.waitForTimeout(200);

    // Read the editor's textContent — brackets must NOT appear.
    const text = await editor.textContent();
    expect(text).not.toContain('[');
    expect(text).not.toContain(']');
    // The unbracketed characters survive.
    expect(text).toContain('foo');
    expect(text).toContain('bar');
    expect(text).toContain('0');
  });

  test('pasted text with brackets has brackets stripped', async ({ page }) => {
    await loadExplorer(page);
    await page.locator('[data-testid="insight-type-select-insight"]').selectOption('indicator');

    const valueDrop = page.locator('[data-testid*="droppable-property-value"]').first();
    await expect(valueDrop).toBeVisible({ timeout: 5000 });
    const editor = valueDrop.locator('[contenteditable="true"]').first();
    if (!(await editor.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'RefTextArea editor not exposed in current UI');
    }
    await editor.click();

    // Programmatically paste text containing brackets.
    await page.evaluate(() => {
      const sel = window.getSelection();
      const editable = document.querySelector('[contenteditable="true"]');
      if (!editable) return;
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', 'hello[1:5]world');
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
      });
      editable.dispatchEvent(pasteEvent);
    });
    await page.waitForTimeout(200);

    const text = await editor.textContent();
    expect(text).not.toContain('[');
    expect(text).not.toContain(']');
    expect(text).toContain('hello');
    expect(text).toContain('world');
  });
});
