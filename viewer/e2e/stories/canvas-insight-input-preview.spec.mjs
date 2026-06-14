/**
 * Story: Workspace insight preview + input widgets (VIS-1002 / VIS-1003 + Wave-1 acceptance).
 *
 * Selecting an insight in the Library opens its middle-pane Canvas — a real
 * Plotly render of the SAME data the dashboard draws (VIS-1002 fixed the
 * data-keying so a *published* insight loads instead of spinning forever). When
 * the insight depends on an input, the preview renders the input widgets and
 * seeds defaults so it never hangs on `pendingInputs` (VIS-1003).
 *
 * Also covers the acceptance fix that the first lens is always labelled
 * "Canvas" (never "Preview") for every object type.
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

test.describe('Workspace insight + input previews (VIS-1002/1003)', () => {
  test.setTimeout(90000);

  test('a published insight renders a real Plotly chart (not an infinite spinner)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    await selectLibraryObject(page, 'insight', 'simple-scatter-insight');

    // The per-object insight surface mounts with its SubBar + Canvas lens.
    await expect(page.getByTestId('workspace-subbar-insight')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('insight-preview')).toBeVisible({ timeout: WAIT });

    // The lens picker's first option is "Canvas" for every type (acceptance fix).
    await expect(page.getByTestId('workspace-lens-picker-option-preview')).toContainText('Canvas');

    // VIS-1002: the published insight actually loads + renders a Plotly plot.
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/vis1002-01-insight-preview.png` });
    expect(errors).toEqual([]);
  });

  test('an input-driven insight renders its input widgets and still plots', async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkspace(page);

    // split-input-test-insight splits a bar chart by the `split_threshold` input.
    await selectLibraryObject(page, 'insight', 'split-input-test-insight');

    await expect(page.getByTestId('insight-preview')).toBeVisible({ timeout: WAIT });

    // VIS-1003: the input widgets render around the preview body…
    await expect(page.getByTestId('input-controls-section')).toBeVisible({ timeout: WAIT });

    // …and because defaults are seeded, the plot resolves instead of hanging.
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible({ timeout: WAIT });

    await page.screenshot({ path: `${SCREENS}/vis1003-01-input-driven-insight.png` });
    expect(errors).toEqual([]);
  });
});
