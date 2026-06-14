/**
 * Story: Project-level governance surface (VIS-1013)
 *
 * The unscoped Workspace project overview (`<ProjectEditor>`) now carries a
 * project-wide governance surface beneath the dashboard level groups: a flat
 * list of every Relation and (mirroring it) every semantic field (Metrics +
 * Dimensions). Each row deep-links into that object's per-object editor by
 * opening it as a workspace tab.
 *
 * `openWorkspace(page)` leaves the project active by default (the project
 * overview), so this story:
 *   1.  Asserts the governance section + both lists render.
 *   2.  Asserts the integration project's data is present
 *       (1 relation `local_to_local`, 5 metrics, 3 dimensions → 8 fields).
 *   3.  Clicks a relation row and asserts it opens that relation's editor tab.
 *
 * The integration sandbox for the canvas worktrees runs on :3001 by default
 * (override via VIS_CANVAS_BASE). Author-only — not run here.
 */

import { test, expect } from '@playwright/test';
import { openWorkspace, collectErrors, WAIT } from '../helpers/workspace.mjs';

const RELATION_NAME = 'local_to_local';

test.describe('Project governance surface (VIS-1013)', () => {
  test.setTimeout(90000);

  test('governance lists render the project semantic layer and deep-link relations', async ({
    page,
  }) => {
    const errors = collectErrors(page);

    // openWorkspace leaves the project overview active (no dashboard scoped).
    await openWorkspace(page);
    await expect(page.getByTestId('workspace-middle-project')).toBeVisible({ timeout: WAIT });
    await expect(page.getByTestId('project-editor')).toBeVisible({ timeout: WAIT });

    // --- 1. The governance section + both lists mount. ---------------------
    const governance = page.getByTestId('project-governance');
    await expect(governance).toBeVisible({ timeout: WAIT });
    await governance.scrollIntoViewIfNeeded();

    const relationsList = page.getByTestId('project-relations-list');
    const fieldsList = page.getByTestId('project-fields-list');
    await expect(relationsList).toBeVisible({ timeout: WAIT });
    await expect(fieldsList).toBeVisible({ timeout: WAIT });

    await page.screenshot({
      path: 'e2e/stories/__screens__/vis1013-01-governance.png',
      fullPage: true,
    });

    // --- 2. The integration project's data is present. ---------------------
    // 1 relation: local_to_local.
    await expect(page.getByTestId('project-governance-relations-count')).toHaveText('1');
    await expect(
      page.getByTestId(`project-relations-row-${RELATION_NAME}`)
    ).toBeVisible({ timeout: WAIT });

    // Count the relation rows by the button testid shape (the inner "-models"
    // span shares the prefix, so scope to <button>).
    const relRowCount = await page
      .locator('button[data-testid^="project-relations-row-"]')
      .count();
    expect(relRowCount).toBe(1);

    // 5 metrics + 3 dimensions = 8 semantic fields.
    await expect(page.getByTestId('project-governance-fields-count')).toHaveText('8');
    const fieldRowCount = await page
      .locator('button[data-testid^="project-fields-row-"]')
      .count();
    expect(fieldRowCount).toBe(8);

    // At least one metric chip and one dimension chip are rendered.
    const metricChips = page.locator('button[data-field-type="metric"]');
    const dimensionChips = page.locator('button[data-field-type="dimension"]');
    expect(await metricChips.count()).toBe(5);
    expect(await dimensionChips.count()).toBe(3);

    // --- 3. Clicking a relation row opens its per-object editor tab. --------
    await page.getByTestId(`project-relations-row-${RELATION_NAME}`).click();

    // A tab for the relation joins the strip and becomes active.
    await expect(
      page.getByTestId(`workspace-tab-relation:${RELATION_NAME}`)
    ).toBeVisible({ timeout: WAIT });

    // The workspace store's active object follows the opened relation.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const s =
              window.useStore && window.useStore.getState && window.useStore.getState();
            return s ? s.workspaceActiveObject : undefined;
          }),
        { timeout: WAIT }
      )
      .toMatchObject({ type: 'relation', name: RELATION_NAME });

    await page.screenshot({
      path: 'e2e/stories/__screens__/vis1013-02-relation-tab.png',
      fullPage: true,
    });

    expect(errors, `no console / API errors: ${errors.join('\n')}`).toEqual([]);
  });
});
