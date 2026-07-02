/**
 * Story: the markdown editor canvas (VIS-1010).
 *
 * The markdown object canvas now has TWO lenses: the read-only `Canvas`
 * (MarkdownPreview, the default) and an editable `Edit` lens — a split
 * editor (textarea, left) + LIVE preview (right) that owns a draft of the
 * markdown content, debounce-saves it through the markdown store, and drives
 * the frame's dirty indicator.
 *
 * This story exercises the user-visible behaviour:
 *   - selecting a markdown object opens its read-only Canvas (MarkdownPreview);
 *   - flipping to the Edit lens mounts the split editor canvas;
 *   - typing flips the frame's dirty indicator to "Unsaved";
 *   - flipping back to Canvas restores the read-only MarkdownPreview body.
 *
 * Precondition: sandbox on :3001 (`bash scripts/sandbox.sh start`) serving the
 * integration project, which defines a named `welcome-note` markdown object.
 */

import { test, expect } from '@playwright/test';
import {
  SCREENS,
  WAIT,
  collectErrors,
  openWorkspace,
  selectLibraryObject,
} from '../helpers/workspace.mjs';

// The named markdown object in test-projects/integration (project.visivo.yml).
const MARKDOWN_NAME = 'welcome-note';

test.use({ viewport: { width: 1600, height: 1200 } });

test.describe('Markdown editor canvas (VIS-1010)', () => {
  test.setTimeout(90000);

  test('flips the markdown canvas to the editable Edit lens and back', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // Selecting the markdown object opens its read-only Canvas (MarkdownPreview).
    await selectLibraryObject(page, 'markdown', MARKDOWN_NAME);
    await expect(page.getByTestId('workspace-middle-markdown-preview')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('markdown-preview')).toBeVisible({ timeout: WAIT });
    // Read-only canvas → the lock pill is present, no dirty indicator.
    await expect(page.getByTestId('canvas-readonly-pill')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('canvas-dirty-indicator')).toHaveCount(0);

    // Flip to the Edit lens — the split editor canvas mounts; the read-only pill
    // is replaced by the dirty indicator (initially clean / "Saved").
    await page.getByTestId('workspace-lens-picker-option-edit').click();
    await expect(page.getByTestId('markdown-editor-canvas')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('markdown-editor-textarea')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('markdown-editor-preview')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('canvas-readonly-pill')).toHaveCount(0);
    const dirty = page.getByTestId('canvas-dirty-indicator');
    await expect(dirty).toBeVisible({ timeout: WAIT });
    await expect(dirty).toHaveAttribute('data-dirty', 'false');

    await page.screenshot({ path: `${SCREENS}/vis1010-01-markdown-edit-clean.png` });

    // Typing into the editor flips the frame's dirty state to "Unsaved" and the
    // live preview tracks the draft.
    const textarea = page.getByTestId('markdown-editor-textarea');
    await textarea.click();
    await textarea.press('End');
    await textarea.type('\n\nEdited live by the VIS-1010 story.');
    await expect(dirty).toHaveAttribute('data-dirty', 'true', { timeout: WAIT });
    await expect(page.getByTestId('markdown-editor-preview')).toContainText(
      'Edited live by the VIS-1010 story.',
      { timeout: WAIT }
    );

    await page.screenshot({ path: `${SCREENS}/vis1010-02-markdown-edit-dirty.png` });

    // Flip back to the Canvas (preview) lens — the read-only MarkdownPreview
    // body returns and the read-only pill comes back.
    await page.getByTestId('workspace-lens-picker-option-preview').click();
    await expect(page.getByTestId('markdown-preview')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('markdown-editor-canvas')).toHaveCount(0);
    await expect(page.getByTestId('canvas-readonly-pill')).toBeVisible({ timeout: WAIT });

    expect(errors).toEqual([]);
  });
});
