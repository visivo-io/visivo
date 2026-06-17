/**
 * Story: Read-only table polish on the canvas (Wave-1 acceptance fixes).
 *
 *   - The column-profile info icon is an Explorer-only affordance (it opens the
 *     profile drawer via onColumnProfileRequest). Read-only canvas/project tables
 *     pass no handler, so the icon must NOT render there (it was a dead button).
 *   - A wide table scrolls inside its slot instead of overflowing the canvas /
 *     pushing horizontal page scroll (the flexbox min-w-0 fix).
 *
 * Precondition: sandbox on :3001 (`bash scripts/sandbox.sh start`).
 */

import { test, expect } from '@playwright/test';
import { SCREENS, WAIT, collectErrors, openDashboardCanvas } from '../helpers/workspace.mjs';

test.use({ viewport: { width: 1600, height: 1400 } });

test.describe('Canvas table polish (Wave-1 acceptance)', () => {
  test.setTimeout(90000);

  test('the column-profile info icon does not render on a canvas table', async ({ page }) => {
    const errors = collectErrors(page);
    await openDashboardCanvas(page, 'table-dashboard');

    // The table rendered: its column headers carry the null-percentage bar.
    const headers = page.locator('[title$="% null"]');
    await expect(headers.first()).toBeVisible({ timeout: WAIT });
    expect(await headers.count()).toBeGreaterThan(0);

    // …but the Explorer-only profile button is absent on the read-only canvas.
    await expect(page.locator('button[title="View column profile"]')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENS}/acc-01-no-info-icon-on-canvas.png` });
    expect(errors).toEqual([]);
  });

  test('a wide table scrolls within its slot instead of overflowing the page', async ({ page }) => {
    const errors = collectErrors(page);
    await openDashboardCanvas(page, 'wide-table-dashboard');

    // The wide table rendered (its many long-named columns are present).
    await expect(page.locator('[title$="% null"]').first()).toBeVisible({ timeout: WAIT });

    // The min-w-0 fix keeps the table inside its slot: the document does not
    // gain a horizontal scrollbar wider than the viewport (small tolerance for
    // sub-pixel rounding).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);

    await page.screenshot({ path: `${SCREENS}/acc-02-wide-table-contained.png` });
    expect(errors).toEqual([]);
  });
});
