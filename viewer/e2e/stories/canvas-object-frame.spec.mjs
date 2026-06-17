/**
 * Story: the unified ObjectCanvasFrame (VIS-1001).
 *
 * Every per-object canvas now renders through one shared frame: a SubBar with
 * the N-way lens picker, a lens-aware read-only pill, and lazy (code-split)
 * bodies. This story exercises the user-visible framework behaviours:
 *   - the whole model family (a csvScriptModel is surfaced as a `model`) renders
 *     the Model canvas instead of dead-ending on Lineage;
 *   - a read-only canvas shows the read-only pill, which disappears on Lineage;
 *   - the lens picker toggles Canvas ↔ Lineage.
 *
 * Precondition: sandbox on :3001 (`bash scripts/sandbox.sh start`).
 */

import { test, expect } from '@playwright/test';
import {
  SCREENS,
  WAIT,
  collectErrors,
  openWorkspace,
  selectLibraryObject,
} from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1400 } });

test.describe('ObjectCanvasFrame (VIS-1001)', () => {
  test.setTimeout(90000);

  test('a csvScriptModel renders the Model canvas (not lineage)', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // `csv` is a csvScriptModel — the Library surfaces it as a `model`. The frame
    // + ModelPreview resolve it across the model-family collections.
    await selectLibraryObject(page, 'model', 'csv');

    await expect(page.getByTestId('workspace-middle-model-preview')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('model-preview')).toBeVisible({ timeout: WAIT });
    // It did NOT fall back to "not found" or the universal Lineage lens.
    await expect(page.getByTestId('model-preview-empty')).toHaveCount(0);
    await expect(page.getByTestId('workspace-middle-model-lineage')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis1001-01-csv-model-canvas.png` });
    expect(errors).toEqual([]);
  });

  test('the read-only pill shows on a canvas lens and clears on Lineage', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'insight', 'simple-scatter-insight');

    // Read-only canvas → the lock pill is present.
    await expect(page.getByTestId('canvas-readonly-pill')).toBeVisible({ timeout: WAIT });

    // Flip to Lineage — the pill is gone (the universal DAG lens has no pill).
    await page.getByTestId('workspace-lens-picker-option-lineage').click();
    await expect(page.getByTestId('workspace-middle-insight-lineage')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('canvas-readonly-pill')).toHaveCount(0);

    // Flip back to Canvas — the preview body returns.
    await page.getByTestId('workspace-lens-picker-option-preview').click();
    await expect(page.getByTestId('insight-preview')).toBeVisible({ timeout: WAIT });

    expect(errors).toEqual([]);
  });
});
