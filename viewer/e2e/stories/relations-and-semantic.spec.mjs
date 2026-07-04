/* eslint-disable no-template-curly-in-string */
/**
 * Story: Relations ERD scoping + columns, and the Semantic Layer page
 * (VIS-1006a/b + VIS-1014).
 *
 * Covers the work shipped on the `jared/relations-semantic-layer` branch:
 *
 *  (a) Relations ERD — selecting a relation now SCOPES its ERD to ONLY the two
 *      models it joins (parsed from the relation `condition`'s two `${ref(model)}`
 *      operands), and each model card lists its REAL columns (hydrated from the
 *      model's cached run data), not "No columns loaded". The integration project
 *      ships `local_to_local` joining `local_test_table.x` ↔
 *      `another_local_test_table.x`.
 *
 *  (c) Semantic Layer page — a NEW project-wide ERD of EVERY model with its
 *      metrics + dimensions and all relations as edges, reached from the Project
 *      view's "Open Semantic Layer" button.
 *
 * The column→column drag-to-author gesture (React-Flow connection drag) and the
 * @-mention / library-drop add-model paths are covered by unit tests — React-Flow
 * pointer drags are too brittle to drive reliably through Playwright.
 *
 * Precondition: an isolated sandbox running the integration project. The runner
 * passes VIS_CANVAS_BASE / PLAYWRIGHT_BASE_URL pointing at it.
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

test.describe('Relations ERD scoping + Semantic Layer (VIS-1006/1014)', () => {
  test.setTimeout(120000);

  test('(a) a relation’s ERD shows ONLY its two models, each WITH columns', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'relation', 'local_to_local');

    // The relation Canvas lens (the ERD) mounts, not lineage.
    await expect(page.getByTestId('workspace-middle-relation-preview')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('relation-erd')).toBeVisible({ timeout: WAIT });

    // SCOPING: only the two joined models render as cards.
    await expect(page.getByTestId('erd-model-node-local_test_table')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('erd-model-node-another_local_test_table')).toBeVisible({
      timeout: WAIT,
    });

    // Other project models are NOT on this relation's scoped canvas.
    await expect(page.getByTestId('erd-model-node-second_local_test_table')).toHaveCount(0);
    await expect(page.getByTestId('erd-model-node-csv')).toHaveCount(0);

    // COLUMNS: each card lists its REAL hydrated columns (the integration
    // project's local models output X / Y after a run — DuckDB upper-cases the
    // unquoted identifiers), and the "No columns loaded" placeholder is gone.
    // React-Flow node bodies can sit just outside the measured viewport, so we
    // assert the column ROWS are ATTACHED (in the DOM) via the stable testid
    // prefix rather than strictly visible, and resilient to column casing.
    await expect
      .poll(
        async () =>
          page.locator('[data-testid^="erd-column-local_test_table-"]').count(),
        { timeout: WAIT }
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          page.locator('[data-testid^="erd-column-another_local_test_table-"]').count(),
        { timeout: WAIT }
      )
      .toBeGreaterThan(0);
    await expect(page.getByText('No columns loaded')).toHaveCount(0);

    // The add-model @-mention toolbar is present so the user can bring more
    // models in to author another relation.
    await expect(page.getByTestId('relation-erd-add-model-input')).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/relsem-01-scoped-relation-erd.png` });
    expect(errors).toEqual([]);
  });

  test('(c) the Semantic Layer page renders the multi-model ERD + relations', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // From the Project view, open the Semantic Layer page.
    await expect(page.getByTestId('project-semantic-layer-cta')).toBeVisible({ timeout: WAIT });
    await page.getByTestId('project-open-semantic-layer').click();

    // The Semantic Layer page mounts in the middle pane.
    await expect(page.getByTestId('workspace-middle-semantic-layer')).toBeVisible({
      timeout: WAIT,
    });
    await expect(page.getByTestId('semantic-layer-erd')).toBeVisible({ timeout: WAIT });

    // The multi-model ERD shows every model as a card (not scoped to two).
    await expect(page.getByTestId('semantic-erd-model-node-local_test_table')).toBeVisible({
      timeout: WAIT,
    });
    await expect(
      page.getByTestId('semantic-erd-model-node-another_local_test_table')
    ).toBeVisible({ timeout: WAIT });

    // A model's metric + dimension pills render (cyan / teal via objectTypeConfigs).
    await expect(page.getByTestId('erd-metric-pill-x_sum')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('erd-dimension-pill-x_rounded')).toBeVisible({ timeout: WAIT });

    // The `local_to_local` relation renders as a React-Flow edge between models.
    // Real React-Flow draws edges as SVG `<g class="react-flow__edge">` elements;
    // Playwright reports SVG groups as "hidden" (no layout box), so we assert the
    // edge is ATTACHED rather than visible.
    await expect(page.locator('.react-flow__edge').first()).toBeAttached({ timeout: WAIT });

    // The overview lays the cards out as a TILED GRID (not one tall dagre rank):
    // gather every model card's box and assert (1) they span more than one
    // column (>1 distinct left edge) and (2) no two cards overlap.
    const boxes = await page
      .locator('.react-flow__node')
      .evaluateAll(nodes =>
        nodes.map(n => {
          const r = n.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        })
      );
    expect(boxes.length).toBeGreaterThan(3);
    const columns = new Set(boxes.map(b => Math.round(b.x / 20)));
    expect(columns.size).toBeGreaterThan(1); // tiled across multiple columns
    const overlaps = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false); // cards never overlap
      }
    }

    await page.screenshot({ path: `${SCREENS}/relsem-02-semantic-layer.png` });
    expect(errors).toEqual([]);
  });
});
