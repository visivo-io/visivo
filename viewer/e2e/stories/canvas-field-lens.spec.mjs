/**
 * Story: the Metrics & Dimensions Field Lens canvases (VIS-1009).
 *
 * Before VIS-1009 a `dimension` / `metric` had NO canvas descriptor — selecting
 * one muted the Canvas segment and fell through to the universal Lineage DAG.
 * Now each is a registered object canvas whose Canvas (preview) lens renders a
 * focused per-field studio:
 *   - dimension → DimensionInspector (`dimension-inspector`): shows the
 *     expression and profiles it as a derived column of its parent model.
 *   - metric    → MetricPlayground (`metric-playground`): a synthetic single-
 *     metric insight with always-defaulted split-by + time-grain controls.
 *
 * This story asserts the lens-routing change: the Canvas lens renders the Field
 * Lens body, NOT the muted/lineage fallback. Both canvases are `serve`-gated on
 * `sourcesMetadata`; the sandbox runs `visivo serve`, so the canvas renders (its
 * own run/profile may need a click, which we don't drive here — we only assert
 * the lens mounts and never falls to lineage).
 *
 * Integration-project fixtures used:
 *   - dimension `x_rounded` (model `local_test_table`, expr ROUND(x, 2))
 *   - metric    `avg_value` (model `daily_metrics`, expr AVG(value))
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

test.describe('Field Lens canvases (VIS-1009)', () => {
  test.setTimeout(90000);

  test('a dimension renders the DimensionInspector Field Lens (not lineage)', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'dimension', 'x_rounded');

    // The dimension canvas frame mounts on the Canvas (preview) lens.
    await expect(page.getByTestId('workspace-middle-dimension-preview')).toBeVisible({
      timeout: WAIT,
    });

    // The Field Lens (DimensionInspector) renders — NOT the old muted Canvas →
    // Lineage fallback.
    await expect(page.getByTestId('dimension-inspector')).toBeVisible({ timeout: WAIT });

    // The expression studio shows the dimension's SQL expression.
    await expect(page.getByTestId('dimension-inspector-expression')).toContainText('ROUND');

    // The Canvas lens must NOT have fallen through to the universal Lineage DAG.
    await expect(page.getByTestId('workspace-middle-dimension-lineage')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis1009-01-dimension-inspector.png` });
    expect(errors).toEqual([]);
  });

  test('a metric renders the MetricPlayground Field Lens (not lineage)', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'metric', 'avg_value');

    // The metric canvas frame mounts on the Canvas (preview) lens.
    await expect(page.getByTestId('workspace-middle-metric-preview')).toBeVisible({
      timeout: WAIT,
    });

    // The Field Lens (MetricPlayground) renders, with its split-by + time-grain
    // controls — NOT the muted Canvas → Lineage fallback.
    await expect(page.getByTestId('metric-playground')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground-split')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('metric-playground-time-grain')).toBeVisible({ timeout: WAIT });

    // The Canvas lens must NOT have fallen through to the universal Lineage DAG.
    await expect(page.getByTestId('workspace-middle-metric-lineage')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/vis1009-02-metric-playground.png` });
    expect(errors).toEqual([]);
  });
});
