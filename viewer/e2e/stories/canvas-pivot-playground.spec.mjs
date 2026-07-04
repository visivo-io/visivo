/**
 * Story: the table pivot playground — the editable `build` lens (VIS-1008).
 *
 * The table object canvas now has TWO lenses: the read-only `Canvas`
 * (TablePreview, the default) and an editable `Build` lens — the drag-to-shelf
 * pivot playground. The playground is a 3-pane builder:
 *
 *   - LEFT:   a Field List of the table's source fields (draggable pills);
 *   - MIDDLE: three drop Shelves — Columns / Rows / Values;
 *   - RIGHT:  a live Result table that re-runs the pivot pipeline on every change.
 *
 * This story exercises the user-visible behaviour:
 *   - selecting a pivot-capable table opens its read-only Canvas (TablePreview);
 *   - flipping to the Build lens mounts the pivot playground (field list +
 *     the three shelves + the result panel);
 *   - the build lens shows the editable dirty indicator (not the read-only pill);
 *   - the shelves seed pre-populated from the table's existing pivot config and
 *     the result panel renders a runnable pivot;
 *   - flipping back to Canvas restores the read-only TablePreview body.
 *
 * The drag-to-shelf GESTURE itself (dragging a field pill onto a shelf) is a
 * real dnd-kit pointer drag — covered by the unit tests at the router level
 * (jsdom can't simulate it); this story asserts the surfaces render + seed.
 *
 * Precondition: sandbox on :3001 (`bash scripts/sandbox.sh start`) serving the
 * integration project, which defines pivot-capable tables `category-pivot-table`
 * and `sales-pivot-table` (project.visivo.yml).
 */

import { test, expect } from '@playwright/test';
import {
  SCREENS,
  WAIT,
  collectErrors,
  openWorkspace,
  selectLibraryObject,
} from '../helpers/workspace.mjs';

// A named pivot-capable table in test-projects/integration (project.visivo.yml):
// it carries `columns` / `rows` / `values`, so the build lens seeds non-empty.
const TABLE_NAME = 'category-pivot-table';

test.use({ viewport: { width: 1600, height: 1400 } });

test.describe('Table pivot playground — Build lens (VIS-1008)', () => {
  test.setTimeout(90000);

  test('flips the table canvas to the editable Build lens and renders the pivot builder', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // Selecting the table opens its read-only Canvas (TablePreview).
    await selectLibraryObject(page, 'table', TABLE_NAME);
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: WAIT,
    });
    // Read-only canvas → the lock pill is present, no dirty indicator.
    await expect(page.getByTestId('canvas-readonly-pill')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('canvas-dirty-indicator')).toHaveCount(0);

    // Flip to the Build lens — the pivot playground mounts; the read-only pill is
    // replaced by the editable dirty indicator (initially clean / "Saved").
    await page.getByTestId('workspace-lens-picker-option-build').click();
    await expect(page.getByTestId('pivot-playground')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('canvas-readonly-pill')).toHaveCount(0);
    const dirty = page.getByTestId('canvas-dirty-indicator');
    await expect(dirty).toBeVisible({ timeout: WAIT });

    // The three drop shelves render.
    await expect(page.getByTestId('pivot-shelf-columns')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-shelf-rows')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-shelf-values')).toBeVisible({ timeout: WAIT });

    // The field list + the live result panel render.
    await expect(page.getByTestId('pivot-field-list')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-result')).toBeVisible({ timeout: WAIT });

    // category-pivot-table ships a full pivot config, so the shelves seed with
    // chips (not the empty "Drop a field here" hint) and the result is runnable.
    await expect(page.getByTestId('pivot-chip-columns-0')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-chip-rows-0')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('pivot-chip-values-0')).toBeVisible({ timeout: WAIT });
    // A Values chip carries an aggregation select.
    await expect(page.getByTestId('pivot-chip-values-0-agg')).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/vis1008-01-pivot-build-seeded.png` });

    // Flip back to the Canvas (preview) lens — the read-only TablePreview body
    // returns and the read-only pill comes back.
    await page.getByTestId('workspace-lens-picker-option-preview').click();
    await expect(page.getByTestId('workspace-middle-table-preview')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('pivot-playground')).toHaveCount(0);
    await expect(page.getByTestId('canvas-readonly-pill')).toBeVisible({ timeout: WAIT });

    expect(errors).toEqual([]);
  });
});
