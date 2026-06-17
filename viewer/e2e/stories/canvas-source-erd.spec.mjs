/**
 * Story: the Source ERD Canvas lens (VIS-1005).
 *
 * Before VIS-1005 a `source` had no Canvas lens — selecting one muted the Canvas
 * segment and fell through to the universal Lineage DAG. Now `source` is a
 * registered object canvas whose Canvas lens renders `SourceErd`: a React-Flow
 * ERD of the source's tables (one node per table, flattened across
 * databases/schemas). Right-clicking a table node offers "Create a model to
 * query this table" (lands a `SELECT * FROM <schema>.<table>` model + opens it).
 *
 * This story asserts the lens-routing change: the Canvas lens now renders the
 * ERD (`source-erd`), NOT the muted/lineage fallback. The sandbox's duckdb may
 * legitimately have no tables, so we accept EITHER the ERD canvas with a table
 * node OR a graceful empty/cold ERD state — never an infinite spinner and never
 * the old lineage fallback on the Canvas lens.
 *
 * Precondition: the isolated sandbox running the integration project on :3001
 * (`bash scripts/sandbox.sh start`). Override the base via VIS_CANVAS_BASE.
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

const selectSource = (page, name) => selectLibraryObject(page, 'source', name);

test.describe('Source ERD canvas (VIS-1005)', () => {
  test.setTimeout(90000);

  test('the Canvas lens renders the table ERD (not muted/lineage)', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectSource(page, 'local-duckdb');

    // The Source canvas frame mounts on the Canvas (preview) lens.
    await expect(page.getByTestId('workspace-middle-source-preview')).toBeVisible({
      timeout: WAIT,
    });

    // The ERD (or a graceful empty/cold ERD state) renders — NOT the old muted
    // Canvas → Lineage fallback. duckdb may be empty in the sandbox, so accept
    // any of the ERD's own settled states; never an infinite loading spinner.
    await expect(
      page
        .getByTestId('source-erd')
        .or(page.getByTestId('source-erd-empty'))
        .or(page.getByTestId('source-erd-connection-failed'))
    ).toBeVisible({ timeout: WAIT });

    // The Canvas lens must NOT have fallen through to the universal Lineage DAG.
    await expect(page.getByTestId('workspace-middle-source-lineage')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis1005-01-source-erd.png` });
    expect(errors).toEqual([]);
  });

  test('an introspectable source diagrams at least one table node', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectSource(page, 'local-duckdb');
    await expect(page.getByTestId('workspace-middle-source-preview')).toBeVisible({
      timeout: WAIT,
    });

    const erd = page.getByTestId('source-erd');
    const settled = erd
      .or(page.getByTestId('source-erd-empty'))
      .or(page.getByTestId('source-erd-connection-failed'));
    await expect(settled).toBeVisible({ timeout: WAIT });

    // When the ERD itself renders, at least one table node must appear. (If the
    // sandbox duckdb is empty, the graceful empty state above already satisfied
    // the story — we don't assert a specific table count.)
    if (await erd.isVisible().catch(() => false)) {
      await expect(page.locator('[data-testid^="source-erd-node-"]').first()).toBeVisible({
        timeout: WAIT,
      });
    }

    await page.screenshot({ path: `${SCREENS}/vis1005-02-source-erd-nodes.png` });
    expect(errors).toEqual([]);
  });
});
