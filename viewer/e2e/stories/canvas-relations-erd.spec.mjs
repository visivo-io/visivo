/**
 * Story: the Relations ERD builder (VIS-1006).
 *
 * Selecting a relation in the Library now opens the per-object Canvas lens that
 * VIS-1006 registers for `relation` — a React-Flow ERD where every model is a
 * column-listing card and existing relations are edges between joined columns.
 * (Before VIS-1006 the relation type had no canvas and fell to the universal
 * Lineage lens.)
 *
 * This story asserts the framework wiring is live:
 *   - selecting a relation renders the ERD canvas (`relation-erd`) inside the
 *     ObjectCanvasFrame (`workspace-middle-relation-preview`), NOT lineage;
 *   - the ERD shows the project's model cards.
 *
 * The integration project ships a `local_to_local` relation joining
 * `local_test_table.x` ↔ `another_local_test_table.x`.
 *
 * NOTE on coverage: the column→column drag-to-author gesture (onConnectStart/
 * onConnectEnd opening JoinOperatorPopover) is exercised by unit tests, not
 * here — React-Flow's connection drag is a low-level pointer interaction that's
 * brittle to drive through Playwright. See the post-merge caveats in the PR.
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

test.describe('Relations ERD builder (VIS-1006)', () => {
  test.setTimeout(90000);

  test('selecting a relation renders the ERD canvas with model nodes', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // Select the integration project's relation from the Library.
    await selectLibraryObject(page, 'relation', 'local_to_local');

    // The ObjectCanvasFrame mounts the relation's Canvas lens (the ERD), not
    // the universal Lineage lens.
    await expect(page.getByTestId('workspace-middle-relation-preview')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('relation-erd')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('workspace-middle-relation-lineage')).toHaveCount(0);

    // The ERD shows the two models the relation joins as cards.
    await expect(page.getByTestId('erd-model-node-local_test_table')).toBeVisible({
      timeout: WAIT,
    });
    await expect(
      page.getByTestId('erd-model-node-another_local_test_table')
    ).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/vis1006-01-relation-erd.png` });
    expect(errors).toEqual([]);
  });

  test('ERD cards render output columns from the model schema endpoint', async ({ page }) => {
    const errors = collectErrors(page);

    // Watch model API traffic: useModelColumns must hit the run-phase SCHEMA
    // artifact (/api/models/<name>/schema/), not the heavier /data/ endpoint.
    const schemaCalls = [];
    const dataCalls = [];
    const modelApi = /\/api\/models\/([^/]+)\/(schema|data)\//;
    page.on('request', req => {
      const m = modelApi.exec(req.url());
      if (!m) return;
      if (m[2] === 'schema') schemaCalls.push(m[1]);
      else dataCalls.push(m[1]);
    });

    await openWorkspace(page);
    await selectLibraryObject(page, 'relation', 'local_to_local');
    await expect(page.getByTestId('relation-erd')).toBeVisible({ timeout: WAIT });

    // The model cards hydrate their columns from the schema artifact. The
    // integration project's local_test_table model outputs columns x and y.
    await expect(
      page.getByTestId('erd-column-local_test_table-x')
    ).toBeVisible({ timeout: WAIT });
    await expect(
      page.getByTestId('erd-column-local_test_table-y')
    ).toBeVisible({ timeout: WAIT });
    await expect(
      page.getByTestId('erd-column-another_local_test_table-new_x')
    ).toBeVisible({ timeout: WAIT });

    // The columns came from the schema endpoint — and the ERD did NOT fall
    // back to /data/ for the models whose schema resolved.
    expect(schemaCalls).toContain('local_test_table');
    expect(schemaCalls).toContain('another_local_test_table');
    expect(dataCalls).not.toContain('local_test_table');
    expect(dataCalls).not.toContain('another_local_test_table');

    await page.screenshot({ path: `${SCREENS}/vis1006-03-erd-columns-from-schema.png` });
    expect(errors).toEqual([]);
  });

  test('the relation Canvas lens flips to Lineage and back', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'relation', 'local_to_local');
    await expect(page.getByTestId('relation-erd')).toBeVisible({ timeout: WAIT });

    // Flip to the universal Lineage lens.
    await page.getByTestId('workspace-lens-picker-option-lineage').click();
    await expect(page.getByTestId('workspace-middle-relation-lineage')).toBeVisible({
      timeout: WAIT,
    });

    // Flip back to Canvas — the ERD returns.
    await page.getByTestId('workspace-lens-picker-option-preview').click();
    await expect(page.getByTestId('relation-erd')).toBeVisible({ timeout: WAIT });

    expect(errors).toEqual([]);
  });
});
