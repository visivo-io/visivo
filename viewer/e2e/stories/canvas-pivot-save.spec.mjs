/* eslint-disable no-template-curly-in-string -- Visivo pivot configs are literal `${ref(...)}` strings */
/**
 * Story: the pivot Build-lens Save flow + shared field-pill styling (VIS-1008
 * follow-up).
 *
 * Two fixes are exercised here:
 *
 *   A) The pivot field-list pills + shelf chips use the app's SHARED field pill
 *      (icon + colors from objectTypeConfigs — dimension=teal), NOT a bespoke
 *      teal. We assert a `[data-testid^="pivot-field-"]` pill carries the
 *      dimension palette classes the shared `FieldPill` applies everywhere.
 *
 *   B) Clicking Save no longer no-ops / silently commits — it opens a small
 *      "replace or add new" modal. Choosing "Add as a new table" creates a NEW
 *      table object (a fresh, uniquely-named table with this pivot config),
 *      which we verify by reading `window.useStore.getState().tables` before vs
 *      after.
 *
 * Precondition: sandbox serving the integration project (which defines the
 * pivot-capable `category-pivot-table`). Targets the base URL via
 * VIS_CANVAS_BASE / PLAYWRIGHT_BASE_URL so parallel agents don't collide.
 */

import { test, expect } from '@playwright/test';
import { SCREENS, WAIT, collectErrors, openWorkspace, selectLibraryObject } from '../helpers/workspace.mjs';

const TABLE_NAME = 'category-pivot-table';

test.use({ viewport: { width: 1600, height: 1400 } });

test.describe('Pivot Build lens — shared field pills + Save modal (VIS-1008)', () => {
  test.setTimeout(90000);

  test('field pills use the shared style and Save → Add as new table creates a table', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // Select the pivot-capable table and flip to the editable Build lens.
    await selectLibraryObject(page, 'table', TABLE_NAME);
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('workspace-lens-picker-option-build').click();
    await expect(page.getByTestId('pivot-playground')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-field-list')).toBeVisible({ timeout: WAIT });

    // ── Fix A: the field pills are the shared FieldPill ──────────────────────
    // The shared pill applies the `dimension` palette from objectTypeConfigs
    // (teal: bg-teal-100 / text-teal-800 / border-teal-200) and renders the
    // type icon (an svg). A bespoke teal pill would not carry these exact
    // shared-config classes. Scope to the draggable pill buttons INSIDE the
    // field list (the list container shares the `pivot-field-` prefix).
    const firstFieldPill = page
      .getByTestId('pivot-field-list')
      .locator('button[data-testid^="pivot-field-"]')
      .first();
    await expect(firstFieldPill).toBeVisible({ timeout: WAIT });
    const pillClass = (await firstFieldPill.getAttribute('class')) || '';
    expect(pillClass).toContain('bg-teal-100');
    expect(pillClass).toContain('text-teal-800');
    expect(pillClass).toContain('border-teal-200');
    // The shared pill renders the dimension icon (svg) inside.
    await expect(firstFieldPill.locator('svg').first()).toBeVisible({ timeout: WAIT });

    // A seeded Columns chip is the same shared pill (teal dimension palette).
    const columnsChip = page.getByTestId('pivot-chip-columns-0');
    await expect(columnsChip).toBeVisible({ timeout: WAIT });
    const chipClass = (await columnsChip.getAttribute('class')) || '';
    expect(chipClass).toContain('bg-teal-100');

    await page.screenshot({ path: `${SCREENS}/vis1008-save-01-shared-pills.png` });

    // ── Fix B: Save opens the replace/add-new modal ──────────────────────────
    // Mutate the draft so the table is dirty and Save is enabled (drop the first
    // available field onto the Rows shelf via a real dnd-kit drag).
    const dragSource = firstFieldPill;
    const rowsShelf = page.getByTestId('pivot-shelf-rows');
    await dragSource.hover();
    await page.mouse.down();
    const box = await rowsShelf.boundingBox();
    // dnd-kit needs intermediate moves to register the drag.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4, { steps: 4 });
    await page.mouse.up();

    const saveBtn = page.getByTestId('pivot-playground-save');
    await expect(saveBtn).toBeEnabled({ timeout: WAIT });

    // Count tables BEFORE saving.
    const beforeCount = await page.evaluate(
      () => (window.useStore.getState().tables || []).length
    );

    await saveBtn.click();
    await expect(page.getByTestId('pivot-save-modal')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-save-replace')).toBeVisible();
    await expect(page.getByTestId('pivot-save-add-new')).toBeVisible();

    await page.screenshot({ path: `${SCREENS}/vis1008-save-02-modal.png` });

    // Choose "Add as a new table" → a NEW table is persisted to the store.
    await page.getByTestId('pivot-save-add-new').click();

    // The modal closes and the tables count increases by one.
    await expect(page.getByTestId('pivot-save-modal')).toHaveCount(0, { timeout: WAIT });
    await expect
      .poll(() => page.evaluate(() => (window.useStore.getState().tables || []).length), {
        timeout: WAIT,
      })
      .toBe(beforeCount + 1);

    // The new table carries a unique name derived from the source table.
    const hasNewPivotTable = await page.evaluate(
      sourceName =>
        (window.useStore.getState().tables || []).some(
          t => t.name !== sourceName && t.name.includes(sourceName)
        ),
      TABLE_NAME
    );
    expect(hasNewPivotTable).toBe(true);

    expect(errors).toEqual([]);
  });
});
